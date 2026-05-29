"""Institutional proposal PDF generator for Sustenta Futuro.

Builds a client-facing proposal from a lead + its technical-economic
evaluation, following the SF structure: encabezado, objetivo, alcance, stack,
fases, inversión, condiciones, firmas.

Design note: uses fpdf2's built-in *core* Helvetica font (no TTF files), so it
runs unchanged on the Linux deploy target (Render) without bundling fonts.
Core fonts are limited to Latin-1, which fully covers Spanish; all dynamic text
is passed through ``_l1()`` to drop characters outside that range.
"""

from datetime import date

from fpdf import FPDF

# ── Palette (matches the SF institutional document style) ────────────────────
DARK = (26, 26, 46)
BLUE = (15, 52, 96)
ACCENT = (233, 69, 96)
WHITE = (255, 255, 255)
GRAY_100 = (248, 249, 250)
GRAY_200 = (233, 236, 239)
GRAY_500 = (173, 181, 189)
GRAY_600 = (108, 117, 125)
GRAY_700 = (73, 80, 87)
GRAY_900 = (33, 37, 41)

FONT = "Helvetica"

# Characters outside Latin-1 that commonly appear in pasted text.
_REPLACEMENTS = {
    "—": "-",   # em dash
    "–": "-",   # en dash
    "‘": "'", "’": "'",   # smart single quotes
    "“": '"', "”": '"',   # smart double quotes
    "…": "...",  # ellipsis
    "•": "-",   # bullet
    "€": "EUR",  # euro
    "→": "->",  # right arrow
}


def _l1(value: object) -> str:
    """Coerce any value to a Latin-1-safe string for the core font."""
    text = "" if value is None else str(value)
    for bad, good in _REPLACEMENTS.items():
        text = text.replace(bad, good)
    return text.encode("latin-1", "replace").decode("latin-1")


def _as_items(value: object) -> list[str]:
    """Normalise a jsonb field (list of str or list of dict) into display lines."""
    if not value:
        return []
    if isinstance(value, dict):
        value = [value]
    lines: list[str] = []
    for item in value if isinstance(value, list) else [value]:
        if isinstance(item, dict):
            # Render dicts as "key: value" joined, or a known {name,...} shape.
            if "name" in item:
                extra = item.get("duration") or item.get("hours") or item.get("detail")
                lines.append(f"{item['name']}" + (f" - {extra}" if extra else ""))
            elif "concept" in item:
                amount = item.get("amount") or item.get("value") or ""
                lines.append(f"{item['concept']}: {amount}")
            else:
                lines.append(", ".join(f"{k}: {v}" for k, v in item.items()))
        else:
            lines.append(str(item))
    return lines


