-- =============================================================================
-- Migration: 001_initial_schema
-- Project:   Sustenta Futuro MVP
-- Created:   2026-04-14
--
-- Tables:
--   leads                - inbound lead records from the landing form
--   lead_status_history  - immutable audit log of every status transition
--   admin_profiles       - extended profile for Supabase Auth admin users
--
-- Conventions:
--   - All primary keys are UUID generated server-side.
--   - Timestamps are timestamptz (UTC stored, display per client locale).
--   - RLS is enabled on all tables; policies are additive and explicit.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- EXTENSION: pgcrypto is required by gen_random_uuid() on older PG versions.
-- On PG 13+ this is available natively; including it here is harmless.
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ===========================================================================
-- TABLE: leads
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.leads (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  timestamptz NOT NULL    DEFAULT now(),

    -- Contact information
    name        text        NOT NULL,
    email       text        NOT NULL,
    phone       text,
    company     text,
    message     text,

    -- Acquisition metadata
    source      text        NOT NULL    DEFAULT 'landing_form',
    -- Allowed status values (enforced by CHECK constraint):
    --   new | reviewing | contacted | qualified | proposal_pending | won | lost
    status      text        NOT NULL    DEFAULT 'new',

    -- Future: assigned_to references auth.users once multi-admin is needed
    assigned_to uuid,

    CONSTRAINT leads_status_check CHECK (
        status IN (
            'new',
            'reviewing',
            'contacted',
            'qualified',
            'proposal_pending',
            'won',
            'lost'
        )
    )
);

COMMENT ON TABLE  public.leads                IS 'Inbound lead records captured from the public landing form.';
COMMENT ON COLUMN public.leads.source         IS 'Acquisition channel; defaults to landing_form.';
COMMENT ON COLUMN public.leads.status         IS 'Current pipeline stage of the lead.';
COMMENT ON COLUMN public.leads.assigned_to    IS 'Reserved for future multi-admin assignment; nullable for MVP.';


-- ===========================================================================
-- TABLE: lead_status_history
-- Immutable audit log — rows are inserted by trigger, never updated/deleted.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.lead_status_history (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     uuid        NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
    old_status  text,                       -- NULL on the initial insert
    new_status  text        NOT NULL,
    changed_at  timestamptz NOT NULL    DEFAULT now(),
    changed_by  uuid,                       -- auth.users id; nullable for system actions
    notes       text
);

COMMENT ON TABLE  public.lead_status_history             IS 'Append-only audit log of every lead status transition.';
COMMENT ON COLUMN public.lead_status_history.old_status  IS 'Status before the change; NULL when the lead is first created.';
COMMENT ON COLUMN public.lead_status_history.changed_by  IS 'Admin user who made the change; NULL for automated/system transitions.';


-- ===========================================================================
-- TABLE: admin_profiles
-- One row per Supabase Auth user who has admin access.
-- The id column intentionally matches auth.users.id.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.admin_profiles (
    id          uuid        PRIMARY KEY,    -- mirrors auth.users.id; no separate sequence
    email       text        NOT NULL,
    full_name   text,
    role        text        NOT NULL    DEFAULT 'admin',
    created_at  timestamptz NOT NULL    DEFAULT now(),

    CONSTRAINT admin_profiles_role_check CHECK (
        role IN ('admin', 'super_admin')
    )
);

COMMENT ON TABLE  public.admin_profiles           IS 'Extended profile for Supabase Auth admin users. id = auth.users.id.';
COMMENT ON COLUMN public.admin_profiles.role      IS 'Coarse access level; only admin and super_admin are valid for MVP.';


-- ===========================================================================
-- INDEXES
-- ===========================================================================

-- leads: common filter / sort columns
CREATE INDEX IF NOT EXISTS idx_leads_email      ON public.leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_status     ON public.leads (status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);

-- lead_status_history: FK lookup (the most frequent query pattern)
CREATE INDEX IF NOT EXISTS idx_lead_status_history_lead_id ON public.lead_status_history (lead_id);


-- ===========================================================================
-- TRIGGER: auto-record status transitions on leads
--
-- Fires AFTER INSERT or UPDATE on leads.
--   - INSERT:  records the initial status with old_status = NULL.
--   - UPDATE:  records the transition only when status actually changes.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.fn_record_lead_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.lead_status_history (lead_id, old_status, new_status)
        VALUES (NEW.id, NULL, NEW.status);

    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.lead_status_history (lead_id, old_status, new_status)
        VALUES (NEW.id, OLD.status, NEW.status);
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_record_lead_status_change() IS
    'Trigger function: appends a row to lead_status_history on every lead INSERT '
    'and on every UPDATE where the status column value changes.';

CREATE TRIGGER trg_lead_status_history
    AFTER INSERT OR UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_record_lead_status_change();


-- ===========================================================================
-- ROW LEVEL SECURITY (RLS)
--
-- All tables default to DENY ALL.
-- Service-role connections (backend / migrations) bypass RLS automatically.
-- Anon and authenticated roles receive only the access they need.
-- ===========================================================================

ALTER TABLE public.leads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_profiles      ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- leads: public insert (landing form), admin full access
-- ---------------------------------------------------------------------------

-- Anyone (including unauthenticated visitors) may insert a lead.
CREATE POLICY "leads_anon_insert"
    ON public.leads
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- Authenticated admins may read and update leads.
CREATE POLICY "leads_admin_select"
    ON public.leads
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "leads_admin_update"
    ON public.leads
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- lead_status_history: admins may read; inserts handled by SECURITY DEFINER trigger
-- ---------------------------------------------------------------------------

CREATE POLICY "lead_status_history_admin_select"
    ON public.lead_status_history
    FOR SELECT
    TO authenticated
    USING (true);

-- ---------------------------------------------------------------------------
-- admin_profiles: each admin can read their own row; super_admin can read all
-- (simple default: authenticated users read only their own profile in MVP)
-- ---------------------------------------------------------------------------

CREATE POLICY "admin_profiles_self_select"
    ON public.admin_profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());
