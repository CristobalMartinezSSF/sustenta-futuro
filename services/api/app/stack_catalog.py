"""Curated default technology stacks per service type.

When an evaluation ficha is started, the stack table can be pre-filled from a
curated catalog keyed by the lead's ``service_interest``. These are Sustenta
Futuro's own, opinionated technology choices — deterministic and consistent, so
the proposal reads like expert prior work rather than AI guesswork. The admin
can freely edit every row afterwards; this only provides the starting point.

Each stack row is ``{"layer": ..., "tech": ..., "rationale": ...}`` and renders
directly into the 3-column "Stack Tecnológico" table of the proposal
(Capa / Tecnología / Justificación).
"""

from __future__ import annotations

# Service-type keys mirror app.models.lead.ServiceInterest values.
_AUTOMATIZACIONES = [
    {"layer": "Orquestación", "tech": "n8n / Python 3.10",
     "rationale": "Flujos de trabajo visuales y código a medida cuando se requiere"},
    {"layer": "Backend", "tech": "Python 3.10 / FastAPI",
     "rationale": "Alta performance, tipado fuerte, API REST moderna"},
    {"layer": "Integraciones", "tech": "REST APIs / Webhooks",
     "rationale": "Conexión con los sistemas existentes del cliente"},
    {"layer": "Base de datos", "tech": "Supabase Postgres",
     "rationale": "Sistema de registro confiable con respaldo gestionado"},
    {"layer": "Hosting", "tech": "Render",
     "rationale": "Despliegue continuo, escalable y sin servidor propio"},
    {"layer": "Transporte", "tech": "HTTPS / TLS 1.3",
     "rationale": "Máximo estándar de seguridad en transporte"},
]

_CHATBOTS = [
    {"layer": "Motor conversacional", "tech": "Claude (Anthropic API)",
     "rationale": "Modelo de última generación, respuestas precisas en español"},
    {"layer": "Backend", "tech": "Python 3.10 / FastAPI",
     "rationale": "Orquestación de la conversación y lógica de negocio"},
    {"layer": "Canales", "tech": "WhatsApp Business API / Web widget",
     "rationale": "Atención donde el cliente final ya conversa"},
    {"layer": "Base de datos", "tech": "Supabase Postgres",
     "rationale": "Historial de conversaciones y contexto persistente"},
    {"layer": "Frontend", "tech": "Next.js / React",
     "rationale": "Widget embebible y panel de administración"},
    {"layer": "Hosting", "tech": "Render / Vercel",
     "rationale": "Backend y frontend desplegados de forma independiente"},
]

_ANALITICA_IA = [
    {"layer": "Modelos", "tech": "Claude (Anthropic API)",
     "rationale": "Análisis y síntesis de datos en lenguaje natural"},
    {"layer": "Procesamiento", "tech": "Python / pandas",
     "rationale": "Transformación y limpieza de datos robusta"},
    {"layer": "Backend", "tech": "Python 3.10 / FastAPI",
     "rationale": "API de datos moderna y tipada"},
    {"layer": "Visualización", "tech": "Next.js / Recharts",
     "rationale": "Dashboards interactivos y exportables"},
    {"layer": "Base de datos", "tech": "Supabase Postgres",
     "rationale": "Almacenamiento analítico con consultas SQL"},
    {"layer": "Hosting", "tech": "Render",
     "rationale": "Despliegue escalable de los servicios de datos"},
]

_LANDING_PAGES = [
    {"layer": "Frontend", "tech": "Next.js / React",
     "rationale": "Rendimiento, SEO y experiencia premium"},
    {"layer": "Estilos", "tech": "Tailwind CSS",
     "rationale": "Diseño consistente, responsivo y mantenible"},
    {"layer": "Formularios & Backend", "tech": "FastAPI",
     "rationale": "Captura de leads validada y segura"},
    {"layer": "Base de datos", "tech": "Supabase Postgres",
     "rationale": "Almacenamiento de leads y contenido"},
    {"layer": "Hosting", "tech": "Vercel",
     "rationale": "CDN global, despliegue instantáneo, dominio propio"},
    {"layer": "Analítica", "tech": "Google Analytics 4 / Plausible",
     "rationale": "Medición de conversión y comportamiento"},
]

# Generic fallback for "Otro" / unknown service types.
_DEFAULT = [
    {"layer": "Frontend", "tech": "Next.js / React",
     "rationale": "Interfaz moderna, rápida y mantenible"},
    {"layer": "Backend", "tech": "Python 3.10 / FastAPI",
     "rationale": "Alta performance, tipado fuerte, API REST moderna"},
    {"layer": "Base de datos", "tech": "Supabase Postgres",
     "rationale": "Sistema de registro confiable con respaldo gestionado"},
    {"layer": "Hosting", "tech": "Render / Vercel",
     "rationale": "Despliegue continuo y escalable, sin servidor propio"},
    {"layer": "Transporte", "tech": "HTTPS / TLS 1.3",
     "rationale": "Máximo estándar de seguridad en transporte"},
]

# Keyed by the exact ServiceInterest enum values.
_CATALOG: dict[str, list[dict[str, str]]] = {
    "Automatizaciones": _AUTOMATIZACIONES,
    "Chatbots": _CHATBOTS,
    "Analitica IA": _ANALITICA_IA,
    "Landing pages": _LANDING_PAGES,
    "Otro": _DEFAULT,
}


def default_stack_for(service_type: str | None) -> list[dict[str, str]]:
    """Return a fresh copy of the curated default stack for a service type.

    Falls back to a generic stack for ``Otro`` / unknown / missing types. The
    copy is deep enough that callers can mutate rows without touching the
    catalog.
    """
    rows = _CATALOG.get(service_type or "", _DEFAULT)
    return [dict(row) for row in rows]
