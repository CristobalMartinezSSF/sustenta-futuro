"""Map a lead + its evaluation ficha into the proposal template context.

This is the data contract behind ``templates/proposal.html.j2``. Existing ficha
fields are mapped to the rich proposal sections; sections the ficha does not yet
carry (comparison, ROI, per-item scope titles, subtitle) fall back to a
"Por definir" placeholder so the document is always complete and consistent.

Pure functions only — no I/O, fully unit-testable.
"""

from __future__ import annotations

from datetime import date

# ── Static provider identity (Sustenta Futuro SpA) ───────────────────────────
PROVIDER = {
    "name": "Sustenta Futuro SpA",
    "email": "hector.molt@sustentafuturo.com",
    "rut": "77.970.428-9",
    "giro": "Servicios de Informática (620200)",
    "bank": "Banco de Chile · Cta. Cte. 00-283-03997-03",
}

PROVIDER_SIGNATORY = "Héctor Molt"
DEFAULT_CITY = "Santiago"

_MONTHS_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

ACCEPTANCE_TEXT = (
    "La firma de ambas partes en este documento constituye la aceptación de las "
    "condiciones aquí detalladas y habilita el inicio formal del proyecto."
)


def _fmt_amount(value: object) -> str:
    """Format a numeric amount with es-CL thousands separators."""
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return str(value)
    if number == int(number):
        return f"{int(number):,}".replace(",", ".")
    return f"{number:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _date_labels(when: date) -> tuple[str, str]:
    """Return ('25 de Febrero de 2026', '25/02/2026')."""
    long = f"{when.day} de {_MONTHS_ES[when.month - 1]} de {when.year}"
    short = when.strftime("%d/%m/%Y")
    return long, short


def _paragraphs(text: str | None) -> list[str]:
    """Split prose into paragraphs on blank lines (or single newlines)."""
    if not text:
        return []
    raw = text.replace("\r\n", "\n")
    blocks = [b.strip() for b in raw.split("\n\n") if b.strip()]
    if not blocks:
        blocks = [b.strip() for b in raw.split("\n") if b.strip()]
    return blocks


def _scope_items(functionalities: object) -> list[dict]:
    """Functionality bullets → numbered scope items {title, desc}.

    A bullet of the form 'Título: descripción' (or 'Título — descripción') is
    split into title + description; otherwise the whole bullet is the title.
    """
    items: list[dict] = []
    for raw in functionalities or []:
        if isinstance(raw, dict):
            title = raw.get("title") or raw.get("name") or ""
            items.append({"title": str(title), "desc": str(raw.get("desc") or raw.get("detail") or "")})
            continue
        text = str(raw).strip()
        if not text:
            continue
        for sep in (" — ", " - ", ": "):
            if sep in text:
                head, tail = text.split(sep, 1)
                items.append({"title": head.strip(), "desc": tail.strip()})
                break
        else:
            items.append({"title": text, "desc": ""})
    return items


def _stack_rows(stack: object) -> list[dict]:
    """Normalise the stored stack into {layer, tech, rationale} rows.

    Tolerates legacy plain-string rows (treated as the technology)."""
    rows: list[dict] = []
    for item in stack or []:
        if isinstance(item, dict):
            rows.append({
                "layer": str(item.get("layer") or ""),
                "tech": str(item.get("tech") or ""),
                "rationale": str(item.get("rationale") or ""),
            })
        elif str(item).strip():
            rows.append({"layer": "", "tech": str(item).strip(), "rationale": ""})
    return rows


def _plan_items(phases: object) -> list[dict]:
    """Phase bullets → timeline items {week, title, desc}.

    'Kick-off - 1 semana' → week='1 semana', title='Kick-off'. Dict phases with
    name/duration/desc keys are mapped directly."""
    items: list[dict] = []
    for raw in phases or []:
        if isinstance(raw, dict):
            items.append({
                "week": str(raw.get("week") or raw.get("duration") or ""),
                "title": str(raw.get("title") or raw.get("name") or ""),
                "desc": str(raw.get("desc") or raw.get("detail") or ""),
            })
            continue
        text = str(raw).strip()
        if not text:
            continue
        for sep in (" — ", " - "):
            if sep in text:
                head, tail = text.split(sep, 1)
                items.append({"week": tail.strip(), "title": head.strip(), "desc": ""})
                break
        else:
            items.append({"week": "", "title": text, "desc": ""})
    return items


