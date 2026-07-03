-- =============================================================================
-- SG Sustenta Futuro - Esquema completo de base de datos (consolidado)
-- Generado por scripts/build-schema.py el 2026-07-03.
--
-- Concatenacion de infra/supabase/migrations/ en el ORDEN HISTORICO REAL de
-- aplicacion a produccion (no el alfabetico: hay dos 002 y dos 003).
--
-- USO: pegar completo en el SQL Editor de un proyecto Supabase NUEVO y ejecutar.
-- Reproduce tablas, indices, funciones, triggers y politicas RLS. Requiere un
-- proyecto SUPABASE (usa el schema `auth` y auth.uid()), no un Postgres pelado.
-- No incluye datos; el primer admin se crea aparte (ver docs/SETUP-BASE-DATOS.md).
-- =============================================================================



-- ==========================================================================
-- [01/15] 001_initial_schema.sql
-- ==========================================================================

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

DROP TRIGGER IF EXISTS trg_lead_status_history ON public.leads;
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


-- ==========================================================================
-- [02/15] 002_add_project_title_and_notes.sql
-- ==========================================================================

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


-- ==========================================================================
-- [03/15] 003_roles_and_user_management.sql
-- ==========================================================================

-- =============================================================================
-- Migration: 003_roles_and_user_management
-- Project:   Sustenta Futuro MVP
-- Created:   2026-04-15
--
-- Changes:
--   1. Replace role CHECK constraint on admin_profiles
--        old: role IN ('admin', 'super_admin')
--        new: role IN ('admin', 'user')
--   2. Add RLS policies for admin_profiles
--        - All authenticated users can SELECT all rows (role checking, user list)
--        - Only admins (role = 'admin') can INSERT new rows
--   3. Add Postgres helper function get_my_role()
--        Returns the role of the currently authenticated user from admin_profiles.
--        Avoids full-table exposure when a client only needs its own role.
--
-- Idempotency notes:
--   - Constraint replacement uses DROP IF EXISTS before re-creating.
--   - Policies use DROP IF EXISTS before re-creating.
--   - Function uses CREATE OR REPLACE.
--   - The existing "admin_profiles_self_select" policy from migration 001 is
--     superseded by the broader "admin_profiles_authenticated_select" policy
--     added here; the old policy is dropped first to avoid redundancy.
-- =============================================================================


-- ===========================================================================
-- 1. UPDATE role CHECK constraint on admin_profiles
--
-- Drop the old constraint (admin | super_admin) and add the new one
-- (admin | user). The DEFAULT value 'admin' remains correct.
-- ===========================================================================

ALTER TABLE public.admin_profiles
    DROP CONSTRAINT IF EXISTS admin_profiles_role_check;

ALTER TABLE public.admin_profiles
    ADD CONSTRAINT admin_profiles_role_check
        CHECK (role IN ('admin', 'user'));

-- Update the column comment to reflect the new semantics.
COMMENT ON COLUMN public.admin_profiles.role IS
    'Coarse access level. '
    'admin = full access, can manage users. '
    'user  = can view and update leads, cannot manage users.';


-- ===========================================================================
-- 2. RLS POLICIES for admin_profiles
--
-- Policy inventory after this migration:
--   admin_profiles_authenticated_select  SELECT  authenticated  all rows
--   admin_profiles_admin_insert          INSERT  authenticated  only if role = admin
--
-- The migration-001 policy "admin_profiles_self_select" is narrower than
-- what the panel needs (it can only see its own row), so it is replaced.
-- ===========================================================================

-- Drop the original self-select policy from migration 001 (superseded).
DROP POLICY IF EXISTS "admin_profiles_self_select"
    ON public.admin_profiles;

-- Any authenticated user can read all rows in admin_profiles.
-- This lets the panel render the user list and lets role-checking queries work.
DROP POLICY IF EXISTS "admin_profiles_authenticated_select"
    ON public.admin_profiles;

CREATE POLICY "admin_profiles_authenticated_select"
    ON public.admin_profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- Only an authenticated user whose own profile has role = 'admin'
