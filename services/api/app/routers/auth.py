"""Router for authentication endpoints."""

import logging

import httpx
from fastapi import APIRouter, HTTPException, Path, Request, status
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import AdminUser, require_admin
from app.config import settings
from fastapi import Depends

logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(prefix="/auth", tags=["auth"])

GOTRUE_URL = f"{settings.supabase_url}/auth/v1"
GOTRUE_ADMIN_URL = f"{GOTRUE_URL}/admin"


class LoginRequest(BaseModel):
    """Login credentials."""

    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Successful login response."""

    access_token: str
    refresh_token: str
    expires_in: int
    user_email: str
    user_role: str
    user_name: str | None


class RefreshRequest(BaseModel):
    """Token refresh payload."""

    refresh_token: str


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Admin login",
)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest) -> LoginResponse:
    """Authenticate an admin user via Supabase GoTrue.

    Verifies credentials, then checks the user has an admin_profiles entry.
    Returns JWT tokens on success.
    """
    # Authenticate with Supabase GoTrue
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{GOTRUE_URL}/token?grant_type=password",
                json={"email": payload.email, "password": payload.password},
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Content-Type": "application/json",
                },
            )
    except httpx.RequestError as exc:
        logger.error("GoTrue request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication service unavailable.",
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    data = resp.json()
    access_token = data.get("access_token", "")
    refresh_token = data.get("refresh_token", "")
    expires_in = data.get("expires_in", 3600)
    user_id = data.get("user", {}).get("id", "")

    # Verify user has admin profile
    from app.auth import _get_admin_profile

    profile = _get_admin_profile(payload.email)
    if not profile:
        logger.warning("Login by non-admin user: %s", payload.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. No admin profile found for this account.",
        )

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        user_email=payload.email,
        user_role=profile["role"],
        user_name=profile.get("full_name"),
    )


@router.post(
    "/refresh",
    response_model=LoginResponse,
    summary="Refresh access token",
)
@limiter.limit("10/minute")
async def refresh_token(request: Request, payload: RefreshRequest) -> LoginResponse:
    """Exchange a refresh token for a new access token."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{GOTRUE_URL}/token?grant_type=refresh_token",
                json={"refresh_token": payload.refresh_token},
                headers={
                    "apikey": settings.supabase_anon_key,
                    "Content-Type": "application/json",
                },
            )
    except httpx.RequestError as exc:
        logger.error("GoTrue refresh failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication service unavailable.",
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    data = resp.json()
    user_email = data.get("user", {}).get("email", "")

    from app.auth import _get_admin_profile

    profile = _get_admin_profile(user_email)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
        )

    return LoginResponse(
        access_token=data.get("access_token", ""),
        refresh_token=data.get("refresh_token", ""),
        expires_in=data.get("expires_in", 3600),
        user_email=user_email,
        user_role=profile["role"],
        user_name=profile.get("full_name"),
    )


@router.get(
    "/me",
    summary="Get current admin user info",
)
async def get_me(admin: AdminUser = Depends(require_admin)) -> dict:
    """Return info about the currently authenticated admin."""
    return {
        "user_id": admin.user_id,
        "email": admin.email,
        "role": admin.role,
        "full_name": admin.full_name,
    }


class AdminResetPasswordRequest(BaseModel):
    """New password chosen by an admin for another user."""

    # bcrypt (used by GoTrue) truncates at 72 bytes; keep the cap explicit.
    new_password: str = Field(min_length=8, max_length=72)


@router.post(
    "/users/{user_id}/reset-password",
    summary="Admin: set a new password for a user",
)
@limiter.limit("10/minute")
async def admin_reset_password(
    request: Request,
    payload: AdminResetPasswordRequest,
    user_id: str = Path(..., description="Supabase auth user id (UUID)."),
    admin: AdminUser = Depends(require_admin),
) -> dict:
    """Set a new password for any user, using the Supabase Admin API.

    Restricted to callers with the ``admin`` role — a ``supervisor``/``user``
    cannot reset other people's passwords. Runs server-side with the service
    role key, which never reaches the browser.
    """
    if admin.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can reset passwords.",
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.put(
                f"{GOTRUE_ADMIN_URL}/users/{user_id}",
                json={"password": payload.new_password},
                headers={
                    "apikey": settings.supabase_service_role_key,
                    "Authorization": f"Bearer {settings.supabase_service_role_key}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.RequestError as exc:
        logger.error("GoTrue admin request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Authentication service unavailable.",
        )

    if resp.status_code == 404:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    if resp.status_code != 200:
        logger.error("Password reset failed (%s): %s", resp.status_code, resp.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not update the password.",
        )

    # Do not log or echo the password. Audit only who did it, for whom.
    logger.info("Admin %s reset password for user %s", admin.email, user_id)
    return {"ok": True, "user_id": user_id}
