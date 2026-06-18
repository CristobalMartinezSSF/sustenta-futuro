"""Shared test setup.

Provide dummy Supabase env vars so modules that build `app.config.Settings`
at import time (routers, database) can be imported in unit tests without a
real .env. These never hit the network in unit tests.
"""

import os

os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