-- is allowed to insert new rows (i.e., register a new panel user).
-- The sub-select is safe: it reads from the same table but is evaluated
-- against the service role path, so it cannot be short-circuited by RLS.
DROP POLICY IF EXISTS "admin_profiles_admin_insert"
    ON public.admin_profiles;

CREATE POLICY "admin_profiles_admin_insert"
    ON public.admin_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.admin_profiles AS ap
            WHERE ap.id   = auth.uid()
              AND ap.role = 'admin'
        )
    );


-- ===========================================================================
-- 3. FUNCTION: get_my_role()
--
-- Returns the role text for the currently authenticated Supabase user.
-- Returns NULL if the user has no row in admin_profiles (i.e., not a panel user).
--
-- SECURITY DEFINER so it can read admin_profiles without being blocked by RLS,
-- while the caller only ever sees their own role string — not other rows.
--
-- Usage from the client (PostgREST RPC):
--   POST /rest/v1/rpc/get_my_role
--   (no body required)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM   public.admin_profiles
    WHERE  id = auth.uid()
    LIMIT  1;
$$;

COMMENT ON FUNCTION public.get_my_role() IS
    'Returns the role of the currently authenticated user from admin_profiles. '
    'Returns NULL if the user has no admin_profiles row. '
    'Declared SECURITY DEFINER so callers cannot infer other rows via RLS timing.';

-- Revoke direct execute from public/anon; only authenticated users need it.
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_role() TO   authenticated;


-- ==========================================================================
-- [04/15] 004_landing_config.sql
-- ==========================================================================

-- Migration 004: landing_config table for CMS
-- Stores editable content for the public landing page.

CREATE TABLE IF NOT EXISTS landing_config (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  section     text        NOT NULL,
  key         text        NOT NULL,
  value       text,
  type        text        DEFAULT 'text',   -- text | image_url | html
  label       text,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (section, key)
);

-- RLS: only admins can read/write
ALTER TABLE landing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_landing_config" ON landing_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM admin_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION update_landing_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS landing_config_updated_at ON landing_config;
CREATE TRIGGER landing_config_updated_at
  BEFORE UPDATE ON landing_config
  FOR EACH ROW EXECUTE FUNCTION update_landing_config_updated_at();

