"""Authentication and authorization for admin endpoints.

Uses Supabase Auth JWT tokens verified via JWKS (ES256 asymmetric keys).
Admin users must exist in admin_profiles table with role 'admin' or 'supervisor'.
"""

import logging

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.database import get_client

logger = logging.getLogger(__name__)

_bearer_scheme = HTTPBearer(auto_error=False)

# JWKS client caches the public keys automatically
_jwks_url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
_jwks_client = PyJWKClient(_jwks_url, cache_keys=True, lifespan=3600)


class AdminUser:
    """Represents an authenticated admin user."""

    def __init__(self, user_id: str, email: str, role: str, full_name: str | None = None):
        self.user_id = user_id
        self.email = email
        self.role = role
        self.full_name = full_name


def _decode_jwt(token: str) -> dict:
    """Decode and verify a Supabase JWT token using JWKS (ES256)."""
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired.",
        )
    except jwt.InvalidTokenError as exc:
        logger.warning("Invalid JWT: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token.",
        )


def _get_admin_profile(email: str) -> dict | None:
    """Look up an admin profile by email address."""
    try:
        with get_client() as client:
            response = client.get(
                "/admin_profiles",
                params={
                    "email": f"eq.{email}",
                    "select": "id,email,role,full_name",
                    "limit": "1",
                },
            )
            response.raise_for_status()
    except Exception as exc:
        logger.error("Failed to fetch admin profile: %s", exc)
        return None
    rows = response.json()
    return rows[0] if rows else None


async def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AdminUser:
    """FastAPI dependency that enforces admin authentication.

    Verifies the JWT via JWKS, then checks the user exists in admin_profiles.
    Returns an AdminUser with role info.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = _decode_jwt(credentials.credentials)

    sub = payload.get("sub")
    email = payload.get("email", "")
    if not sub or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing subject or email.",
        )

    profile = _get_admin_profile(email)
    if not profile:
        logger.warning("Auth attempt by non-admin user: %s (%s)", sub, email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Admin profile required.",
        )

    return AdminUser(
        user_id=sub,
        email=email,
        role=profile["role"],
        full_name=profile.get("full_name"),
    )
