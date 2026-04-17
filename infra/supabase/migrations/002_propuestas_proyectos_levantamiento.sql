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
