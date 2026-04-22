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

@router.get("/textures", summary="Get texture config for all landing sections")
def get_textures() -> dict[str, Any]:
    """Return texture and color config for all landing page sections.

    Reads from landing_config where section='textures'.
    Returns a dict keyed by section id with all stored map types (base, text_color,
    element-specific colors like brand_color, h1_color, etc.).
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

    # Build result: { hero: { base: url, h1_color: '#fff', ... }, ... }
    result: dict[str, dict[str, str]] = {s: {} for s in TEXTURE_SECTIONS}

    for row in rows:
        key: str = row.get("key", "")
        value: str = row.get("value") or ""
        if not value:
            continue
        for section in TEXTURE_SECTIONS:
            prefix = f"{section}_"
            if key.startswith(prefix):
                map_key = key[len(prefix):]
                result[section][map_key] = value
                break

    return result
