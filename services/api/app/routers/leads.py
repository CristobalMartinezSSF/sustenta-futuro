"""Router for lead-related endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import AdminUser, require_admin
from app.database import get_client
from app.email import send_admin_notification, send_lead_confirmation
from app.enrichment import enrich_lead

limiter = Limiter(key_func=get_remote_address)
from app.models.lead import (
    LeadCreate,
    LeadCreateResponse,
    LeadDetail,
    LeadListResponse,
    LeadStatus,
    LeadStatusUpdate,
    LeadSummary,
    LeadUpdate,
    StatusHistoryEntry,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["leads"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SUMMARY_FIELDS = "id,full_name,email,company,service_interest,status,created_at"
DETAIL_FIELDS = (
    "id,full_name,email,phone,company,service_interest,message,source,"
    "industry,employee_range,referral_source,status,enrichment_data,"
    "cristobal_input,project_title,created_at,updated_at"
)


def _supabase_get(path: str, params: dict | None = None) -> list[dict]:
    """Execute a GET request against Supabase REST API."""
    try:
        with get_client() as client:
            response = client.get(path, params=params or {})
            response.raise_for_status()
    except Exception as exc:
        logger.error("Supabase GET %s failed: %s", path, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database query failed.",
        ) from exc
    return response.json()


def _supabase_post(path: str, data: dict) -> dict:
    """Execute a POST (insert) against Supabase REST API. Returns first row."""
    try:
        with get_client() as client:
            response = client.post(path, json=data)
            response.raise_for_status()
    except Exception as exc:
        logger.error("Supabase POST %s failed: %s", path, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database insert failed.",
        ) from exc
    rows = response.json()
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database returned empty response.",
        )
    return rows[0]


def _supabase_patch(path: str, data: dict, params: dict) -> dict:
    """Execute a PATCH (update) against Supabase REST API. Returns first row."""
    try:
        with get_client() as client:
            response = client.patch(path, json=data, params=params)
            response.raise_for_status()
    except Exception as exc:
        logger.error("Supabase PATCH %s failed: %s", path, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database update failed.",
        ) from exc
    rows = response.json()
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found.",
        )
    return rows[0]


# ---------------------------------------------------------------------------
# POST /leads/ — Public: submit a new lead
# ---------------------------------------------------------------------------


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    response_model=LeadCreateResponse,
    summary="Submit a new lead",
)
@limiter.limit("5/minute")
def create_lead(request: Request, payload: LeadCreate) -> LeadCreateResponse:
    """Accept a lead submission from the public contact form.

    Validates all fields via Pydantic (422 on failure).
    Inserts the record into Supabase using the service role key.
    Returns the new lead id and a confirmation message (201).
    """
    row = _supabase_post(
        "/leads",
        payload.model_dump(exclude_none=True, mode="json"),
    )

    # Send emails (non-blocking — failures are logged, never block the response)
    send_lead_confirmation(payload.full_name, payload.email)
    send_admin_notification(
        lead_name=payload.full_name,
        lead_email=payload.email,
        lead_company=payload.company,
        lead_service=payload.service_interest.value,
        lead_message=payload.message,
    )

    return LeadCreateResponse(
        id=row["id"],
        message="Lead received. We will be in touch soon.",
    )


# ---------------------------------------------------------------------------
# GET /leads/ — Admin: list leads with optional filters
# ---------------------------------------------------------------------------


@router.get(
    "/",
    response_model=LeadListResponse,
    summary="List leads with optional filters",
)
def list_leads(
    admin: AdminUser = Depends(require_admin),
    status_filter: LeadStatus | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> LeadListResponse:
    """Return a paginated list of leads, optionally filtered by status."""
    params: dict = {
        "select": SUMMARY_FIELDS,
        "order": "created_at.desc",
        "limit": str(limit),
        "offset": str(offset),
    }
    if status_filter:
        params["status"] = f"eq.{status_filter.value}"

    rows = _supabase_get("/leads", params)

    # Get total count for pagination
    count_params: dict = {"select": "id", "head": "true"}
    if status_filter:
        count_params["status"] = f"eq.{status_filter.value}"

    try:
        with get_client() as client:
            count_resp = client.get(
                "/leads",
                params=count_params,
                headers={"Prefer": "count=exact"},
            )
            count_resp.raise_for_status()
            total = int(count_resp.headers.get("content-range", "0/0").split("/")[-1])
    except Exception:
        total = len(rows)

    return LeadListResponse(
        data=[LeadSummary(**r) for r in rows],
        count=total,
    )


# ---------------------------------------------------------------------------
# GET /leads/{lead_id} — Admin: get lead detail
# ---------------------------------------------------------------------------


@router.get(
    "/{lead_id}",
    response_model=LeadDetail,
    summary="Get lead detail",
)
def get_lead(lead_id: str, admin: AdminUser = Depends(require_admin)) -> LeadDetail:
    """Return full details of a single lead."""
    rows = _supabase_get(
        "/leads",
        {"select": DETAIL_FIELDS, "id": f"eq.{lead_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found.",
        )
    return LeadDetail(**rows[0])


# ---------------------------------------------------------------------------
# PUT /leads/{lead_id} — Admin: update lead fields
# ---------------------------------------------------------------------------


@router.put(
    "/{lead_id}",
    response_model=LeadDetail,
    summary="Update lead fields",
)
def update_lead(lead_id: str, payload: LeadUpdate, admin: AdminUser = Depends(require_admin)) -> LeadDetail:
    """Update editable fields on a lead (admin action)."""
    data = payload.model_dump(exclude_none=True, mode="json")
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update.",
        )
    row = _supabase_patch(
        "/leads",
        data,
        {"id": f"eq.{lead_id}", "select": DETAIL_FIELDS},
    )
    return LeadDetail(**row)


# ---------------------------------------------------------------------------
# PUT /leads/{lead_id}/status — Admin: change lead status with note
# ---------------------------------------------------------------------------


@router.put(
    "/{lead_id}/status",
    response_model=LeadDetail,
    summary="Change lead status",
)
def update_lead_status(lead_id: str, payload: LeadStatusUpdate, admin: AdminUser = Depends(require_admin)) -> LeadDetail:
    """Change the status of a lead. Requires a mandatory note explaining the change.

    The status transition is recorded in lead_status_history via a DB trigger,
    then we manually update the note on the history entry.
    """
    # Update the lead status (triggers history insert)
    row = _supabase_patch(
        "/leads",
        {"status": payload.new_status.value},
        {"id": f"eq.{lead_id}", "select": DETAIL_FIELDS},
    )

    # Update the latest history entry with the note
    history_rows = _supabase_get(
        "/lead_status_history",
        {
            "lead_id": f"eq.{lead_id}",
            "order": "changed_at.desc",
            "limit": "1",
            "select": "id",
        },
    )
    if history_rows:
        try:
            with get_client() as client:
                client.patch(
                    "/lead_status_history",
                    json={"notes": payload.note},
                    params={"id": f"eq.{history_rows[0]['id']}"},
                )
        except Exception as exc:
            logger.warning("Could not update history note: %s", exc)

    return LeadDetail(**row)


# ---------------------------------------------------------------------------
# GET /leads/{lead_id}/history — Admin: status change history
# ---------------------------------------------------------------------------


@router.get(
    "/{lead_id}/history",
    response_model=list[StatusHistoryEntry],
    summary="Get lead status history",
)
def get_lead_history(lead_id: str, admin: AdminUser = Depends(require_admin)) -> list[StatusHistoryEntry]:
    """Return the full status change history for a lead, newest first."""
    rows = _supabase_get(
        "/lead_status_history",
        {
            "lead_id": f"eq.{lead_id}",
            "order": "changed_at.desc",
            "select": "id,old_status,new_status,changed_by,notes,changed_at",
        },
    )
    return [StatusHistoryEntry(**r) for r in rows]


# ---------------------------------------------------------------------------
# POST /leads/{lead_id}/enrich — Admin: run enrichment on a lead
# ---------------------------------------------------------------------------


@router.post(
    "/{lead_id}/enrich",
    response_model=LeadDetail,
    summary="Enrich lead data",
)
def enrich_lead_endpoint(lead_id: str, admin: AdminUser = Depends(require_admin)) -> LeadDetail:
    """Run enrichment (email validation, company search, website scrape) on a lead.

    Stores results in enrichment_data and returns the updated lead.
    """
    # Fetch the lead
    rows = _supabase_get(
        "/leads",
        {"select": DETAIL_FIELDS, "id": f"eq.{lead_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found.",
        )
    lead = rows[0]

    # Run enrichment
    enrichment_data = enrich_lead(
        email=lead.get("email", ""),
        company=lead.get("company", ""),
        full_name=lead.get("full_name"),
        industry=lead.get("industry"),
    )

    # Store results
    row = _supabase_patch(
        "/leads",
        {"enrichment_data": enrichment_data},
        {"id": f"eq.{lead_id}", "select": DETAIL_FIELDS},
    )
    return LeadDetail(**row)
