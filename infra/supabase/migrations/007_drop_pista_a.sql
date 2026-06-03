-- =============================================================================
-- Migration: 007_drop_pista_a
-- Project:   Sustenta Futuro — Etapa 2
-- Created:   2026-06-03
--
-- Removes "Pista A" tables (migration 002) that were superseded by the
-- lead_evaluations + lead_proposals model introduced in migration 005.
--
-- Verified safe: propuestas=0 rows, proyectos=0 rows,
--                levantamiento_respuestas=10 rows (1 lead, all respuesta=NULL)
-- =============================================================================

-- Drop in FK dependency order
DROP TABLE IF EXISTS public.levantamiento_respuestas;
DROP TABLE IF EXISTS public.proyectos;
DROP TABLE IF EXISTS public.propuestas;
