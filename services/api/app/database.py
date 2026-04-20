"""Supabase HTTP client.

Uses direct HTTP calls to the Supabase REST API with the service role key,
bypassing RLS. This avoids the supabase-py dependency chain (pyiceberg issue
on Python 3.14 / Windows without Visual Studio Build Tools).
"""

import httpx

from app.config import settings

HEADERS = {
    "apikey": settings.supabase_service_role_key,
    "Authorization": f"Bearer {settings.supabase_service_role_key}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

REST_URL = f"{settings.supabase_url}/rest/v1"


def get_client() -> httpx.Client:
    """Return a configured httpx client for Supabase REST API calls."""
    return httpx.Client(base_url=REST_URL, headers=HEADERS, timeout=10.0)
