"""Render the proposal as HTML and convert it to PDF via headless Chromium.

Two stages:
  1. ``render_proposal_html(context)`` — fill the Jinja2 template (with the
     brand logo embedded as a data URI) and return a self-contained HTML string.
  2. ``html_to_pdf(html)`` — print the HTML to PDF bytes with headless Chromium.

PDF backend resolution order:
  - Playwright (preferred; cross-platform, used in production on Render)
  - a system Chrome/Edge binary via ``--print-to-pdf`` (developer fallback)

Both produce an identical A4 document because the layout lives entirely in the
template's print CSS.
"""

from __future__ import annotations

import base64
import os
import shutil
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

_PKG = Path(__file__).resolve().parent
_TEMPLATES = _PKG / "templates"
_LOGO = _PKG / "assets" / "logo.png"


class ProposalRenderError(RuntimeError):
    """Raised when the proposal PDF cannot be produced."""


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
    """Brand logo as a base64 PNG data URI (cached)."""
    if not _LOGO.exists():
        return ""
    b64 = base64.b64encode(_LOGO.read_bytes()).decode()
    return f"data:image/png;base64,{b64}"


@lru_cache(maxsize=1)
def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(_TEMPLATES)),
        autoescape=select_autoescape(["html", "j2"]),
    )


def render_proposal_html(context: dict) -> str:
    """Render the proposal template to a self-contained HTML string."""
    template = _env().get_template("proposal.html.j2")
    return template.render(logo_src=_logo_data_uri(), **context)


# ── HTML → PDF ────────────────────────────────────────────────────────────────


def _pdf_via_playwright(html: str) -> bytes | None:
    """Print HTML to PDF with Playwright, or None if it is unavailable."""
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except ImportError:
        return None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--no-sandbox"])
            page = browser.new_page()
            page.set_content(html, wait_until="networkidle")
            pdf = page.pdf(format="A4", print_background=True,
                           margin={"top": "0", "right": "0", "bottom": "0", "left": "0"})
            browser.close()
            return pdf
    except Exception as exc:  # pragma: no cover - runtime/launch failure
        raise ProposalRenderError(f"Playwright no pudo generar el PDF: {exc}") from exc


def _find_chrome() -> str | None:
    """Locate a Chrome/Edge binary for the subprocess fallback."""
    if env_path := os.getenv("CHROME_PATH"):
        return env_path
    for name in ("google-chrome", "google-chrome-stable", "chromium",
                 "chromium-browser", "chrome", "msedge"):
        if found := shutil.which(name):
            return found
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    ]
    return next((c for c in candidates if Path(c).exists()), None)


def _pdf_via_chrome_cli(html: str) -> bytes:
    """Print HTML to PDF with a system Chrome/Edge via --print-to-pdf."""
    chrome = _find_chrome()
    if not chrome:
        raise ProposalRenderError(
            "No hay backend de PDF disponible (ni Playwright ni Chrome/Edge)."
        )
    with tempfile.TemporaryDirectory() as tmp:
        html_path = Path(tmp) / "proposal.html"
        pdf_path = Path(tmp) / "proposal.pdf"
        html_path.write_text(html, encoding="utf-8")
        subprocess.run(
            [chrome, "--headless=new", "--disable-gpu", "--no-sandbox",
             "--run-all-compositor-stages-before-draw", "--virtual-time-budget=5000",
             "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", html_path.as_uri()],
            check=True, capture_output=True, timeout=60,
        )
        if not pdf_path.exists():
            raise ProposalRenderError("Chrome no generó el PDF.")
        return pdf_path.read_bytes()


def html_to_pdf(html: str) -> bytes:
    """Convert HTML to PDF bytes using the best available Chromium backend."""
    pdf = _pdf_via_playwright(html)
    if pdf is not None:
        return pdf
    return _pdf_via_chrome_cli(html)


def render_proposal_pdf(context: dict) -> bytes:
    """One-shot: context dict → proposal PDF bytes."""
    return html_to_pdf(render_proposal_html(context))
