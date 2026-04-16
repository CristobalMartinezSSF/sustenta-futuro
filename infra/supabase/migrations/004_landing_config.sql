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
