"""Router for public landing page configuration endpoints."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.database import get_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/landing", tags=["landing"])

TEXTURE_SECTIONS = [
    "navbar",
    "hero",
    "sincon",
    "producto",
    "proceso",
    "testimonios",
    "diferenciadores",
    "nosotros",
    "legal",
    "faq",
    "contacto",
]

MAP_TYPES = ["base", "text_color"]


@router.get("/textures", summary="Get texture config for all landing sections")
def get_textures() -> dict[str, Any]:
    """Return texture URLs for all landing page sections.

    Reads from landing_config where section='textures'.
    Returns a dict keyed by section id, each with base/normal/roughness/spec URLs.
    """
    try:
        with get_client() as client:
            response = client.get(
                "/landing_config",
                params={"section": "eq.textures", "select": "key,value"},
            )
            response.raise_for_status()
    except Exception as exc:
        logger.error("Failed to fetch texture config: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not fetch texture configuration.",
        ) from exc

    rows = response.json()

    # Build result: { hero: { base: url, normal: url, ... }, ... }
    result: dict[str, dict[str, str]] = {s: {} for s in TEXTURE_SECTIONS}

    for row in rows:
        key: str = row.get("key", "")
        value: str = row.get("value") or ""
        if not value:
            continue
        for section in TEXTURE_SECTIONS:
            for map_type in MAP_TYPES:
                if key == f"{section}_{map_type}":
                    result[section][map_type] = value

    return result
