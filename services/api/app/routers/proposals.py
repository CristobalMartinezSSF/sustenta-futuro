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
from app.database import get_client
from app.email import send_proposal_to_client
from app.models.project import ProjectDetail
from app.models.proposal import (
    ProposalCreate,
    ProposalDetail,
    ProposalStatus,
    ProposalStatusUpdate,
    ProposalWithSnapshot,
)
from app.proposal_pdf import build_proposal_pdf
from app.routers.evaluations import _advance_lead_status
from app.routers.leads import DETAIL_FIELDS, _supabase_get, _supabase_patch, _supabase_post

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["proposals"])

PROPOSAL_FIELDS = (
    "id,lead_id,evaluation_id,pdf_storage_path,status,version,is_principal,title,"
    "approved_by,approved_at,sent_at,created_at"
)


def _build_snapshot(lead: dict, evaluation: dict, notes: list[dict]) -> dict:
    """Freeze the lead's evaluation ficha + notes + basics into an immutable
    snapshot. This is what makes each proposal a Git-like version: editing the
    live ficha afterwards never changes an already-created proposal."""
    return {
        "evaluation": evaluation,
        "notes": [
            {
                "content": n.get("content"),
                "created_at": n.get("created_at"),
                "created_by": n.get("created_by"),
            }
            for n in notes
        ],
        "lead": {
            "full_name": lead.get("full_name"),
            "company": lead.get("company"),
            "email": lead.get("email"),
        },
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }


