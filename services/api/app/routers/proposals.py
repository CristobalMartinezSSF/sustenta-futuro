"""Router for lead proposals (Fase 3).

Generates the institutional PDF on demand from a lead + its evaluation, and
tracks the proposal lifecycle (draft -> approved -> sent -> accepted/rejected)
in the `lead_proposals` table.

PDF persistence to Supabase Storage is intentionally deferred: the document is
rendered on the fly for download/preview, and storage upload will be wired
together with email sending (currently blocked on Resend domain setup).
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.auth import AdminUser, require_admin
from app.models.proposal import ProposalDetail, ProposalStatus, ProposalStatusUpdate
from app.proposal_pdf import build_proposal_pdf
from app.routers.evaluations import _advance_lead_status
from app.routers.leads import DETAIL_FIELDS, _supabase_get, _supabase_patch, _supabase_post

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["proposals"])

PROPOSAL_FIELDS = (
    "id,lead_id,evaluation_id,pdf_storage_path,status,"
    "approved_by,approved_at,sent_at,created_at"
)


def _get_lead_and_evaluation(lead_id: str) -> tuple[dict, dict]:
    """Fetch a lead and its evaluation, raising 404 if either is missing."""
    lead_rows = _supabase_get(
        "/leads", {"select": DETAIL_FIELDS, "id": f"eq.{lead_id}", "limit": "1"}
    )
    if not lead_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")

    eval_rows = _supabase_get(
        "/lead_evaluations", {"select": "*", "lead_id": f"eq.{lead_id}", "limit": "1"}
    )
    if not eval_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot build a proposal without an evaluation. Create the ficha first.",
        )
    return lead_rows[0], eval_rows[0]


# ---------------------------------------------------------------------------
# POST /leads/{lead_id}/proposal  — create a draft proposal record
# ---------------------------------------------------------------------------


@router.post(
    "/{lead_id}/proposal",
    response_model=ProposalDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a draft proposal from the lead's evaluation",
)
def create_proposal(lead_id: str, admin: AdminUser = Depends(require_admin)) -> ProposalDetail:
    """Create a draft proposal linked to the lead's current evaluation."""
    _, evaluation = _get_lead_and_evaluation(lead_id)
    row = _supabase_post(
        "/lead_proposals",
        {
            "lead_id": lead_id,
            "evaluation_id": evaluation["id"],
            "status": ProposalStatus.DRAFT.value,
        },
    )
    return ProposalDetail(**row)


# ---------------------------------------------------------------------------
# GET /leads/{lead_id}/proposals  — list proposals for a lead
# ---------------------------------------------------------------------------


@router.get(
    "/{lead_id}/proposals",
    response_model=list[ProposalDetail],
    summary="List proposals for a lead",
)
def list_proposals(lead_id: str, admin: AdminUser = Depends(require_admin)) -> list[ProposalDetail]:
    """Return all proposals for a lead, newest first."""
    rows = _supabase_get(
        "/lead_proposals",
        {"select": PROPOSAL_FIELDS, "lead_id": f"eq.{lead_id}", "order": "created_at.desc"},
    )
    return [ProposalDetail(**r) for r in rows]


# ---------------------------------------------------------------------------
# GET /leads/{lead_id}/proposal/pdf  — render the proposal PDF on demand
# ---------------------------------------------------------------------------


@router.get(
    "/{lead_id}/proposal/pdf",
    summary="Render the proposal PDF for a lead",
    response_class=Response,
)
def get_proposal_pdf(lead_id: str, admin: AdminUser = Depends(require_admin)) -> Response:
    """Generate and stream the institutional proposal PDF for a lead."""
    lead, evaluation = _get_lead_and_evaluation(lead_id)
    pdf_bytes = build_proposal_pdf(lead, evaluation)
    filename = f"propuesta-{lead_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# PUT /leads/{lead_id}/proposal/{proposal_id}  — advance lifecycle
# ---------------------------------------------------------------------------


@router.put(
    "/{lead_id}/proposal/{proposal_id}",
    response_model=ProposalDetail,
    summary="Update a proposal's status",
)
def update_proposal_status(
    lead_id: str,
    proposal_id: str,
    payload: ProposalStatusUpdate,
    admin: AdminUser = Depends(require_admin),
) -> ProposalDetail:
    """Advance a proposal through its lifecycle.

    'approved' stamps approver + timestamp. 'sent' stamps sent_at and advances
    the lead to the 'proposal_sent' pipeline status.
    """
    now = datetime.now(timezone.utc).isoformat()
    update: dict = {"status": payload.status.value}

    if payload.status == ProposalStatus.APPROVED:
        update["approved_by"] = admin.user_id
        update["approved_at"] = now
    elif payload.status == ProposalStatus.SENT:
        update["sent_at"] = now

    row = _supabase_patch(
        "/lead_proposals",
        update,
        {"id": f"eq.{proposal_id}", "lead_id": f"eq.{lead_id}", "select": PROPOSAL_FIELDS},
    )

    if payload.status == ProposalStatus.SENT:
        _advance_lead_status(lead_id, "proposal_sent", "Propuesta enviada al cliente")

    return ProposalDetail(**row)
