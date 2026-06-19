-- =============================================================================
-- Migration: 010_projects
-- Project:   Sustenta Futuro — Etapa 2
-- Created:   2026-06-19
--
-- Promotes "project" to a first-class entity. A project is what the team works
-- on at the development level; it is born from a winning proposal but has its
-- own lifecycle (active/paused/done/cancelled) and owns the execution board
-- (phases -> tasks/reports).
--
--   lead ── winning proposal ──► project ── phases ── tasks / daily_reports
--
-- Also re-anchors phases.project_id (previously a free-text default
-- 'sg-sustenta-futuro') to a real FK -> projects(id). The phases table is empty
-- today, so the type conversion is clean.
--
-- Idempotent: safe to run more than once.
-- =============================================================================


-- ===========================================================================
-- 1. TABLE: projects
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.projects (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id      uuid        NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
    proposal_id  uuid        REFERENCES public.lead_proposals (id) ON DELETE SET NULL,
    name         text        NOT NULL,
    status       text        NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'paused', 'done', 'cancelled')),
    started_at   timestamptz NOT NULL DEFAULT now(),
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- One project per winning proposal.
CREATE UNIQUE INDEX IF NOT EXISTS projects_proposal_unique
    ON public.projects (proposal_id)
    WHERE proposal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS projects_lead_idx ON public.projects (lead_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select" ON public.projects;
CREATE POLICY "projects_select"
    ON public.projects FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert"
    ON public.projects FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update"
    ON public.projects FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "projects_delete" ON public.projects;
CREATE POLICY "projects_delete"
    ON public.projects FOR DELETE TO authenticated USING (true);


-- ===========================================================================
-- 2. RE-ANCHOR phases.project_id  (text 'sg-sustenta-futuro' -> uuid FK)
--    phases is empty today, so the cast never evaluates against real rows.
-- ===========================================================================

DO $$
DECLARE
    col_type text;
BEGIN
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'phases'
      AND column_name = 'project_id';

    IF col_type = 'text' THEN
        -- Drop anything tied to the text column first.
        DROP INDEX IF EXISTS public.idx_phases_project_id;
        ALTER TABLE public.phases ALTER COLUMN project_id DROP DEFAULT;
        ALTER TABLE public.phases
            ALTER COLUMN project_id TYPE uuid USING NULLIF(project_id, '')::uuid;
    END IF;
END $$;

-- FK + supporting index (guarded so re-runs don't duplicate them).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'public'
          AND table_name = 'phases'
          AND constraint_name = 'phases_project_id_fkey'
    ) THEN
        ALTER TABLE public.phases
            ADD CONSTRAINT phases_project_id_fkey
            FOREIGN KEY (project_id) REFERENCES public.projects (id) ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE public.phases ALTER COLUMN project_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phases_project_id ON public.phases (project_id);