class ProposalPDF(FPDF):
    """A4 proposal document with SF section styling."""

    def __init__(self) -> None:
        super().__init__("P", "mm", "A4")
        self.set_auto_page_break(True, margin=20)
        self.set_left_margin(20)
        self.set_right_margin(20)

    # ── low-level colour helpers ─────────────────────────────────────────────
    def _c(self, rgb: tuple) -> None:
        self.set_text_color(*rgb)

    def _f(self, rgb: tuple) -> None:
        self.set_fill_color(*rgb)

    def _d(self, rgb: tuple) -> None:
        self.set_draw_color(*rgb)

    # ── building blocks ──────────────────────────────────────────────────────
    def sect(self, num: int, title: str) -> None:
        self.ln(6)
        x, y = self.get_x(), self.get_y()
        self._f(ACCENT)
        self.ellipse(x, y, 7, 7, style="F")
        self.set_font(FONT, "B", 9)
        self._c(WHITE)
        self.set_xy(x, y + 0.5)
        self.cell(7, 6, str(num), align="C")
        self.set_xy(x + 9, y - 0.5)
        self.set_font(FONT, "B", 14)
        self._c(DARK)
        self.cell(0, 8, _l1(title))
        self.ln(9)
        self._d(ACCENT)
        self.line(self.l_margin, self.get_y(), self.l_margin + 60, self.get_y())
        self.ln(4)

    def sub(self, text: str) -> None:
        self.ln(2)
        self.set_font(FONT, "B", 11)
        self._c(BLUE)
        self.cell(0, 6, _l1(text))
        self.ln(7)

    def txt(self, text: str) -> None:
        self.set_font(FONT, "", 10)
        self._c(GRAY_900)
        self.multi_cell(0, 5.5, _l1(text))
        self.ln(1)

    def itxt(self, text: str) -> None:
        self.set_font(FONT, "I", 9)
        self._c(GRAY_600)
        self.multi_cell(0, 5, _l1(text))
        self.ln(1)

    def bullets(self, items: list[str]) -> None:
        self.set_font(FONT, "", 10)
        self._c(GRAY_900)
        for item in items:
            if self.get_y() + 6 > self.h - 20:
                self.add_page()
            self.set_x(self.l_margin + 3)
            self._c(ACCENT)
            self.cell(4, 5.5, "-")
            self._c(GRAY_900)
            self.multi_cell(0, 5.5, _l1(item))
        self.ln(2)

    def kv_table(self, rows: list[tuple[str, str]]) -> None:
        w = self.w - self.l_margin - self.r_margin
        label_w = 55
        for i, (label, value) in enumerate(rows):
            self.set_font(FONT, "B", 9)
            self._f(GRAY_100 if i % 2 == 0 else WHITE)
            self._c(GRAY_700)
            y = self.get_y()
            self.cell(label_w, 7, _l1(label), fill=True)
            self.set_font(FONT, "", 9)
            self._c(GRAY_900)
            self.multi_cell(w - label_w, 7, _l1(value), fill=True)
            self.set_y(max(self.get_y(), y + 7))
        self.ln(3)