def _economics(evaluation: dict, currency: str) -> dict:
    """Build the economics block from price + breakdown + maintenance."""
    items: list[dict] = []
    for raw in evaluation.get("price_breakdown") or []:
        if isinstance(raw, dict):
            concept = raw.get("concept") or raw.get("name") or ""
            value = raw.get("amount") or raw.get("value") or ""
            items.append({"concept": str(concept), "detail": str(raw.get("detail") or ""),
                          "value": f"{_fmt_amount(value)} {currency}" if value != "" else ""})
            continue
        text = str(raw).strip()
        if not text:
            continue
        if ": " in text:
            concept, value = text.split(": ", 1)
            items.append({"concept": concept.strip(), "detail": "", "value": value.strip()})
        else:
            items.append({"concept": text, "detail": "", "value": ""})

    total = None
    if evaluation.get("client_price") is not None:
        total = {
            "concept": "Total Inversión Inicial",
            "detail": "Pago único",
            "value": f"{_fmt_amount(evaluation['client_price'])} {currency}",
        }

    monthly: list[dict] = []
    if evaluation.get("monthly_maintenance") is not None:
        monthly.append({
            "concept": "Mantenimiento & Soporte Continuo",
            "detail": "Monitoreo · Actualizaciones · Soporte",
            "value": f"{_fmt_amount(evaluation['monthly_maintenance'])} {currency} / mes",
        })

    return {"currency": currency, "items": items, "total": total, "monthly": monthly, "note": ""}


def _conditions(evaluation: dict, currency: str, validity_days: int) -> list[dict]:
    """Commercial conditions grid, mixing ficha values with SF standard terms."""
    pago = evaluation.get("payment_method") or "Por definir"
    return [
        {"icon": "💳", "title": "Forma de pago", "text": pago},
        {"icon": "💵", "title": "Moneda",
         "text": f"Valores expresados en {currency}."},
        {"icon": "🔒", "title": "Propiedad intelectual",
         "text": "El código entregado pasa a ser propiedad exclusiva del cliente al completar el pago."},
        {"icon": "📅", "title": "Vigencia de esta cotización",
         "text": f"{validity_days} días corridos desde la fecha de emisión."},
        {"icon": "🤝", "title": "Acuerdo previo al inicio",
         "text": "Se requiere firma de NDA bilateral antes del kick-off."},
        {"icon": "🧮", "title": "Ajuste de alcance",
         "text": "Cambios de alcance durante el proyecto se cotizan por separado mediante addendum."},
    ]


def build_proposal_context(
    lead: dict,
    evaluation: dict,
    quote_number: str,
    issued_on: date | None = None,
) -> dict:
    """Map a lead + evaluation into the proposal template context dict."""
    issued_on = issued_on or date.today()
    long_date, short_date = _date_labels(issued_on)
    currency = evaluation.get("price_currency") or "UF"
    validity = int(evaluation.get("offer_validity") or 15)

    title = (
        evaluation.get("project_title")
        or lead.get("project_title")
        or lead.get("company")
        or "Propuesta de proyecto"
    )

    return {
        "quote_number": quote_number,
        "city": DEFAULT_CITY,
        "issued_date_label": long_date,
        "issued_date_short": short_date,
        "validity_days": validity,
        "doc_kind": "Cotización Formal",
        "title": title,
        "title_highlight": title,
        "title_rest": "",
        "subtitle": "",
        "provider": dict(PROVIDER),
        "client": {
            "company": lead.get("company") or "Por definir",
            "attention": lead.get("full_name") or "",
            "country": "Chile",
        },
        "description": _paragraphs(evaluation.get("description")),
        "scope": _scope_items(evaluation.get("functionalities")),
        "stack": _stack_rows(evaluation.get("stack")),
        "comparison": {
            "heading": "Comparativa Técnica",
            "col_a": "Alternativa",
            "col_b": "Solución propuesta",
            "rows": [],
            "conclusion": "",
        },
        "economics": _economics(evaluation, currency),
        "plan_heading": (
            f"Plan de Implementación — {evaluation['total_duration']}"
            if evaluation.get("total_duration")
            else "Plan de Implementación"
        ),
        "plan": _plan_items(evaluation.get("phases")),
        "conditions": _conditions(evaluation, currency, validity),
        "roi": {"col_a": "Situación actual", "col_b": "Con la solución", "rows": [], "note": ""},
        "acceptance_text": ACCEPTANCE_TEXT,
        "signatures": {
            "provider": {"name": PROVIDER_SIGNATORY, "org": PROVIDER["name"], "role": "Proveedor"},
            "client": {
                "name": lead.get("full_name") or lead.get("company") or "Cliente",
                "org": lead.get("company") or "",
                "role": "Cliente",
            },
        },
    }
