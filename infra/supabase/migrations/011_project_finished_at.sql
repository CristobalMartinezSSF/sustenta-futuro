-- =============================================================================
-- Migration: 011_project_finished_at
-- Project:   Sustenta Futuro — Etapa 2
-- Created:   2026-06-19
--
-- Records when a project was closed. Stamped by the API when a project's
-- status transitions to 'done' (and cleared if it is reopened).
--
-- Idempotent.
-- =============================================================================

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS finished_at timestamptz;
