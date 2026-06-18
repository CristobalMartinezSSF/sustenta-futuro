-- =============================================================================
-- Migration: 008_proposal_versioning
-- Project:   Sustenta Futuro — Etapa 2
-- Created:   2026-06-18
--
-- Goal: turn lead_proposals into a Git-like version history per lead.
--   - version       correlative per lead (1, 2, 3, …)
--   - is_principal  exactly one "main" proposal per lead (shown by default)
--   - title         human-readable name for the version
--   - snapshot      immutable copy of the evaluation ficha + notes + lead basics
--                   captured at creation time
--
-- Idempotent: safe to run more than once (IF NOT EXISTS, guarded backfills).
-- =============================================================================


-- ===========================================================================
-- 1. NEW COLUMNS
-- ===========================================================================

ALTER TABLE public.lead_proposals
    ADD COLUMN IF NOT EXISTS version      int,
    ADD COLUMN IF NOT EXISTS is_principal boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS title        text,
    ADD COLUMN IF NOT EXISTS snapshot     jsonb;


-- ===========================================================================
-- 2. BACKFILL version  (correlative per lead, ordered by creation)
-- ===========================================================================

WITH ranked AS (
    SELECT id,
           row_number() OVER (PARTITION BY lead_id ORDER BY created_at, id) AS rn
    FROM public.lead_proposals
    WHERE version IS NULL
)
UPDATE public.lead_proposals p
SET version = r.rn
FROM ranked r
WHERE p.id = r.id;


-- ===========================================================================
-- 3. BACKFILL is_principal  (latest version per lead, only if none set yet)
-- ===========================================================================

WITH latest AS (
    SELECT DISTINCT ON (lead_id) id, lead_id
    FROM public.lead_proposals
    ORDER BY lead_id, version DESC, created_at DESC
)
UPDATE public.lead_proposals p
SET is_principal = true
FROM latest l
WHERE p.id = l.id
  AND NOT EXISTS (
      SELECT 1 FROM public.lead_proposals x
      WHERE x.lead_id = p.lead_id AND x.is_principal
  );


-- ===========================================================================
-- 4. BACKFILL snapshot  (from the lead's current evaluation + notes + basics)
-- ===========================================================================

UPDATE public.lead_proposals p
SET snapshot = jsonb_build_object(
    'evaluation', to_jsonb(e),
    'notes', COALESCE((
        SELECT jsonb_agg(
                   jsonb_build_object(
                       'content',    n.content,
                       'created_at', n.created_at,
                       'created_by', n.created_by
                   ) ORDER BY n.created_at
               )
        FROM public.lead_notes n
        WHERE n.lead_id = p.lead_id
    ), '[]'::jsonb),
    'lead', (
        SELECT jsonb_build_object(
                   'full_name', l.full_name,
                   'company',   l.company,
                   'email',     l.email
               )
        FROM public.leads l
        WHERE l.id = p.lead_id
    ),
    'captured_at', p.created_at
)
FROM public.lead_evaluations e
WHERE e.lead_id = p.lead_id
  AND p.snapshot IS NULL;


-- ===========================================================================
-- 5. FINALIZE version  (default + NOT NULL once backfill is done)
-- ===========================================================================

ALTER TABLE public.lead_proposals ALTER COLUMN version SET DEFAULT 1;
UPDATE public.lead_proposals SET version = 1 WHERE version IS NULL;
ALTER TABLE public.lead_proposals ALTER COLUMN version SET NOT NULL;


-- ===========================================================================
-- 6. CONSTRAINTS
-- ===========================================================================

-- At most one principal proposal per lead.
CREATE UNIQUE INDEX IF NOT EXISTS lead_proposals_one_principal_per_lead
    ON public.lead_proposals (lead_id)
    WHERE is_principal;

-- Version is unique within a lead.
CREATE UNIQUE INDEX IF NOT EXISTS lead_proposals_lead_version_unique
    ON public.lead_proposals (lead_id, version);

-- Fast lookup of a lead's versions.
CREATE INDEX IF NOT EXISTS lead_proposals_lead_id_version_idx
    ON public.lead_proposals (lead_id, version DESC);
