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


class ProposalCreate(BaseModel):
    """Optional metadata when creating a new proposal version."""

    title: str | None = None


class ProposalDetail(BaseModel):
    """Full proposal representation (without the heavy snapshot blob)."""

    id: UUID
    lead_id: UUID
    evaluation_id: UUID | None = None
    pdf_storage_path: str | None = None
    status: ProposalStatus
    version: int
    is_principal: bool = False
    title: str | None = None
    approved_by: UUID | None = None
    approved_at: datetime | None = None
    sent_at: datetime | None = None
    created_at: datetime


class ProposalWithSnapshot(ProposalDetail):
    """A single proposal including its frozen snapshot (eval + notes + lead)."""

    snapshot: dict | None = None
