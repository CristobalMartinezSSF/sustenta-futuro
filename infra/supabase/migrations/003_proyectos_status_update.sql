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
