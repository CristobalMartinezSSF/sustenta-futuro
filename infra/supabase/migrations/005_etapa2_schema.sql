-- =============================================================================
-- Migration: 005_etapa2_schema
-- Project:   Sustenta Futuro — Etapa 2
-- Created:   2026-05-20
--
-- Changes:
--   1. Expand leads table: new fields, 8 Etapa 2 statuses, updated_at trigger
--   2. Update admin_profiles roles: admin | supervisor
--   3. Make lead_status_history.notes NOT NULL
--   4. Create lead_evaluations (technical-economic assessment)
--   5. Create lead_proposals (PDF proposal lifecycle)
--   6. Create phases (work management)
--   7. Create tasks (kanban items per phase)
--   8. Create task_notes (feedback per task)
--   9. Create daily_reports
--  10. Create phase_files (meeting docs, reports)
--  11. Create activity_log (automatic timeline)
-- =============================================================================


-- ===========================================================================
-- 1. EXPAND leads TABLE
-- ===========================================================================

-- Rename 'name' to 'full_name' for clarity
ALTER TABLE public.leads RENAME COLUMN name TO full_name;

-- Add new columns
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS service_interest  text,
    ADD COLUMN IF NOT EXISTS industry          text,
    ADD COLUMN IF NOT EXISTS employee_range    text,
    ADD COLUMN IF NOT EXISTS referral_source   text,
    ADD COLUMN IF NOT EXISTS enrichment_data   jsonb,
    ADD COLUMN IF NOT EXISTS cristobal_input   text,
    ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

-- Replace status CHECK constraint with Etapa 2 statuses
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads
    ADD CONSTRAINT leads_status_check CHECK (
        status IN (
            'new',
            'reviewing',
            'pending_approval',
            'contacted',
            'evaluating',
            'viable',
            'proposal_sent',
            'won',
            'lost'
        )
    );

-- Migrate any old statuses that no longer exist
UPDATE public.leads SET status = 'new' WHERE status = 'qualified';
UPDATE public.leads SET status = 'proposal_sent' WHERE status = 'proposal_pending';

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at
    BEFORE UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_set_updated_at();

-- Index on service_interest for filtering
CREATE INDEX IF NOT EXISTS idx_leads_service_interest ON public.leads (service_interest);


-- ===========================================================================
-- 2. UPDATE admin_profiles ROLES
-- ===========================================================================

ALTER TABLE public.admin_profiles
    DROP CONSTRAINT IF EXISTS admin_profiles_role_check;

ALTER TABLE public.admin_profiles
    ADD CONSTRAINT admin_profiles_role_check
        CHECK (role IN ('admin', 'supervisor'));

-- Migrate existing 'user' roles to 'supervisor'
UPDATE public.admin_profiles SET role = 'supervisor' WHERE role = 'user';
-- Migrate existing 'super_admin' roles to 'admin'
UPDATE public.admin_profiles SET role = 'admin' WHERE role = 'super_admin';

COMMENT ON COLUMN public.admin_profiles.role IS
    'admin = Cristobal (defines and executes). '
    'supervisor = Hector (reviews and approves).';


-- ===========================================================================
-- 3. MAKE lead_status_history.notes NOT NULL with default
-- ===========================================================================

-- First, fill any existing NULL notes
UPDATE public.lead_status_history SET notes = 'Initial status' WHERE notes IS NULL;

-- Now make it NOT NULL
ALTER TABLE public.lead_status_history ALTER COLUMN notes SET NOT NULL;
ALTER TABLE public.lead_status_history ALTER COLUMN notes SET DEFAULT '';

-- Update the trigger to include a default note on insert
CREATE OR REPLACE FUNCTION public.fn_record_lead_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.lead_status_history (lead_id, old_status, new_status, notes)
        VALUES (NEW.id, NULL, NEW.status, 'Lead created');

    ELSIF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
        INSERT INTO public.lead_status_history (lead_id, old_status, new_status, notes)
        VALUES (NEW.id, OLD.status, NEW.status, '');
    END IF;

    RETURN NEW;
END;
$$;


