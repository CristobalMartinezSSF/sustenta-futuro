"""Pydantic models for the technical-economic evaluation of a lead.

Maps to the `lead_evaluations` table (migration 005). One evaluation per lead
(UNIQUE on lead_id). The `margin` column is GENERATED in Postgres
(client_price - internal_cost) and is therefore read-only here.
"""

import re
from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_tags(value: str) -> str:
    """Remove HTML/script tags from a string."""
    return _TAG_RE.sub("", value)


class Complexity(str, Enum):
    """Project complexity buckets."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Verdict(str, Enum):
    """Evaluation verdict. Decided by the supervisor (Hector)."""

    PENDING = "pending"
    VIABLE = "viable"
    NOT_VIABLE = "not_viable"


# ---------------------------------------------------------------------------
# Upsert (create / update the ficha)
# ---------------------------------------------------------------------------


class EvaluationUpsert(BaseModel):
    """Editable fields of the evaluation ficha (admin draft).

    Every field is optional: the ficha is filled progressively. `margin` is
    intentionally absent — it is computed by the database.
    """

    project_title: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=5000)
    functionalities: list[str] | None = None
    # Stack rows are {layer, tech, rationale} dicts (3-column proposal table).
    # Plain strings are still accepted for backward compatibility.
    stack: list[dict] | list[str] | None = None
    phases: list[dict] | None = None
    estimated_hours: int | None = Field(default=None, ge=0, le=100000)
    internal_cost: float | None = Field(default=None, ge=0)
    client_price: float | None = Field(default=None, ge=0)
    price_currency: str | None = Field(default=None, max_length=10)
    price_breakdown: list[dict] | None = None
    monthly_maintenance: float | None = Field(default=None, ge=0)
    payment_method: str | None = Field(default=None, max_length=300)
    total_duration: str | None = Field(default=None, max_length=100)
    offer_validity: int | None = Field(default=None, ge=1, le=365)
    complexity: Complexity | None = None
    risks: str | None = Field(default=None, max_length=5000)
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator(
        "project_title", "description", "payment_method",
        "total_duration", "risks", "notes", "price_currency",
        mode="before",
    )
    @classmethod
    def sanitize_html(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return _strip_tags(v)
        return v


class EvaluationVerdict(BaseModel):
    """Set the verdict on an evaluation. Records who and when."""

    verdict: Verdict
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("notes", mode="before")
    @classmethod
    def sanitize_html(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return _strip_tags(v)
        return v


# ---------------------------------------------------------------------------
# Response / Read
# ---------------------------------------------------------------------------


class EvaluationSuggestions(BaseModel):
    """Suggested ficha values derived from past projects of the same type.

    Numeric fields are medians (robust to outliers); complexity and currency
    are the most frequent value. `sample_size` is how many past projects of the
    same service type backed the suggestion.
    """

    service_type: str | None = None
    sample_size: int = 0
    client_price: float | None = None
    internal_cost: float | None = None
    estimated_hours: int | None = None
    monthly_maintenance: float | None = None
    complexity: str | None = None
    price_currency: str | None = None


class StackSuggestion(BaseModel):
    """Curated default tech stack for a lead's service type.

    Deterministic (no AI): the rows come from a hand-curated catalog keyed by
    service type. Pre-fills the editable 3-column stack table of the ficha.
    """

    service_type: str | None = None
    stack: list[dict] = []


class EvaluationAIDraft(BaseModel):
    """AI-drafted prose fields (description + functionalities) for the ficha."""

    service_type: str | None = None
    based_on: int = 0
    model: str
    description: str = ""
    functionalities: list[str] = []


class EvaluationDetail(BaseModel):
    """Full evaluation representation, including computed margin."""

    id: UUID
    lead_id: UUID
    project_title: str | None = None
    description: str | None = None
    functionalities: list | None = None
    stack: list | None = None
    phases: list | None = None
    estimated_hours: int | None = None
    internal_cost: float | None = None
    client_price: float | None = None
    price_currency: str | None = None
    price_breakdown: list | None = None
    monthly_maintenance: float | None = None
    payment_method: str | None = None
    total_duration: str | None = None
    offer_validity: int | None = None
    complexity: str | None = None
    margin: float | None = None
    risks: str | None = None
    verdict: str
    verdict_by: UUID | None = None
    verdict_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
