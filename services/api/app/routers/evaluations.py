"""Router for the technical-economic evaluation (ficha) of a lead.

Backs Fase 3 of Etapa 2. One evaluation per lead, stored in `lead_evaluations`.
The supervisor (Hector) records the verdict; a 'viable' verdict optionally
advances the lead to the 'viable' pipeline status.
"""

import logging
import statistics
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AdminUser, require_admin
from app.database import get_client
from app.models.evaluation import (
    EvaluationAIDraft,
    EvaluationDetail,
    EvaluationSuggestions,
    EvaluationUpsert,
    EvaluationVerdict,
    StackSuggestion,
    Verdict,
)
from app.proposal_ai import PROPOSAL_AI_MODEL, ProposalAIError, generate_proposal_text
from app.stack_catalog import default_stack_for

# Reuse the thin Supabase REST helpers defined in the leads router.
# leads.py does not import this module, so there is no circular import.
from app.routers.leads import _supabase_get, _supabase_patch, _supabase_post

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["evaluations"])

EVAL_FIELDS = "*"


def _get_evaluation_row(lead_id: str) -> dict | None:
    """Return the single evaluation row for a lead, or None if absent."""
    rows = _supabase_get(
        "/lead_evaluations",
        {"select": EVAL_FIELDS, "lead_id": f"eq.{lead_id}", "limit": "1"},
    )
    return rows[0] if rows else None


# ---------------------------------------------------------------------------
# GET /leads/{lead_id}/evaluation
# ---------------------------------------------------------------------------


@router.get(
    "/{lead_id}/evaluation",
    response_model=EvaluationDetail,
    summary="Get the technical-economic evaluation of a lead",
)
def get_evaluation(lead_id: str, admin: AdminUser = Depends(require_admin)) -> EvaluationDetail:
    """Return the evaluation ficha for a lead (404 if not yet created)."""
    row = _get_evaluation_row(lead_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No evaluation exists for this lead yet.",
        )
    return EvaluationDetail(**row)


# ---------------------------------------------------------------------------
# GET /leads/{lead_id}/evaluation/suggestions  — historical auto-fill
# ---------------------------------------------------------------------------


def _median_num(values: list) -> float | None:
    """Median of the present numeric values, or None if there are none."""
    nums = [float(v) for v in values if isinstance(v, (int, float))]
    return round(statistics.median(nums), 2) if nums else None


def _most_common(values: list) -> str | None:
    """Most frequent non-empty value, or None."""
    present = [v for v in values if v]
    return Counter(present).most_common(1)[0][0] if present else None


def _compute_suggestions(evaluations: list[dict], service_type: str | None) -> EvaluationSuggestions:
    """Build median/mode suggestions from past project evaluation snapshots."""
    if not evaluations:
        return EvaluationSuggestions(service_type=service_type, sample_size=0)

    hours = _median_num([e.get("estimated_hours") for e in evaluations])
    return EvaluationSuggestions(
        service_type=service_type,
        sample_size=len(evaluations),
        client_price=_median_num([e.get("client_price") for e in evaluations]),
        internal_cost=_median_num([e.get("internal_cost") for e in evaluations]),
        estimated_hours=int(hours) if hours is not None else None,
        monthly_maintenance=_median_num([e.get("monthly_maintenance") for e in evaluations]),
        complexity=_most_common([e.get("complexity") for e in evaluations]),
        price_currency=_most_common([e.get("price_currency") for e in evaluations]),
    )


def _same_type_evaluations(service_type: str | None) -> list[dict]:
    """Collect evaluation snapshots of won projects whose lead shares the given
    service type. Returns the list of frozen `evaluation` dicts."""
    if not service_type:
        return []
    # Won projects carry their proposal's frozen snapshot (the delivered ficha)
    # and link to the originating lead (for its service type).
    projects = _supabase_get(
        "/projects",
        {"select": "id,leads(service_interest),lead_proposals(snapshot)"},
    )
    evaluations: list[dict] = []
    for p in projects:
        lead = p.get("leads") or {}
        if lead.get("service_interest") != service_type:
            continue
        proposal = p.get("lead_proposals") or {}
        snapshot = proposal.get("snapshot") or {}
        evaluation = snapshot.get("evaluation")
        if isinstance(evaluation, dict):
            evaluations.append(evaluation)
    return evaluations


@router.get(
    "/{lead_id}/evaluation/suggestions",
    response_model=EvaluationSuggestions,
    summary="Suggest ficha values from past projects of the same service type",
)
def get_evaluation_suggestions(
    lead_id: str, admin: AdminUser = Depends(require_admin)
) -> EvaluationSuggestions:
    """Estimate ficha values from the frozen snapshots of won projects whose
    lead shares this lead's service_interest. Returns medians + sample size."""
    lead_rows = _supabase_get(
        "/leads", {"select": "service_interest", "id": f"eq.{lead_id}", "limit": "1"}
    )
    if not lead_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")
    service_type = lead_rows[0].get("service_interest")
    if not service_type:
        return EvaluationSuggestions(service_type=None, sample_size=0)

    return _compute_suggestions(_same_type_evaluations(service_type), service_type)


