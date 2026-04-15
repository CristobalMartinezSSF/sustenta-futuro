-- =============================================================================
-- Migration: 002_add_project_title_and_notes
-- Project:   Sustenta Futuro MVP
-- Created:   2026-04-15
--
-- Changes:
--   1. Add nullable `project_title` column to public.leads
--   2. Create public.lead_notes table with RLS
-- =============================================================================


-- ===========================================================================
-- 1. ALTER TABLE leads: add project_title
--
-- Nullable text column. Set by admin to give the lead a descriptive project
-- title that is separate from the contact's name.
-- ===========================================================================

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS project_title text;

COMMENT ON COLUMN public.leads.project_title IS
    'Admin-assigned project title for this lead, separate from the contact name.';


-- ===========================================================================
-- 2. TABLE: lead_notes
--
-- Free-text notes attached to a lead, written by an admin user.
-- Rows are never hard-deleted; the lead's ON DELETE CASCADE handles cleanup.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.lead_notes (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id     uuid        NOT NULL REFERENCES public.leads (id) ON DELETE CASCADE,
    content     text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  uuid        REFERENCES auth.users (id)
);

COMMENT ON TABLE  public.lead_notes              IS 'Admin notes attached to a lead. Append-only by convention.';
COMMENT ON COLUMN public.lead_notes.created_by   IS 'The auth.users id of the admin who created the note; nullable for system-generated notes.';


-- ===========================================================================
-- INDEX: lead_notes — primary access pattern is "all notes for a lead"
-- ===========================================================================

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id
    ON public.lead_notes (lead_id);


-- ===========================================================================
-- ROW LEVEL SECURITY: lead_notes
--
-- Default deny-all is enforced by enabling RLS.
-- Service-role connections (FastAPI backend) bypass RLS automatically.
-- Authenticated admin users may read all notes and insert new ones.
-- Anon role has no access.
-- ===========================================================================

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- Authenticated admins may read any note.
CREATE POLICY "lead_notes_admin_select"
    ON public.lead_notes
    FOR SELECT
    TO authenticated
    USING (true);

-- Authenticated admins may insert notes.
-- created_by must be the calling user's own id (or NULL for system inserts).
CREATE POLICY "lead_notes_admin_insert"
    ON public.lead_notes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        created_by = auth.uid()
        OR created_by IS NULL
    );