def _derive_project_name(proposal: dict) -> str:
    """Pick a human-readable project name when converting a proposal.

    Preference: snapshot's project_title -> proposal title -> lead company name
    -> a safe fallback.
    """
    snapshot = proposal.get("snapshot") or {}
    evaluation = snapshot.get("evaluation") or {}
    lead_basics = snapshot.get("lead") or {}
    return (
        evaluation.get("project_title")
        or proposal.get("title")
        or lead_basics.get("company")
        or "Proyecto sin título"
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
    summary="Create a new proposal version (snapshot of the current ficha)",
)
def create_proposal(
    lead_id: str,
    payload: ProposalCreate | None = None,
    admin: AdminUser = Depends(require_admin),
) -> ProposalDetail:
    """Create a new proposal version for the lead.

    Captures a frozen snapshot of the current evaluation ficha + notes, assigns
    the next correlative version, and marks the very first version as principal.
    """
    lead, evaluation = _get_lead_and_evaluation(lead_id)

    existing = _supabase_get(
        "/lead_proposals",
        {"select": "version", "lead_id": f"eq.{lead_id}",
         "order": "version.desc", "limit": "1"},
    )
    next_version = (existing[0]["version"] + 1) if existing else 1
    is_first = not existing

    notes = _supabase_get(
        "/lead_notes",
        {"select": "content,created_at,created_by", "lead_id": f"eq.{lead_id}",
         "order": "created_at.asc"},
    )
    snapshot = _build_snapshot(lead, evaluation, notes)
    title = (payload.title if payload else None) or f"Versión {next_version}"

    row = _supabase_post(
        "/lead_proposals",
        {
            "lead_id": lead_id,
            "evaluation_id": evaluation["id"],
            "status": ProposalStatus.DRAFT.value,
            "version": next_version,
            "is_principal": is_first,
            "title": title,
            "snapshot": snapshot,
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
    """Return all proposal versions for a lead, newest version first."""
    rows = _supabase_get(
        "/lead_proposals",
        {"select": PROPOSAL_FIELDS, "lead_id": f"eq.{lead_id}", "order": "version.desc"},
    )
    return [ProposalDetail(**r) for r in rows]


# ---------------------------------------------------------------------------
# PUT /leads/{lead_id}/proposal/{proposal_id}/principal  — set principal
# ---------------------------------------------------------------------------


@router.put(
    "/{lead_id}/proposal/{proposal_id}/principal",
    response_model=ProposalDetail,
    summary="Mark a proposal version as the lead's principal",
)
def set_principal(
    lead_id: str, proposal_id: str, admin: AdminUser = Depends(require_admin)
) -> ProposalDetail:
    """Make this version the lead's principal (the one shown by default).

    Unsets the current principal first to respect the one-principal-per-lead
    unique index, then promotes the target version.
    """
    # Unset any current principal for this lead (tolerates zero matches).
    try:
        with get_client() as client:
            client.patch(
                "/lead_proposals",
                params={"lead_id": f"eq.{lead_id}", "is_principal": "eq.true"},
                json={"is_principal": False},
            )
    except Exception as exc:  # pragma: no cover - network/db failure
        logger.error("Failed to unset principal for lead %s: %s", lead_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update principal proposal.",
        ) from exc

    row = _supabase_patch(
        "/lead_proposals",
        {"is_principal": True},
        {"id": f"eq.{proposal_id}", "lead_id": f"eq.{lead_id}", "select": PROPOSAL_FIELDS},
    )
    return ProposalDetail(**row)


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
# GET /leads/{lead_id}/proposal/{proposal_id}  — one version with its snapshot
# (declared after /proposal/pdf so the literal "pdf" route wins)
# ---------------------------------------------------------------------------


@router.get(
    "/{lead_id}/proposal/{proposal_id}",
    response_model=ProposalWithSnapshot,
    summary="Get a single proposal version including its frozen snapshot",
)
def get_proposal(
    lead_id: str, proposal_id: str, admin: AdminUser = Depends(require_admin)
) -> ProposalWithSnapshot:
    """Return one proposal version with its immutable snapshot (read-only view)."""
    rows = _supabase_get(
        "/lead_proposals",
        {"select": "*", "id": f"eq.{proposal_id}",
         "lead_id": f"eq.{lead_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")
    return ProposalWithSnapshot(**rows[0])


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


# ---------------------------------------------------------------------------
# POST /leads/{lead_id}/proposal/{proposal_id}/send  — email proposal to client
# ---------------------------------------------------------------------------


@router.post(
    "/{lead_id}/proposal/{proposal_id}/send",
    response_model=ProposalDetail,
    summary="Email the proposal PDF to the client and advance the lead",
)
def send_proposal(
    lead_id: str, proposal_id: str, admin: AdminUser = Depends(require_admin)
) -> ProposalDetail:
    """Send the proposal to the client by email and mark it as sent.

    Generates the institutional PDF, emails it to the lead with a meeting CTA,
    and only on successful delivery stamps ``sent_at``, sets the proposal status
    to ``sent`` and advances the lead to ``proposal_sent``. If the email fails
    the proposal is left untouched so the action can be safely retried.
    """
    lead, evaluation = _get_lead_and_evaluation(lead_id)

    # Make sure the proposal belongs to this lead before sending anything.
    rows = _supabase_get(
        "/lead_proposals",
        {"select": "id,title", "id": f"eq.{proposal_id}",
         "lead_id": f"eq.{lead_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")

    client_email = lead.get("email")
    if not client_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The lead has no email address to send the proposal to.",
        )

    pdf_bytes = build_proposal_pdf(lead, evaluation)
    project_title = (
        evaluation.get("project_title") or rows[0].get("title") or lead.get("company") or ""
    )

    ok = send_proposal_to_client(
        lead_name=lead.get("full_name") or "",
        lead_email=client_email,
        project_title=project_title,
        pdf_bytes=pdf_bytes,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo enviar el correo al cliente. Intenta nuevamente.",
        )

    now = datetime.now(timezone.utc).isoformat()
    row = _supabase_patch(
        "/lead_proposals",
        {"status": ProposalStatus.SENT.value, "sent_at": now},
        {"id": f"eq.{proposal_id}", "lead_id": f"eq.{lead_id}", "select": PROPOSAL_FIELDS},
    )
    _advance_lead_status(lead_id, "proposal_sent", "Propuesta enviada al cliente")

    return ProposalDetail(**row)


# ---------------------------------------------------------------------------
# POST /leads/{lead_id}/proposal/{proposal_id}/convert  — proposal -> project
# ---------------------------------------------------------------------------


@router.post(
    "/{lead_id}/proposal/{proposal_id}/convert",
    response_model=ProjectDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Convert a winning proposal into a development project",
)
def convert_to_project(
    lead_id: str, proposal_id: str, admin: AdminUser = Depends(require_admin)
) -> ProjectDetail:
    """Turn a winning proposal into a first-class project.

    Marks the proposal as accepted, creates the project (name taken from the
    snapshot's project_title), and advances the lead to 'won'. Idempotent: if a
    project already exists for this proposal, the existing one is returned.
    """
    rows = _supabase_get(
        "/lead_proposals",
        {"select": "id,lead_id,title,snapshot", "id": f"eq.{proposal_id}",
         "lead_id": f"eq.{lead_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proposal not found.")
    proposal = rows[0]

    # Idempotency: a proposal can back at most one project.
    existing = _supabase_get(
        "/projects",
        {"select": "id,lead_id,proposal_id,name,status,started_at,created_at",
         "proposal_id": f"eq.{proposal_id}", "limit": "1"},
    )
    if existing:
        return ProjectDetail(**existing[0])

    name = _derive_project_name(proposal)

    # Mark the proposal as the accepted (winning) version.
    _supabase_patch(
        "/lead_proposals",
        {"status": ProposalStatus.ACCEPTED.value},
        {"id": f"eq.{proposal_id}", "lead_id": f"eq.{lead_id}", "select": "id"},
    )

    project = _supabase_post(
        "/projects",
        {
            "lead_id": lead_id,
            "proposal_id": proposal_id,
            "name": name,
            "status": "active",
        },
    )

    _advance_lead_status(lead_id, "won", "Propuesta aceptada — proyecto creado")

    return ProjectDetail(**project)