-- Seed initial values matching current landing page content
INSERT INTO landing_config (section, key, value, type, label) VALUES
  -- Hero
  ('hero', 'description',
   'En Sustenta Futuro transformamos la complejidad tecnológica en ventajas competitivas estratégicas. Creamos plataformas digitales, aplicaciones y sistemas de automatización avanzada que optimizan procesos críticos, permitiendo que las organizaciones se enfoquen exclusivamente en la innovación y su crecimiento sostenible.',
   'text', 'Descripción del hero'),

  -- Metrics
  ('metrics', 'metric_1_num',   '80%',   'text', 'Métrica 1 — número'),
  ('metrics', 'metric_1_label', 'ahorro de tiempo en tareas repetitivas', 'text', 'Métrica 1 — descripción'),
  ('metrics', 'metric_2_num',   '24/7',  'text', 'Métrica 2 — número'),
  ('metrics', 'metric_2_label', 'disponibilidad sin interrupciones', 'text', 'Métrica 2 — descripción'),
  ('metrics', 'metric_3_num',   '100%',  'text', 'Métrica 3 — número'),
  ('metrics', 'metric_3_label', 'personalización y soporte técnico ágil', 'text', 'Métrica 3 — descripción'),

  -- Quiénes somos
  ('nosotros', 'text_1',
   'Nuestra historia comenzó desde adentro de la agroindustria, desarrollando sistemas integrales para resolver cuellos de botella operativos reales. Al ver el impacto transformador de estas tecnologías, decidimos independizarnos para fundar Sustenta Futuro.',
   'text', 'Párrafo 1'),
  ('nosotros', 'text_2',
   'Nuestra misión es democratizar la automatización y el desarrollo a medida, permitiendo que las empresas dejen de lado el trabajo mecánico y enfoquen su talento en la innovación y el crecimiento.',
   'text', 'Párrafo 2'),
  ('nosotros', 'founder_photo_url', '', 'image_url', 'URL de la foto del fundador'),
  ('nosotros', 'founder_name', 'Héctor Molt · Fundador & Arquitecto de Soluciones', 'text', 'Nombre del fundador'),

  -- Testimonials
  ('testimonios', 'tc_1_text',
   'Implementaron un sistema de monitoreo de cosecha que captura datos en terreno y genera reportes de calidad en tiempo real. Lo que antes requería horas de consolidación manual, hoy está disponible en el momento. El impacto en nuestra toma de decisiones fue inmediato.',
   'text', 'Testimonio 1 — texto'),
  ('testimonios', 'tc_1_name',  'Gerente de Finanzas', 'text', 'Testimonio 1 — nombre'),
  ('testimonios', 'tc_1_role',  'Empresa Agroindustrial · Uvas de exportación', 'text', 'Testimonio 1 — cargo'),

  ('testimonios', 'tc_2_text',
   'La plataforma de gestión de RRHH con el asistente virtual transformó el onboarding de nuestra operación. El chatbot resuelve dudas operativas al instante y la integración con Buk funcionó sin fricciones. Nuestro equipo de RRHH recuperó semanas de trabajo al año.',
   'text', 'Testimonio 2 — texto'),
  ('testimonios', 'tc_2_name',  'Gerente de Finanzas', 'text', 'Testimonio 2 — nombre'),
  ('testimonios', 'tc_2_role',  'Empresa Agroindustrial · Nueces de exportación', 'text', 'Testimonio 2 — cargo'),

  ('testimonios', 'tc_3_text',
   'Lo que más valoramos fue la profundidad técnica combinada con el entendimiento real de nuestra operación. No vinieron a vender una solución genérica — diseñaron una arquitectura específica para nuestro flujo. La calidad y el compromiso fueron excepcionales.',
   'text', 'Testimonio 3 — texto'),
  ('testimonios', 'tc_3_name',  'Gerente de Finanzas', 'text', 'Testimonio 3 — nombre'),
  ('testimonios', 'tc_3_role',  'Empresa Agroindustrial · Plantas de procesamiento', 'text', 'Testimonio 3 — cargo')

ON CONFLICT (section, key) DO NOTHING;


-- ==========================================================================
-- [05/15] 002_propuestas_proyectos_levantamiento.sql
-- ==========================================================================

-- Migration 002: propuestas, proyectos, levantamiento_respuestas
-- Apply in: https://supabase.com/dashboard/project/rddbfflzhdwhefrkpkcj/editor

