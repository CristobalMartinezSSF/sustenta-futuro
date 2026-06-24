-- =============================================================================
-- Migration: 012_proposal_quote_number
-- Project:   Sustenta Futuro — Etapa 2
-- Created:   2026-06-24
--
-- Goal: give each proposal a formal, verifiable quote number COT-NNN-AAAA whose
-- sequence resets every year (COT-001-2026, COT-002-2026, … COT-001-2027).
--
--   - lead_proposals.quote_number   text, unique, assigned at creation
--   - proposal_counters(year, last_seq)   per-year correlative counter
--   - allocate_quote_number()       atomic allocator, returns the next number
--
-- Idempotent: safe to run more than once.
-- =============================================================================


-- ===========================================================================
-- 1. COLUMN
-- ===========================================================================

ALTER TABLE public.lead_proposals
    ADD COLUMN IF NOT EXISTS quote_number text;

-- A quote number is unique across all proposals (it is the document's id).
CREATE UNIQUE INDEX IF NOT EXISTS lead_proposals_quote_number_unique
    ON public.lead_proposals (quote_number)
    WHERE quote_number IS NOT NULL;


-- ===========================================================================
-- 2. PER-YEAR COUNTER
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.proposal_counters (
    year     int  PRIMARY KEY,
    last_seq int  NOT NULL DEFAULT 0
);

-- Only the service role touches this table (via the allocator below).
ALTER TABLE public.proposal_counters ENABLE ROW LEVEL SECURITY;


-- ===========================================================================
-- 3. ATOMIC ALLOCATOR
-- ===========================================================================
-- Increments the current year's counter and returns the formatted number in a
-- single statement. SECURITY DEFINER so it runs with the owner's rights and the
-- INSERT ... ON CONFLICT is race-safe under concurrency.

CREATE OR REPLACE FUNCTION public.allocate_quote_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    y int := EXTRACT(YEAR FROM now())::int;
    n int;
BEGIN
    INSERT INTO public.proposal_counters (year, last_seq)
    VALUES (y, 1)
    ON CONFLICT (year)
        DO UPDATE SET last_seq = public.proposal_counters.last_seq + 1
    RETURNING last_seq INTO n;

    RETURN 'COT-' || lpad(n::text, 3, '0') || '-' || y::text;
END;
$$;

-- Allow the API (service role) and authenticated callers to allocate.
GRANT EXECUTE ON FUNCTION public.allocate_quote_number() TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_quote_number() TO authenticated;