@router.get(
    "/{lead_id}/evaluation/stack-suggestions",
    response_model=StackSuggestion,
    summary="Curated default tech stack for the lead's service type",
)
def get_stack_suggestions(
    lead_id: str, admin: AdminUser = Depends(require_admin)
) -> StackSuggestion:
    """Return a curated default 3-column stack based on the lead's service type.

    Deterministic, editable starting point for the ficha's stack table. Falls
    back to a generic stack for unknown/missing service types.
    """
    lead_rows = _supabase_get(
        "/leads", {"select": "service_interest", "id": f"eq.{lead_id}", "limit": "1"}
    )
    if not lead_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")
    service_type = lead_rows[0].get("service_interest")
    return StackSuggestion(
        service_type=service_type,
        stack=default_stack_for(service_type),
    )


@router.get(
    "/{lead_id}/evaluation/ai-suggestions",
    response_model=EvaluationAIDraft,
    summary="Draft description + functionalities with AI, grounded on past projects",
)
def get_evaluation_ai_suggestions(
    lead_id: str, admin: AdminUser = Depends(require_admin)
) -> EvaluationAIDraft:
    """Use Gemini to draft the prose fields (description + functionalities),
    grounded on the lead's context and past projects of the same type."""
    lead_rows = _supabase_get(
        "/leads",
        {"select": "service_interest,company,industry,message",
         "id": f"eq.{lead_id}", "limit": "1"},
    )
    if not lead_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found.")
    lead = lead_rows[0]
    service_type = lead.get("service_interest")

    history = _same_type_evaluations(service_type)
    try:
        draft = generate_proposal_text(lead, history)
    except ProposalAIError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    return EvaluationAIDraft(
        service_type=service_type,
        based_on=len(history),
        model=PROPOSAL_AI_MODEL,
        description=draft["description"],
        functionalities=draft["functionalities"],
    )


# ---------------------------------------------------------------------------
# PUT /leads/{lead_id}/evaluation  — create or update the ficha
# ---------------------------------------------------------------------------


@router.put(
    "/{lead_id}/evaluation",
    response_model=EvaluationDetail,
    summary="Create or update the evaluation ficha",
)
def upsert_evaluation(
    lead_id: str,
    payload: EvaluationUpsert,
    admin: AdminUser = Depends(require_admin),
) -> EvaluationDetail:
    """Create the evaluation if absent, otherwise patch the provided fields.

    `margin` is computed by the database and is never written here.
    """
    # Ensure the lead exists (clear 404 instead of a FK error).
    lead_rows = _supabase_get(
        "/leads", {"select": "id,status", "id": f"eq.{lead_id}", "limit": "1"}
    )
    if not lead_rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found."
        )

    data = payload.model_dump(exclude_none=True, mode="json")
    existing = _get_evaluation_row(lead_id)

    if existing is None:
        data["lead_id"] = lead_id
        row = _supabase_post("/lead_evaluations", data)
    else:
        if not data:
            return EvaluationDetail(**existing)
        row = _supabase_patch(
            "/lead_evaluations",
            data,
            {"lead_id": f"eq.{lead_id}", "select": EVAL_FIELDS},
        )

    # Move the lead into 'evaluating' once an evaluation is being worked on,
    # unless it is already further along or closed.
    current_status = lead_rows[0].get("status")
    if current_status in ("new", "reviewing", "pending_approval", "contacted"):
        _advance_lead_status(lead_id, "evaluating", "Ficha de evaluación iniciada")

    return EvaluationDetail(**row)


# ---------------------------------------------------------------------------
# PUT /leads/{lead_id}/evaluation/verdict  — supervisor decision
# ---------------------------------------------------------------------------


@router.put(
    "/{lead_id}/evaluation/verdict",
    response_model=EvaluationDetail,
    summary="Record the viability verdict (supervisor action)",
)
def set_verdict(
    lead_id: str,
    payload: EvaluationVerdict,
    admin: AdminUser = Depends(require_admin),
) -> EvaluationDetail:
    """Record the viability verdict on an evaluation.

    Intended as Hector's (supervisor) approval gate. We allow any authenticated
    admin to record it for now — both production accounts currently carry the
    'admin' role — but we always persist `verdict_by` for accountability. Tighten
    to supervisor-only once roles are finalised.
    """
    if _get_evaluation_row(lead_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No evaluation exists for this lead yet.",
        )

    update: dict = {
        "verdict": payload.verdict.value,
        "verdict_by": admin.user_id,
        "verdict_at": datetime.now(timezone.utc).isoformat(),
    }
    if payload.notes is not None:
        update["notes"] = payload.notes

    row = _supabase_patch(
        "/lead_evaluations",
        update,
        {"lead_id": f"eq.{lead_id}", "select": EVAL_FIELDS},
    )

    # A 'viable' verdict advances the lead in the pipeline.
    if payload.verdict == Verdict.VIABLE:
        note = f"Evaluación marcada viable por {admin.full_name or admin.email}"
        _advance_lead_status(lead_id, "viable", note)

    return EvaluationDetail(**row)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _advance_lead_status(lead_id: str, new_status: str, note: str) -> None:
    """Update a lead's status and stamp the history note. Never fatal."""
    try:
        _supabase_patch(
            "/leads",
            {"status": new_status},
            {"id": f"eq.{lead_id}", "select": "id"},
        )
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
            with get_client() as client:
                client.patch(
                    "/lead_status_history",
                    json={"notes": note},
                    params={"id": f"eq.{history_rows[0]['id']}"},
                )
    except Exception as exc:  # noqa: BLE001 — status sync is best-effort
        logger.warning("Could not advance lead %s to %s: %s", lead_id, new_status, exc)
