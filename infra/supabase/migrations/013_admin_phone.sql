-- =============================================================================
-- Migration: 013_admin_phone
-- Project:   Sustenta Futuro — Etapa 2
-- Created:   2026-07-03
--
-- Goal: store an optional phone number per internal user, in E.164 format
-- (e.g. +56912345678). This is the "bridge" that a future WhatsApp password
-- recovery flow (Meta WhatsApp Cloud API) will read to message the worker.
--
-- Nothing sends WhatsApp yet — this only persists the number so the data is
-- ready when the Meta account + template are approved. See
-- services/api/app/notifications/whatsapp.py for the pending integration.
--
-- Idempotent: safe to run more than once.
-- =============================================================================

ALTER TABLE public.admin_profiles
    ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.admin_profiles.phone IS
    'Optional E.164 phone (+56912345678). Reserved for WhatsApp recovery (Meta Cloud API). Not used yet.';
