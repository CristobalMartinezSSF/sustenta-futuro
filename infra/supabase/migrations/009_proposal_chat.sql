-- =============================================================================
-- Migration: 009_proposal_chat
-- Project:   Sustenta Futuro — Etapa 2
-- Created:   2026-06-19
--
-- Per-version discussion thread for proposals: the internal team writes
-- messages and attaches files (PDF, images, text, …). Attachments live in a
-- private Supabase Storage bucket; the message row keeps their metadata.
--
-- Idempotent (IF NOT EXISTS + DROP POLICY IF EXISTS).
-- =============================================================================


-- ===========================================================================
-- 1. TABLE: proposal_messages  (one thread per lead_proposals row)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.proposal_messages (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id  uuid        NOT NULL REFERENCES public.lead_proposals (id) ON DELETE CASCADE,
    author_id    uuid,                       -- auth.users id of the writer
    author_name  text,                       -- denormalized display name
    body         text,
    attachments  jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- [{path,name,mime,size}]
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposal_messages_proposal_idx
    ON public.proposal_messages (proposal_id, created_at);

ALTER TABLE public.proposal_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_messages_select" ON public.proposal_messages;
CREATE POLICY "proposal_messages_select"
    ON public.proposal_messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "proposal_messages_insert" ON public.proposal_messages;
CREATE POLICY "proposal_messages_insert"
    ON public.proposal_messages FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "proposal_messages_delete" ON public.proposal_messages;
CREATE POLICY "proposal_messages_delete"
    ON public.proposal_messages FOR DELETE TO authenticated USING (true);


-- ===========================================================================
-- 2. STORAGE: private bucket for attachments + policies
-- ===========================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('proposal-attachments', 'proposal-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "proposal_attachments_read" ON storage.objects;
CREATE POLICY "proposal_attachments_read"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'proposal-attachments');

DROP POLICY IF EXISTS "proposal_attachments_insert" ON storage.objects;
CREATE POLICY "proposal_attachments_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'proposal-attachments');

DROP POLICY IF EXISTS "proposal_attachments_delete" ON storage.objects;
CREATE POLICY "proposal_attachments_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'proposal-attachments');
