"""Pydantic models for the lead resource."""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class LeadStatus(str, Enum):
    """Valid lead statuses for Etapa 2 pipeline."""

    NEW = "new"
    REVIEWING = "reviewing"
    PENDING_APPROVAL = "pending_approval"
    CONTACTED = "contacted"
    EVALUATING = "evaluating"
    VIABLE = "viable"
    PROPOSAL_SENT = "proposal_sent"
    WON = "won"
    LOST = "lost"


class ServiceInterest(str, Enum):
    """Options for the service_interest dropdown."""

    AUTOMATIZACIONES = "Automatizaciones"
    CHATBOTS = "Chatbots"
    ANALITICA_IA = "Analitica IA"
    LANDING_PAGES = "Landing pages"
    OTRO = "Otro"


class EmployeeRange(str, Enum):
    """Employee count ranges."""

    RANGE_1_10 = "1-10"
    RANGE_11_50 = "11-50"
    RANGE_51_200 = "51-200"
    RANGE_200_PLUS = "200+"


class ReferralSource(str, Enum):
    """How the lead found Sustenta Futuro."""

    GOOGLE = "Google"
    LINKEDIN = "LinkedIn"
    REFERIDO = "Referido"
    OTRO = "Otro"


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


class LeadCreate(BaseModel):
    """Payload accepted by POST /leads.

    6 required fields + 3 optional fields from the public form.
    """

    # Required (6)
    full_name: str = Field(..., min_length=1, max_length=200, strip_whitespace=True)
    email: EmailStr
    phone: str = Field(..., min_length=1, max_length=50, strip_whitespace=True)
    company: str = Field(..., min_length=1, max_length=200, strip_whitespace=True)
    service_interest: ServiceInterest
    message: str = Field(..., min_length=1, max_length=2000, strip_whitespace=True)

    # Optional (3)
    industry: str | None = Field(default=None, max_length=200, strip_whitespace=True)
    employee_range: EmployeeRange | None = None
    referral_source: ReferralSource | None = None

    # Hidden (set by frontend, not shown to user)
    source: str = Field(default="website", max_length=100)


class LeadCreateResponse(BaseModel):
    """Response body returned after a successful lead creation."""

    id: UUID
    message: str


# ---------------------------------------------------------------------------
# Response / Read
# ---------------------------------------------------------------------------


class LeadSummary(BaseModel):
    """Compact lead representation for list views."""

    id: UUID
    full_name: str
    email: str
    company: str | None
    service_interest: str | None
    status: LeadStatus
    created_at: datetime


class LeadDetail(BaseModel):
    """Full lead representation for detail view."""

    id: UUID
    full_name: str
    email: str
    phone: str | None
    company: str | None
    service_interest: str | None
    message: str | None
    source: str | None
    industry: str | None
    employee_range: str | None
    referral_source: str | None
    status: LeadStatus
    enrichment_data: dict | None = None
    cristobal_input: str | None = None
    project_title: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class LeadListResponse(BaseModel):
    """Paginated list of leads."""

    data: list[LeadSummary]
    count: int


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


class LeadUpdate(BaseModel):
    """Fields that can be updated on a lead (admin action)."""

    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    company: str | None = Field(default=None, max_length=200)
    service_interest: ServiceInterest | None = None
    message: str | None = Field(default=None, max_length=2000)
    industry: str | None = Field(default=None, max_length=200)
    employee_range: EmployeeRange | None = None
    referral_source: ReferralSource | None = None
    project_title: str | None = Field(default=None, max_length=300)
    cristobal_input: str | None = None


class LeadStatusUpdate(BaseModel):
    """Change lead status with a mandatory note."""

    new_status: LeadStatus
    note: str = Field(..., min_length=1, max_length=1000, strip_whitespace=True)


# ---------------------------------------------------------------------------
# Status history
# ---------------------------------------------------------------------------


class StatusHistoryEntry(BaseModel):
    """One status transition record."""

    id: UUID
    old_status: str | None
    new_status: str
    changed_by: UUID | None
    notes: str
    changed_at: datetime