-- ============================================================
-- PROPUESTAS
-- ============================================================
CREATE TABLE IF NOT EXISTS propuestas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'reviewing'
    CHECK (status IN ('reviewing', 'sent', 'approved', 'rejected')),
  cost NUMERIC(12,2),
  duration_weeks INTEGER,
  stack TEXT,
  functionalities TEXT,
  implementation_plan TEXT,
  payment_method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE propuestas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_propuestas"
  ON propuestas FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- PROYECTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS proyectos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  propuesta_id UUID REFERENCES propuestas(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  cost NUMERIC(12,2),
  duration_weeks INTEGER,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_proyectos"
  ON proyectos FOR ALL
  USING (auth.role() = 'authenticated');

-- ============================================================
-- LEVANTAMIENTO RESPUESTAS
-- ============================================================
CREATE TABLE IF NOT EXISTS levantamiento_respuestas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  pregunta TEXT NOT NULL,
  respuesta TEXT DEFAULT '',
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE levantamiento_respuestas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_levantamiento"
  ON levantamiento_respuestas FOR ALL
  USING (auth.role() = 'authenticated');


-- ==========================================================================
-- [06/15] 003_proyectos_status_update.sql
-- ==========================================================================

-- Migration 003: update proyectos status CHECK constraint
-- Adds en_desarrollo and en_entrega stages, removes paused
-- Apply in: https://supabase.com/dashboard/project/rddbfflzhdwhefrkpkcj/editor

ALTER TABLE proyectos
  DROP CONSTRAINT IF EXISTS proyectos_status_check;

ALTER TABLE proyectos
  ADD CONSTRAINT proyectos_status_check
  CHECK (status IN ('active', 'en_desarrollo', 'en_entrega', 'completed', 'cancelled'));

-- Migrate existing 'paused' rows to 'en_desarrollo'
UPDATE proyectos SET status = 'en_desarrollo' WHERE status = 'paused';


-- ==========================================================================
-- [07/15] 005_etapa2_schema.sql
-- ==========================================================================

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


-- ==========================================================================
-- [08/15] 006_admin_auth_rls.sql
-- ==========================================================================

-- =============================================================================
-- Migration: 006_admin_auth_rls
-- Project:   Sustenta Futuro — Etapa 2 Fase 2
-- Created:   2026-05-25
--
-- Changes:
--   1. Create function is_admin() to check admin_profiles membership
--   2. Add RLS policies on leads table: anon blocked, admin-only read/write
--   3. Update RLS policies on related tables to use is_admin()
--   4. Create RPC get_my_role for frontend role check
-- =============================================================================


-- ===========================================================================
-- 1. HELPER FUNCTION: is_admin()
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles
    WHERE email = auth.jwt() ->> 'email'
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Returns true if the current authenticated user has an admin_profiles entry.';


-- ===========================================================================
-- 2. RPC: get_my_role (used by frontend for conditional nav)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role
  FROM public.admin_profiles
  WHERE email = auth.jwt() ->> 'email'
  LIMIT 1;
$$;


-- ===========================================================================
-- 3. RLS ON leads TABLE
-- ===========================================================================

-- Enable RLS (idempotent)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Drop any existing permissive policies
DROP POLICY IF EXISTS "leads_anon_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_admin_select" ON public.leads;
DROP POLICY IF EXISTS "leads_admin_update" ON public.leads;
DROP POLICY IF EXISTS "leads_admin_delete" ON public.leads;
DROP POLICY IF EXISTS "leads_service_insert" ON public.leads;

-- Allow anonymous inserts (public lead form) — only INSERT, no read
CREATE POLICY "leads_anon_insert"
  ON public.leads FOR INSERT TO anon
  WITH CHECK (true);

-- Allow admin users to read all leads
CREATE POLICY "leads_admin_select"
  ON public.leads FOR SELECT TO authenticated
  USING (public.is_admin());

-- Allow admin users to update leads
CREATE POLICY "leads_admin_update"
  ON public.leads FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Allow admin users to delete leads (rare, but needed for data cleanup)
CREATE POLICY "leads_admin_delete"
  ON public.leads FOR DELETE TO authenticated
  USING (public.is_admin());


-- ===========================================================================
-- 4. RLS ON lead_status_history
-- ===========================================================================

ALTER TABLE public.lead_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_status_history_admin_select" ON public.lead_status_history;
DROP POLICY IF EXISTS "lead_status_history_admin_insert" ON public.lead_status_history;

CREATE POLICY "lead_status_history_admin_select"
  ON public.lead_status_history FOR SELECT TO authenticated
  USING (public.is_admin());

-- Insert is done by trigger (SECURITY DEFINER), but also allow admin manual insert
CREATE POLICY "lead_status_history_admin_insert"
  ON public.lead_status_history FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());


-- ===========================================================================
-- 5. RLS ON lead_notes
-- ===========================================================================

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_notes_admin_select" ON public.lead_notes;
DROP POLICY IF EXISTS "lead_notes_admin_insert" ON public.lead_notes;

CREATE POLICY "lead_notes_admin_select"
  ON public.lead_notes FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "lead_notes_admin_insert"
  ON public.lead_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());


-- ===========================================================================
-- 6. UPDATE EXISTING POLICIES ON ETAPA 2 TABLES
-- ===========================================================================

-- lead_evaluations: tighten to is_admin()
DROP POLICY IF EXISTS "lead_evaluations_admin_select" ON public.lead_evaluations;
DROP POLICY IF EXISTS "lead_evaluations_admin_insert" ON public.lead_evaluations;
DROP POLICY IF EXISTS "lead_evaluations_admin_update" ON public.lead_evaluations;