-- ===========================================================================
-- 4. TABLE: lead_evaluations
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.lead_evaluations (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id             uuid        NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE UNIQUE,
    project_title       text,
    description         text,
    functionalities     jsonb,
    stack               jsonb,
    phases              jsonb,
    estimated_hours     int,
    internal_cost       numeric(12,2),
    client_price        numeric(12,2),
    price_currency      text        DEFAULT 'UF',
    price_breakdown     jsonb,
    monthly_maintenance numeric(12,2),
    payment_method      text,
    total_duration      text,
    offer_validity      int         DEFAULT 15,
    complexity          text        CHECK (complexity IN ('low', 'medium', 'high')),
    margin              numeric(12,2) GENERATED ALWAYS AS (client_price - internal_cost) STORED,
    risks               text,
    verdict             text        DEFAULT 'pending'
                        CHECK (verdict IN ('pending', 'viable', 'not_viable')),
    verdict_by          uuid        REFERENCES public.admin_profiles (id),
    verdict_at          timestamptz,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_evaluations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_evaluations_admin_select"
    ON public.lead_evaluations FOR SELECT TO authenticated USING (true);

CREATE POLICY "lead_evaluations_admin_insert"
    ON public.lead_evaluations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "lead_evaluations_admin_update"
    ON public.lead_evaluations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_lead_evaluations_updated_at ON public.lead_evaluations;
CREATE TRIGGER trg_lead_evaluations_updated_at
    BEFORE UPDATE ON public.lead_evaluations
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_set_updated_at();


-- ===========================================================================
-- 5. TABLE: lead_proposals
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.lead_proposals (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id             uuid        NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
    evaluation_id       uuid        REFERENCES public.lead_evaluations (id),
    pdf_storage_path    text,
    status              text        DEFAULT 'draft'
                        CHECK (status IN ('draft', 'approved', 'sent', 'accepted', 'rejected')),
    approved_by         uuid        REFERENCES public.admin_profiles (id),
    approved_at         timestamptz,
    sent_at             timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_proposals_admin_select"
    ON public.lead_proposals FOR SELECT TO authenticated USING (true);

CREATE POLICY "lead_proposals_admin_insert"
    ON public.lead_proposals FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "lead_proposals_admin_update"
    ON public.lead_proposals FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


-- ===========================================================================
-- 6. TABLE: phases (work management)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.phases (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      text        DEFAULT 'sg-sustenta-futuro',
    name            text        NOT NULL,
    description     text,
    order_index     int         NOT NULL DEFAULT 0,
    status          text        DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'review', 'approved')),
    approved_by     uuid        REFERENCES public.admin_profiles (id),
    approved_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phases_admin_select"
    ON public.phases FOR SELECT TO authenticated USING (true);

CREATE POLICY "phases_admin_insert"
    ON public.phases FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "phases_admin_update"
    ON public.phases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_phases_project_id ON public.phases (project_id);


-- ===========================================================================
-- 7. TABLE: tasks (kanban items)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.tasks (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id        uuid        NOT NULL REFERENCES public.phases (id) ON DELETE CASCADE,
    title           text        NOT NULL,
    description     text,
    status          text        DEFAULT 'todo'
                    CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
    order_index     int         NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_admin_select"
    ON public.tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "tasks_admin_insert"
    ON public.tasks FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "tasks_admin_update"
    ON public.tasks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tasks_phase_id ON public.tasks (phase_id);

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_set_updated_at();


-- ===========================================================================
-- 8. TABLE: task_notes (feedback per task)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.task_notes (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id         uuid        NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
    author_id       uuid        REFERENCES public.admin_profiles (id),
    content         text        NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_notes_admin_select"
    ON public.task_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "task_notes_admin_insert"
    ON public.task_notes FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON public.task_notes (task_id);


-- ===========================================================================
-- 9. TABLE: daily_reports
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.daily_reports (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id       uuid        REFERENCES public.admin_profiles (id),
    phase_id        uuid        REFERENCES public.phases (id),
    report_date     date        NOT NULL,
    accomplished    text        NOT NULL,
    blockers        text,
    next_steps      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_reports_admin_select"
    ON public.daily_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "daily_reports_admin_insert"
    ON public.daily_reports FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_daily_reports_phase_id ON public.daily_reports (phase_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON public.daily_reports (report_date DESC);


-- ===========================================================================
-- 10. TABLE: phase_files
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.phase_files (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id        uuid        NOT NULL REFERENCES public.phases (id) ON DELETE CASCADE,
    uploaded_by     uuid        REFERENCES public.admin_profiles (id),
    filename        text        NOT NULL,
    storage_path    text        NOT NULL,
    file_type       text        DEFAULT 'other'
                    CHECK (file_type IN ('meeting', 'report', 'document', 'other')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.phase_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phase_files_admin_select"
    ON public.phase_files FOR SELECT TO authenticated USING (true);

CREATE POLICY "phase_files_admin_insert"
    ON public.phase_files FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_phase_files_phase_id ON public.phase_files (phase_id);


-- ===========================================================================
-- 11. TABLE: activity_log (automatic timeline)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.activity_log (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id        uuid        REFERENCES public.admin_profiles (id),
    action          text        NOT NULL,
    entity_type     text        NOT NULL
                    CHECK (entity_type IN (
                        'task', 'phase', 'lead', 'report',
                        'file', 'evaluation', 'proposal'
                    )),
    entity_id       uuid,
    details         jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_log_admin_select"
    ON public.activity_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "activity_log_admin_insert"
    ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON public.activity_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON public.activity_log (created_at DESC);


-- ===========================================================================
-- SUMMARY
-- ===========================================================================
-- Tables created/modified: 11
--   Modified: leads, lead_status_history, admin_profiles
--   Created:  lead_evaluations, lead_proposals, phases, tasks,
--             task_notes, daily_reports, phase_files, activity_log
-- All tables have RLS enabled with authenticated-only policies.
-- Service role bypasses RLS (used by FastAPI backend).
-- =============================================================================
