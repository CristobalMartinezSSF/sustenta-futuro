"""Render a self-contained HTML preview of the proposal template.

Fills `services/api/app/templates/proposal.html.j2` with the reference
"Conector DT" data so the visual fidelity can be verified in a browser before
wiring the template to live lead/evaluation data.

Run:  python docs/proposal-format/render_preview.py
Out:  docs/proposal-format/cotizacion-preview.html
"""

from __future__ import annotations

import base64
import io
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = ROOT / "services" / "api" / "app" / "templates"
LOGO = ROOT / "apps" / "web" / "logo-full.png"
OUT = ROOT / "docs" / "proposal-format" / "cotizacion-preview.html"


def logo_data_uri(width: int = 700) -> str:
    """Return the brand logo as a downscaled base64 PNG data URI."""
    im = Image.open(LOGO).convert("RGBA")
    h = int(im.height * width / im.width)
    im = im.resize((width, h), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


# ── Reference data: Cotización N°001-2026 — Conector DT ───────────────────────
CONTEXT = {
    "quote_number": "COT-001-2026",
    "city": "Santiago",
    "issued_date_label": "25 de Febrero de 2026",
    "issued_date_short": "25/02/2026",
    "validity_days": 15,
    "doc_kind": "Cotización Formal",
    "title": "Conector DT para HCMFront",
    "title_highlight": "Conector DT",
    "title_rest": "para HCMFront",
    "subtitle": "Extensión Chrome para integración segura con el portal midt.dirtrab.cl",
    "provider": {
        "name": "Sustenta Futuro SpA",
        "email": "hector.molt@sustentafuturo.com",
        "rut": "77.970.428-9",
        "giro": "Servicios de Informática (620200)",
        "bank": "Banco de Chile · Cta. Cte. 00-283-03997-03",
    },
    "client": {
        "company": "HCMFront",
        "attention": "Paul Escapil-Inchauspé",
        "country": "Chile",
    },
    "description": [
        "El Conector DT es una extensión de navegador Chrome (Manifest V3) diseñada para "
        "automatizar la extracción y sincronización de datos laborales desde el portal "
        "gubernamental Mi Dirección del Trabajo (midt.dirtrab.cl) hacia la plataforma HCMFront, "
        "eliminando la carga manual de datos que hoy consume aproximadamente 160 horas-hombre "
        "por cada 1.000 registros mensuales.",
        "La solución opera bajo sesión activa y autorizada del usuario, cumplimiento estricto de "
        "la Ley 21.459 de Delitos Informáticos, y cifrado de extremo a extremo (AES-256-GCM/ECDH "
        "P-256) para garantizar la integridad y confidencialidad de los datos.",
    ],
    "scope": [
        {"title": "Agente de Intercepción",
         "desc": "Captura pasiva de tráfico XHR/Fetch en tiempo real mediante Main World Injection. "
                 "El usuario navega con normalidad; la extensión escucha y captura los datos que el "
                 "portal ya entrega. Tiempo de intercepción: 0 ms adicionales (event-driven)."},
        {"title": "Agente de Seguridad (E2EE)",
         "desc": "Implementación de cifrado de extremo a extremo. Handshake ECDH P-256 por sesión, "
                 "cifrado AES-256-GCM, IV aleatorio por mensaje. Zero Knowledge: la extensión nunca "
                 "almacena credenciales del portal DT."},
        {"title": "Sincronización Automática post-Login",
         "desc": "Una vez autenticado el usuario en el portal (único paso manual, ~60 seg), la "
                 "extensión extrae automáticamente todos los endpoints configurados sin requerir "
                 "navegación adicional. Sincronización incremental vía chrome.alarms cada 5 minutos "
                 "mientras la sesión está activa."},
        {"title": "Integración API HCMFront",
         "desc": "Conexión autenticada con el backend de HCMFront (Bearer Token / mTLS). Transmisión "
                 "del payload cifrado, manejo de errores y reintentos automáticos. Endpoints: "
                 "POST /handshake y POST /sync."},
        {"title": "Distribución a usuarios finales",
         "desc": "Publicación en Chrome Web Store (modalidad Unlisted). HCMFront integra detección "
                 "automática de la extensión en su plataforma: si el usuario no la tiene instalada, "
                 "se muestra un botón de instalación directa sin necesidad de Google Workspace."},
        {"title": "Documentación y Capacitación",
         "desc": "Documentación técnica completa (API Spec, Data Flow). Manual de instalación para IT "
                 "y usuarios finales. Dos sesiones de capacitación técnica y una sesión de "
                 "capacitación para usuarios."},
    ],
    "stack": [
        {"layer": "Extensión", "tech": "Chrome Manifest V3 / TypeScript",
         "rationale": "Estándar actual de Google, máxima seguridad y compatibilidad"},
        {"layer": "Intercepción", "tech": "XHR/Fetch Monkey-patch (Main World)",
         "rationale": "Indetectable, sin impacto en el portal DT"},
        {"layer": "Criptografía", "tech": "Web Crypto API — ECDH P-256 + AES-256-GCM",
         "rationale": "Nativa del navegador, sin librerías externas"},
        {"layer": "Automatización", "tech": "chrome.alarms + fetch() con sesión activa",
         "rationale": "Sync periódico sin navegación del usuario"},
        {"layer": "Backend", "tech": "Python 3.10 / FastAPI",
         "rationale": "Alta performance, tipado fuerte, API REST moderna"},
        {"layer": "Distribución", "tech": "Chrome Web Store (Unlisted)",
         "rationale": "Sin dependencia de Google Workspace, instalación 2 clics"},
        {"layer": "Transporte", "tech": "HTTPS / TLS 1.3",
         "rationale": "Máximo estándar de seguridad en transporte"},
    ],
    "comparison": {
        "heading": "Comparativa: RPA vs Extensión Chrome",
        "col_a": "RPA (UiPath / Power Automate)",
        "col_b": "Extensión Chrome ✅",
        "rows": [
            {"factor": "Costo de licencias", "a": "$5.000-$15.000 USD/año adicional",
             "b": "$300 USD/mes flat, sin costos ocultos"},
            {"factor": "Fragilidad ante cambios UI", "a": "Alta — cada cambio visual puede romperlo",
             "b": "Baja — intercepta APIs, no interfaces"},
            {"factor": "Detección como bot", "a": "Alta — riesgo de bloqueo permanente",
             "b": "Nula — opera en sesión humana real"},
            {"factor": "Cumplimiento legal", "a": "⚠️ Riesgo si automatiza credenciales",
             "b": "✅ Ley 21.459 — sesión autorizada del usuario"},
            {"factor": "Costo de mantenimiento", "a": "Alto — ajustes frecuentes por cambios UI",
             "b": "Bajo — APIs estables"},
            {"factor": "Infraestructura requerida", "a": "VM / servidor dedicado 24/7",
             "b": "Navegador del usuario (sin servidor propio)"},
            {"factor": "Tiempo de implementación", "a": "10-16 semanas", "b": "5 semanas"},
        ],
        "conclusion": "La RPA es la solución más cara en el mediano plazo y la más frágil "
                      "técnicamente. La extensión Chrome es más barata, más robusta y legalmente "
                      "más segura para este caso de uso específico.",
    },
    "economics": {
        "currency": "USD",
        "items": [
            {"concept": "Licencia de Uso & Código Fuente",
             "detail": "Extensión completa Manifest V3 · Documentación técnica · Propiedad del código",
             "value": "$5.500"},
            {"concept": "Implementación, Integración & Capacitación",
             "detail": "Configuración de endpoints · Integración API HCMFront · Distribución CWS · Capacitación IT y usuarios",
             "value": "$1.500"},
            {"concept": "Módulo de Automatización (Sync Automático)",
             "detail": "chrome.alarms + fetch automático · Detección de sesión · Notificaciones push · Smart capture al login",
             "value": "$2.000"},
        ],
        "total": {"concept": "Total Inversión Inicial",
                  "detail": "Pago único · Incluye 3 meses de garantía post-entrega",
                  "value": "$9.000"},
        "monthly": [
            {"concept": "Mantenimiento & Soporte Continuo",
             "detail": "Monitoreo · Actualizaciones de compatibilidad Chrome · Ajustes por cambios en portal DT · SLA 48h",
             "value": "$300 / mes"},
        ],
        "note": "Opción anual: $3.000 USD/año (equivale a 10 meses pagando el valor de 12). "
                "Los primeros 3 meses post-entrega están incluidos en la inversión inicial sin costo adicional.",
    },
    "plan_heading": "Plan de Implementación — 5 Semanas",
    "plan": [
        {"week": "Semana 1", "title": "Kick-off & Definición",
         "desc": "Reunión de arranque · Definición de endpoints requeridos desde midt.dirtrab.cl "
                 "(contratos, anexos, bajas, etc.) · Entrega de accesos a API · Firma de NDA"},
        {"week": "Semana 2-3", "title": "Desarrollo Core",
         "desc": "Desarrollo del agente · Hardening E2EE · Integración API HCMFront (handshake + sync) "
                 "· Módulo de automatización"},
        {"week": "Semana 3-4", "title": "QA & Testing",
         "desc": "Tests de flujo E2E con datos reales en staging · Pruebas de carga y seguridad · "
                 "Corrección de bugs · Demo con cliente"},
        {"week": "Semana 4-5", "title": "Despliegue & Go-Live",
         "desc": "Publicación Chrome Web Store · Capacitación equipo técnico y usuarios · Go-Live en "
                 "producción · Inicio de garantía"},
    ],
    "conditions": [
        {"icon": "💳", "title": "Forma de pago",
         "text": "30% al inicio · 40% al completar semana 3 · 30% al Go-Live"},
        {"icon": "💵", "title": "Moneda",
         "text": "Dólares estadounidenses (USD). Facturable en CLP a tipo de cambio del día."},
        {"icon": "🔒", "title": "Propiedad intelectual",
         "text": "Todo el código entregado pasa a ser propiedad exclusiva de HCMFront al completar el pago."},
        {"icon": "📅", "title": "Vigencia de esta cotización",
         "text": "15 días corridos desde la fecha de emisión."},
        {"icon": "🤝", "title": "Acuerdo previo al inicio",
         "text": "Se requiere firma de NDA bilateral antes del kick-off."},
        {"icon": "🧮", "title": "Ajuste de alcance",
         "text": "Cambios de alcance durante el proyecto se cotizan por separado mediante addendum."},
    ],
    "roi": {
        "col_a": "Sin Conector DT",
        "col_b": "Con Conector DT",
        "rows": [
            {"indicator": "Horas/mes en carga manual", "a": "~160 hrs (1.000 registros)", "b": "~1 min (login diario)"},
            {"indicator": "Costo operativo mensual", "a": "~$2.500 USD/mes", "b": "$300 USD/mes"},
            {"indicator": "Ahorro mensual", "a": "—", "b": "$2.200 USD/mes"},
            {"indicator": "Ahorro anual", "a": "—", "b": "$26.400 USD/año"},
            {"indicator": "Payback period", "a": "—", "b": "~4 meses"},
        ],
        "note": "Cálculo basado en 1.000 registros/mes. A mayor volumen, el ROI mejora "
                "proporcionalmente. El cálculo no incluye el ahorro adicional por eliminación de "
                "errores de tipeo y reprocesos asociados.",
    },
    "acceptance_text": "La firma de ambas partes en este documento constituye la aceptación de las "
                       "condiciones aquí detalladas y habilita el inicio formal del proyecto.",
    "signatures": {
        "provider": {"name": "Héctor Molt", "org": "Sustenta Futuro SpA", "role": "Proveedor"},
        "client": {"name": "Paul Escapil-Inchauspé", "org": "HCMFront", "role": "Cliente"},
    },
}


def main() -> None:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html", "j2"]),
    )
    template = env.get_template("proposal.html.j2")
    html = template.render(logo_src=logo_data_uri(), **CONTEXT)
    OUT.write_text(html, encoding="utf-8")
    print(f"Wrote {OUT} ({len(html):,} bytes)")


if __name__ == "__main__":
    main()
