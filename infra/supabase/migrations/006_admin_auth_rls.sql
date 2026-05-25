-- =============================================================================
-- Migration: 006_admin_auth_rls
-- Project:   Sustenta Futuro — Etapa 2 Fase 2
-- Created:   2026-05-25
--
-- Changes:
--   1. Create function is_admin() to check admin_profiles membership
--   2. Add RLS policies on leads table: anon blocked, admin-only read/write
--   3. Update RLS policies on related tables to use is_admin()
--   4. Create RPC get_my_role for frontend role check
-- =============================================================================


-- ===========================================================================
-- 1. HELPER FUNCTION: is_admin()
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE email = auth.jwt() ->> 'email'
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Returns true if the current authenticated user has an admin_profiles entry.';


-- ===========================================================================
-- 2. RPC: get_my_role (used by frontend for conditional nav)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role
  FROM public.admin_profiles
  WHERE email = auth.jwt() ->> 'email'
  LIMIT 1;
$$;


-- ===========================================================================
-- 3. RLS ON leads TABLE
-- ===========================================================================

-- Enable RLS (idempotent)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "leads_anon_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_admin_select" ON public.leads;
DROP POLICY IF EXISTS "leads_admin_update" ON public.leads;
DROP POLICY IF EXISTS "leads_admin_delete" ON public.leads;
DROP POLICY IF EXISTS "leads_service_insert" ON public.leads;

-- Allow anonymous inserts (public lead form) — only INSERT, no read
CREATE POLICY "leads_anon_insert"
  ON public.leads FOR INSERT TO anon
  WITH CHECK (true);

-- Allow admin users to read all leads
CREATE POLICY "leads_admin_select"
  ON public.leads FOR SELECT TO authenticated
  USING (public.is_admin());

-- Allow admin users to update leads
CREATE POLICY "leads_admin_update"
  ON public.leads FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Allow admin users to delete leads (rare, but needed for data cleanup)
CREATE POLICY "leads_admin_delete"
  ON public.leads FOR DELETE TO authenticated
  USING (public.is_admin());


-- ===========================================================================
-- 4. RLS ON lead_status_history
-- ===========================================================================

ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_status_history_admin_select" ON public.lead_status_history;
DROP POLICY IF EXISTS "lead_status_history_admin_insert" ON public.lead_status_history;

CREATE POLICY "lead_status_history_admin_select"
  ON public.lead_status_history FOR SELECT TO authenticated
  USING (public.is_admin());

-- Insert is done by trigger (SECURITY DEFINER), but also allow admin manual insert
CREATE POLICY "lead_status_history_admin_insert"
  ON public.lead_status_history FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());


-- ===========================================================================
-- 5. RLS ON lead_notes
-- ===========================================================================

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_notes_admin_select" ON public.lead_notes;
DROP POLICY IF EXISTS "lead_notes_admin_insert" ON public.lead_notes;

CREATE POLICY "lead_notes_admin_select"
  ON public.lead_notes FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "lead_notes_admin_insert"
  ON public.lead_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());


-- ===========================================================================
-- 6. UPDATE EXISTING POLICIES ON ETAPA 2 TABLES
-- ===========================================================================

-- lead_evaluations: tighten to is_admin()
DROP POLICY IF EXISTS "lead_evaluations_admin_select" ON public.lead_evaluations;
DROP POLICY IF EXISTS "lead_evaluations_admin_insert" ON public.lead_evaluations;
DROP POLICY IF EXISTS "lead_evaluations_admin_update" ON public.lead_evaluations;

CREATE POLICY "lead_evaluations_admin_select"
  ON public.lead_evaluations FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "lead_evaluations_admin_insert"
  ON public.lead_evaluations FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "lead_evaluations_admin_update"
  ON public.lead_evaluations FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- lead_proposals
DROP POLICY IF EXISTS "lead_proposals_admin_select" ON public.lead_proposals;
DROP POLICY IF EXISTS "lead_proposals_admin_insert" ON public.lead_proposals;
DROP POLICY IF EXISTS "lead_proposals_admin_update" ON public.lead_proposals;

CREATE POLICY "lead_proposals_admin_select"
  ON public.lead_proposals FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "lead_proposals_admin_insert"
  ON public.lead_proposals FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "lead_proposals_admin_update"
  ON public.lead_proposals FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- phases
DROP POLICY IF EXISTS "phases_admin_select" ON public.phases;
DROP POLICY IF EXISTS "phases_admin_insert" ON public.phases;
DROP POLICY IF EXISTS "phases_admin_update" ON public.phases;

CREATE POLICY "phases_admin_select"
  ON public.phases FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "phases_admin_insert"
  ON public.phases FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "phases_admin_update"
  ON public.phases FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- tasks
DROP POLICY IF EXISTS "tasks_admin_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_admin_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_admin_update" ON public.tasks;

CREATE POLICY "tasks_admin_select"
  ON public.tasks FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "tasks_admin_insert"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "tasks_admin_update"
  ON public.tasks FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- task_notes
DROP POLICY IF EXISTS "task_notes_admin_select" ON public.task_notes;
DROP POLICY IF EXISTS "task_notes_admin_insert" ON public.task_notes;

CREATE POLICY "task_notes_admin_select"
  ON public.task_notes FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "task_notes_admin_insert"
  ON public.task_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- daily_reports
DROP POLICY IF EXISTS "daily_reports_admin_select" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_admin_insert" ON public.daily_reports;

CREATE POLICY "daily_reports_admin_select"
  ON public.daily_reports FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "daily_reports_admin_insert"
  ON public.daily_reports FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- phase_files
DROP POLICY IF EXISTS "phase_files_admin_select" ON public.phase_files;
DROP POLICY IF EXISTS "phase_files_admin_insert" ON public.phase_files;

CREATE POLICY "phase_files_admin_select"
  ON public.phase_files FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "phase_files_admin_insert"
  ON public.phase_files FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- activity_log
DROP POLICY IF EXISTS "activity_log_admin_select" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_admin_insert" ON public.activity_log;

CREATE POLICY "activity_log_admin_select"
  ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "activity_log_admin_insert"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());


-- ===========================================================================
-- SUMMARY
-- ===========================================================================
-- Created: is_admin() function, get_my_role() RPC
-- Updated: RLS policies on 11 tables to require admin_profiles membership
-- Public form (anon insert on leads) still works
-- Service role key bypasses all RLS (used by FastAPI backend)
-- =============================================================================
