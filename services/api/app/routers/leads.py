"""Router for lead-related endpoints."""

import logging

from fastapi import APIRouter, HTTPException, status

from app.database import get_client
from app.models.lead import LeadCreate, LeadCreateResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/leads", tags=["leads"])


def _insert_lead(payload: LeadCreate) -> dict:
    """Insert a lead record into Supabase via REST API and return the created row.

    Args:
        payload: Validated lead data from the request body.

    Returns:
        The raw row dict returned by Supabase.

    Raises:
        HTTPException: 500 if the database operation fails.
    """
    try:
        with get_client() as client:
            response = client.post(
                "/leads",
                json=payload.model_dump(exclude_none=True),
            )
            response.raise_for_status()
    except Exception as exc:
        logger.error("Supabase insert failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save lead. Please try again later.",
        ) from exc

    data = response.json()
    if not data:
        logger.error("Supabase returned empty data after insert")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save lead. Please try again later.",
        )

    return data[0]


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    response_model=LeadCreateResponse,
    summary="Submit a new lead",
)
def create_lead(payload: LeadCreate) -> LeadCreateResponse:
    """Accept a lead submission from the public contact form.

    - Validates all fields via Pydantic (422 on failure).
    - Inserts the record into Supabase using the service role key.
    - Returns the new lead id and a confirmation message (201).
    - Returns 500 if the database operation fails.
    """
    row = _insert_lead(payload)
    return LeadCreateResponse(
        id=row["id"],
        message="Lead received. We will be in touch soon.",
    )