def build_proposal_pdf(lead: dict, evaluation: dict) -> bytes:
    """Render a proposal PDF for a lead + evaluation and return the bytes."""
    pdf = ProposalPDF()
    pdf.add_page()

    currency = evaluation.get("price_currency") or "UF"

    # ── Header band ──────────────────────────────────────────────────────────
    pdf._f(DARK)
    pdf.rect(0, 0, 210, 38, style="F")
    pdf._f(ACCENT)
    pdf.rect(0, 38, 210, 1.5, style="F")
    pdf.set_xy(20, 10)
    pdf.set_font(FONT, "B", 9)
    pdf._c((180, 190, 210))
    pdf.cell(0, 5, "SUSTENTA FUTURO SpA")
    pdf.set_xy(20, 16)
    pdf.set_font(FONT, "B", 18)
    pdf._c(WHITE)
    pdf.cell(0, 9, "Propuesta de Servicios")
    pdf.set_xy(20, 26)
    pdf.set_font(FONT, "I", 8.5)
    pdf._c((150, 160, 180))
    pdf.cell(0, 5, "Potencia tu operacion. Libera tu talento.")
    pdf.set_y(48)

    title = evaluation.get("project_title") or lead.get("project_title") or "Propuesta de proyecto"
    pdf.set_font(FONT, "B", 13)
    pdf._c(DARK)
    pdf.multi_cell(0, 7, _l1(title))
    pdf.ln(2)

    # ── Encabezado: cliente + emisión ─────────────────────────────────────────
    pdf.sect(1, "Encabezado")
    pdf.kv_table([
        ("Proveedor", "Sustenta Futuro SpA"),
        ("Cliente", lead.get("full_name") or "-"),
        ("Empresa", lead.get("company") or "-"),
        ("Email", lead.get("email") or "-"),
        ("Fecha de emision", date.today().strftime("%d/%m/%Y")),
        ("Vigencia de la oferta", f"{evaluation.get('offer_validity') or 15} dias"),
    ])

    # ── Objetivo ──────────────────────────────────────────────────────────────
    pdf.sect(2, "Objetivo del Proyecto")
    pdf.txt(evaluation.get("description") or "Por definir.")

    # ── Alcance técnico ─────────────────────────────────────────────────────────
    pdf.sect(3, "Alcance Tecnico")
    funcs = _as_items(evaluation.get("functionalities"))
    if funcs:
        pdf.bullets(funcs)
    else:
        pdf.itxt("Alcance por detallar.")

    # ── Stack tecnológico ──────────────────────────────────────────────────────
    pdf.sect(4, "Stack Tecnologico")
    stack = _as_items(evaluation.get("stack"))
    if stack:
        pdf.bullets(stack)
    else:
        pdf.itxt("Stack por definir.")

    # ── Fases ──────────────────────────────────────────────────────────────────
    pdf.sect(5, "Fases de Implementacion")
    phases = _as_items(evaluation.get("phases"))
    if phases:
        pdf.bullets(phases)
    else:
        pdf.itxt("Fases por planificar.")
    if evaluation.get("total_duration"):
        pdf.txt(f"Duracion total estimada: {evaluation['total_duration']}.")

    # ── Inversión ────────────────────────────────────────────────────────────────
    pdf.sect(6, "Inversion Requerida")
    price = evaluation.get("client_price")
    inv_rows: list[tuple[str, str]] = []
    if price is not None:
        inv_rows.append(("Inversion total", f"{_fmt_amount(price)} {currency}"))
    breakdown = _as_items(evaluation.get("price_breakdown"))
    for line in breakdown:
        inv_rows.append(("Detalle", line))
    if evaluation.get("monthly_maintenance") is not None:
        inv_rows.append(
            ("Mantenimiento mensual", f"{_fmt_amount(evaluation['monthly_maintenance'])} {currency}/mes")
        )
    if inv_rows:
        pdf.kv_table(inv_rows)
    else:
        pdf.itxt("Inversion por definir.")

    # ── Condiciones comerciales ─────────────────────────────────────────────────
    pdf.sect(7, "Condiciones Comerciales")
    cond_rows: list[tuple[str, str]] = []
    if evaluation.get("payment_method"):
        cond_rows.append(("Forma de pago", evaluation["payment_method"]))
    cond_rows.append(("Vigencia de la oferta", f"{evaluation.get('offer_validity') or 15} dias"))
    if evaluation.get("total_duration"):
        cond_rows.append(("Plazo de ejecucion", evaluation["total_duration"]))
    pdf.kv_table(cond_rows)

    # ── Firmas ──────────────────────────────────────────────────────────────────
    pdf.sect(8, "Aprobacion")
    pdf.txt("La firma de este documento habilita el inicio formal del proyecto.")
    pdf.ln(12)
    sw, gap = 70, 25
    x1 = pdf.l_margin + 5
    x2 = x1 + sw + gap
    ys = pdf.get_y() + 12
    pdf._d(GRAY_600)
    pdf.line(x1, ys, x1 + sw, ys)
    pdf.line(x2, ys, x2 + sw, ys)
    pdf.set_xy(x1, ys + 2)
    pdf.set_font(FONT, "B", 10)
    pdf._c(DARK)
    pdf.cell(sw, 5, "Sustenta Futuro SpA", align="C")
    pdf.set_xy(x1, ys + 7)
    pdf.set_font(FONT, "", 8)
    pdf._c(GRAY_600)
    pdf.cell(sw, 5, "Proveedor", align="C")
    pdf.set_xy(x2, ys + 2)
    pdf.set_font(FONT, "B", 10)
    pdf._c(DARK)
    pdf.cell(sw, 5, _l1(lead.get("full_name") or "Cliente"), align="C")
    pdf.set_xy(x2, ys + 7)
    pdf.set_font(FONT, "", 8)
    pdf._c(GRAY_600)
    pdf.cell(sw, 5, _l1(lead.get("company") or "Cliente"), align="C")

    out = pdf.output()
    return bytes(out)


def _fmt_amount(value: object) -> str:
    """Format a numeric amount with thousands separators (es-CL style)."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if number == int(number):
        return f"{int(number):,}".replace(",", ".")
    return f"{number:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