CREATE POLICY "lead_evaluations_admin_select"
  ON public.lead_evaluations FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "lead_evaluations_admin_insert"
  ON public.lead_evaluations FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "lead_evaluations_admin_update"
  ON public.lead_evaluations FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- lead_proposals
DROP POLICY IF EXISTS "lead_proposals_admin_select" ON public.lead_proposals;
DROP POLICY IF EXISTS "lead_proposals_admin_insert" ON public.lead_proposals;
DROP POLICY IF EXISTS "lead_proposals_admin_update" ON public.lead_proposals;

CREATE POLICY "lead_proposals_admin_select"
  ON public.lead_proposals FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "lead_proposals_admin_insert"
  ON public.lead_proposals FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "lead_proposals_admin_update"
  ON public.lead_proposals FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- phases
DROP POLICY IF EXISTS "phases_admin_select" ON public.phases;
DROP POLICY IF EXISTS "phases_admin_insert" ON public.phases;
DROP POLICY IF EXISTS "phases_admin_update" ON public.phases;

CREATE POLICY "phases_admin_select"
  ON public.phases FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "phases_admin_insert"
  ON public.phases FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "phases_admin_update"
  ON public.phases FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- tasks
DROP POLICY IF EXISTS "tasks_admin_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_admin_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_admin_update" ON public.tasks;

CREATE POLICY "tasks_admin_select"
  ON public.tasks FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "tasks_admin_insert"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "tasks_admin_update"
  ON public.tasks FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- task_notes
DROP POLICY IF EXISTS "task_notes_admin_select" ON public.task_notes;
DROP POLICY IF EXISTS "task_notes_admin_insert" ON public.task_notes;

CREATE POLICY "task_notes_admin_select"
  ON public.task_notes FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "task_notes_admin_insert"
  ON public.task_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- daily_reports
DROP POLICY IF EXISTS "daily_reports_admin_select" ON public.daily_reports;
DROP POLICY IF EXISTS "daily_reports_admin_insert" ON public.daily_reports;

CREATE POLICY "daily_reports_admin_select"
  ON public.daily_reports FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "daily_reports_admin_insert"
  ON public.daily_reports FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- phase_files
DROP POLICY IF EXISTS "phase_files_admin_select" ON public.phase_files;
DROP POLICY IF EXISTS "phase_files_admin_insert" ON public.phase_files;

CREATE POLICY "phase_files_admin_select"
  ON public.phase_files FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "phase_files_admin_insert"
  ON public.phase_files FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- activity_log
DROP POLICY IF EXISTS "activity_log_admin_select" ON public.activity_log;
DROP POLICY IF EXISTS "activity_log_admin_insert" ON public.activity_log;

CREATE POLICY "activity_log_admin_select"
  ON public.activity_log FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "activity_log_admin_insert"
  ON public.activity_log FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());


-- ===========================================================================
-- SUMMARY
-- ===========================================================================
-- Created: is_admin() function, get_my_role() RPC
-- Updated: RLS policies on 11 tables to require admin_profiles membership
-- Public form (anon insert on leads) still works
-- Service role key bypasses all RLS (used by FastAPI backend)
-- =============================================================================


-- ==========================================================================
-- [09/15] 007_drop_pista_a.sql
-- ==========================================================================

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


-- ==========================================================================
-- [10/15] 008_proposal_versioning.sql
-- ==========================================================================

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


-- ==========================================================================
-- [11/15] 009_proposal_chat.sql
-- ==========================================================================

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


-- ==========================================================================
-- [12/15] 010_projects.sql
-- ==========================================================================

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


-- ==========================================================================
-- [13/15] 011_project_finished_at.sql
-- ==========================================================================

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


-- ==========================================================================
-- [14/15] 012_proposal_quote_number.sql
-- ==========================================================================

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


-- ==========================================================================
-- [15/15] 013_admin_phone.sql
-- ==========================================================================

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
