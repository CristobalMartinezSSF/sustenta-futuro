"""Pydantic models for the lead resource."""

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class LeadCreate(BaseModel):
    """Payload accepted by POST /leads.

    Fields marked Optional are not required from the caller.
    All string fields are stripped of leading/trailing whitespace.
    """

    name: str = Field(..., min_length=1, max_length=200, strip_whitespace=True)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=50, strip_whitespace=True)
    company: str | None = Field(default=None, max_length=200, strip_whitespace=True)
    message: str | None = Field(default=None, max_length=2000, strip_whitespace=True)
    source: str | None = Field(default=None, max_length=100, strip_whitespace=True)


class LeadCreateResponse(BaseModel):
    """Response body returned after a successful lead creation."""

    id: UUID
    message: str
