"""Pydantic models for projects (maps to the `projects` table).

A project is a first-class work entity born from a winning proposal. It owns the
execution board (phases -> tasks/reports) and has its own lifecycle, separate
from the commercial proposal that originated it.
"""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel


class ProjectStatus(str, Enum):
    """Lifecycle of a development project."""

    ACTIVE = "active"
    PAUSED = "paused"
    DONE = "done"
    CANCELLED = "cancelled"


class ProjectUpdate(BaseModel):
    """Editable project fields."""

    name: str | None = None
    status: ProjectStatus | None = None


class ProjectDetail(BaseModel):
    """Full project representation."""

    id: UUID
    lead_id: UUID
    proposal_id: UUID | None = None
    name: str
    status: ProjectStatus
    started_at: datetime
    created_at: datetime
