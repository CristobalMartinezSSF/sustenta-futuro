"""Router for projects (Fase 4 — proposal → project).

A project is the development-level work entity. It is created by converting a
winning proposal (see proposals.convert_to_project) and exposes its own
lifecycle plus a listing for the execution Kanban.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AdminUser, require_admin
from app.email import send_project_completed_notification
from app.models.project import ProjectDetail, ProjectStatus, ProjectUpdate
from app.routers.leads import _supabase_get, _supabase_patch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])

PROJECT_FIELDS = "id,lead_id,proposal_id,name,status,started_at,finished_at,created_at"


def _notify_project_completed(project: dict) -> None:
    """Best-effort email to the team when a project is marked done. Never fatal."""
    try:
        lead_rows = _supabase_get(
            "/leads",
            {"select": "full_name,company", "id": f"eq.{project['lead_id']}", "limit": "1"},
        )
        lead = lead_rows[0] if lead_rows else {}
        send_project_completed_notification(
            project_name=project.get("name", "Proyecto"),
            lead_name=lead.get("full_name", ""),
            lead_company=lead.get("company", ""),
        )
    except Exception as exc:  # noqa: BLE001 — notification is best-effort
        logger.warning("Could not send project-completed email for %s: %s", project.get("id"), exc)


@router.get(
    "",
    response_model=list[ProjectDetail],
    summary="List all projects (newest first)",
)
def list_projects(admin: AdminUser = Depends(require_admin)) -> list[ProjectDetail]:
    """Return every project, most recently created first."""
    rows = _supabase_get(
        "/projects",
        {"select": PROJECT_FIELDS, "order": "created_at.desc"},
    )
    return [ProjectDetail(**r) for r in rows]


@router.get(
    "/{project_id}",
    response_model=ProjectDetail,
    summary="Get a single project",
)
def get_project(project_id: str, admin: AdminUser = Depends(require_admin)) -> ProjectDetail:
    """Return one project by id."""
    rows = _supabase_get(
        "/projects",
        {"select": PROJECT_FIELDS, "id": f"eq.{project_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return ProjectDetail(**rows[0])


@router.put(
    "/{project_id}",
    response_model=ProjectDetail,
    summary="Update a project's name and/or status",
)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    admin: AdminUser = Depends(require_admin),
) -> ProjectDetail:
    """Update editable project fields (name, status).

    Marking the project 'done' stamps finished_at and notifies the team;
    reopening it (any other status) clears finished_at.
    """
    rows = _supabase_get(
        "/projects",
        {"select": PROJECT_FIELDS, "id": f"eq.{project_id}", "limit": "1"},
    )
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    current = rows[0]

    update: dict = {}
    if payload.name is not None:
        update["name"] = payload.name

    newly_done = False
    if payload.status is not None:
        update["status"] = payload.status.value
        if payload.status == ProjectStatus.DONE and current["status"] != ProjectStatus.DONE.value:
            update["finished_at"] = datetime.now(timezone.utc).isoformat()
            newly_done = True
        elif payload.status != ProjectStatus.DONE and current.get("finished_at"):
            update["finished_at"] = None

    if not update:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nothing to update.",
        )

    row = _supabase_patch(
        "/projects",
        update,
        {"id": f"eq.{project_id}", "select": PROJECT_FIELDS},
    )

    if newly_done:
        _notify_project_completed(row)

    return ProjectDetail(**row)
