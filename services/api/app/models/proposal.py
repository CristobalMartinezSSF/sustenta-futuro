"""Pydantic models for lead proposals (maps to the `lead_proposals` table)."""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel


class ProposalStatus(str, Enum):
    """Lifecycle of a generated proposal."""

    DRAFT = "draft"
    APPROVED = "approved"
    SENT = "sent"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class ProposalStatusUpdate(BaseModel):
    """Advance a proposal through its lifecycle."""

    status: ProposalStatus


class ProposalDetail(BaseModel):
    """Full proposal representation."""

    id: UUID
    lead_id: UUID
    evaluation_id: UUID | None = None
    pdf_storage_path: str | None = None
    status: ProposalStatus
    approved_by: UUID | None = None
    approved_at: datetime | None = None
    sent_at: datetime | None = None
    created_at: datetime
