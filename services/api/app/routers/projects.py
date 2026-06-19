"""Router for projects (Fase 4 — proposal → project).

A project is the development-level work entity. It is created by converting a
winning proposal (see proposals.convert_to_project) and exposes its own
lifecycle plus a listing for the execution Kanban.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import AdminUser, require_admin
from app.models.project import ProjectDetail, ProjectUpdate
from app.routers.leads import _supabase_get, _supabase_patch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])

PROJECT_FIELDS = "id,lead_id,proposal_id,name,status,started_at,created_at"


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
    """Update editable project fields (name, status)."""
    update: dict = {}
    if payload.name is not None:
        update["name"] = payload.name
    if payload.status is not None:
        update["status"] = payload.status.value
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
    return ProjectDetail(**row)
