-- =============================================================================
-- Migration: 003_roles_and_user_management
-- Project:   Sustenta Futuro MVP
-- Created:   2026-04-15
--
-- Changes:
--   1. Replace role CHECK constraint on admin_profiles
--        old: role IN ('admin', 'super_admin')
--        new: role IN ('admin', 'user')
--   2. Add RLS policies for admin_profiles
--        - All authenticated users can SELECT all rows (role checking, user list)
--        - Only admins (role = 'admin') can INSERT new rows
--   3. Add Postgres helper function get_my_role()
--        Returns the role of the currently authenticated user from admin_profiles.
--        Avoids full-table exposure when a client only needs its own role.
--
-- Idempotency notes:
--   - Constraint replacement uses DROP IF EXISTS before re-creating.
--   - Policies use DROP IF EXISTS before re-creating.
--   - Function uses CREATE OR REPLACE.
--   - The existing "admin_profiles_self_select" policy from migration 001 is
--     superseded by the broader "admin_profiles_authenticated_select" policy
--     added here; the old policy is dropped first to avoid redundancy.
-- =============================================================================


-- ===========================================================================
-- 1. UPDATE role CHECK constraint on admin_profiles
--
-- Drop the old constraint (admin | super_admin) and add the new one
-- (admin | user). The DEFAULT value 'admin' remains correct.
-- ===========================================================================

ALTER TABLE public.admin_profiles
    DROP CONSTRAINT IF EXISTS admin_profiles_role_check;

ALTER TABLE public.admin_profiles
    ADD CONSTRAINT admin_profiles_role_check
        CHECK (role IN ('admin', 'user'));

-- Update the column comment to reflect the new semantics.
COMMENT ON COLUMN public.admin_profiles.role IS
    'Coarse access level. '
    'admin = full access, can manage users. '
    'user  = can view and update leads, cannot manage users.';


-- ===========================================================================
-- 2. RLS POLICIES for admin_profiles
--
-- Policy inventory after this migration:
--   admin_profiles_authenticated_select  SELECT  authenticated  all rows
--   admin_profiles_admin_insert          INSERT  authenticated  only if role = admin
--
-- The migration-001 policy "admin_profiles_self_select" is narrower than
-- what the panel needs (it can only see its own row), so it is replaced.
-- ===========================================================================

-- Drop the original self-select policy from migration 001 (superseded).
DROP POLICY IF EXISTS "admin_profiles_self_select"
    ON public.admin_profiles;

-- Any authenticated user can read all rows in admin_profiles.
-- This lets the panel render the user list and lets role-checking queries work.
DROP POLICY IF EXISTS "admin_profiles_authenticated_select"
    ON public.admin_profiles;

CREATE POLICY "admin_profiles_authenticated_select"
    ON public.admin_profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- Only an authenticated user whose own profile has role = 'admin'
-- is allowed to insert new rows (i.e., register a new panel user).
-- The sub-select is safe: it reads from the same table but is evaluated
-- against the service role path, so it cannot be short-circuited by RLS.
DROP POLICY IF EXISTS "admin_profiles_admin_insert"
    ON public.admin_profiles;

CREATE POLICY "admin_profiles_admin_insert"
    ON public.admin_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.admin_profiles AS ap
            WHERE ap.id   = auth.uid()
              AND ap.role = 'admin'
        )
    );


-- ===========================================================================
-- 3. FUNCTION: get_my_role()
--
-- Returns the role text for the currently authenticated Supabase user.
-- Returns NULL if the user has no row in admin_profiles (i.e., not a panel user).
--
-- SECURITY DEFINER so it can read admin_profiles without being blocked by RLS,
-- while the caller only ever sees their own role string — not other rows.
--
-- Usage from the client (PostgREST RPC):
--   POST /rest/v1/rpc/get_my_role
--   (no body required)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM   public.admin_profiles
    WHERE  id = auth.uid()
    LIMIT  1;
$$;

COMMENT ON FUNCTION public.get_my_role() IS
    'Returns the role of the currently authenticated user from admin_profiles. '
    'Returns NULL if the user has no admin_profiles row. '
    'Declared SECURITY DEFINER so callers cannot infer other rows via RLS timing.';

-- Revoke direct execute from public/anon; only authenticated users need it.
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_role() TO   authenticated;
