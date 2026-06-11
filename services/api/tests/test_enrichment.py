"""Unit tests for the lead enrichment service (offline).

All network access is monkeypatched: `_get` is replaced with a stub and
`socket.getaddrinfo` is patched so DNS checks never hit the network. These
tests pin the robustness behaviour of the fragile Chilean scrapers (RUT
validation, per-source verification status) so a silent regression is caught.
"""

from __future__ import annotations

import socket

import pytest

from app import enrichment as enr


# ─── Fake HTTP response ───────────────────────────────────────────────────────


class FakeResponse:
    def __init__(self, status_code: int = 200, text: str = "", json_data=None):
        self.status_code = status_code
        self.text = text
        self._json = json_data

    def json(self):
        return self._json


# ─── _valid_rut (modulo-11) ───────────────────────────────────────────────────


@pytest.mark.parametrize("rut", ["8888888-K", "11.111.111-1", "12345678-5", "76086428-5"])
def test_valid_rut_accepts_correct_check_digit(rut):
    assert enr._valid_rut(rut) is True


@pytest.mark.parametrize("rut", ["12345678-9", "11111111-2", "1234", "", "abc-1", "99999999-8"])
def test_valid_rut_rejects_bad_check_digit_or_garbage(rut):
    assert enr._valid_rut(rut) is False


# ─── _source_phone ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("phone", ["+56912345678", "56912345678", "912345678", "9 1234 5678"])
def test_phone_valid_chilean(phone):
    out = enr._source_phone(phone, [])
    assert out["phone_valid"] is True


def test_phone_invalid_raises_low_flag():
    flags: list = []
    out = enr._source_phone("12345", flags)
    assert out["phone_valid"] is False
    assert any(f["code"] == "INVALID_PHONE_FORMAT" for f in flags)


# ─── _source_email (DNS patched) ──────────────────────────────────────────────


@pytest.fixture
def dns_ok(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("1.2.3.4", 0))])


def test_disposable_email_flagged(monkeypatch, dns_ok):
    flags: list = []
    out = enr._source_email("foo@mailinator.com", flags)
    assert out["email_disposable"] is True
    assert any(f["code"] == "DISPOSABLE_EMAIL" for f in flags)


def test_generic_email_low_flag(monkeypatch, dns_ok):
    flags: list = []
    out = enr._source_email("foo@gmail.com", flags)
    assert out["email_generic"] is True
    assert any(f["code"] == "GENERIC_EMAIL" for f in flags)


def test_email_invalid_domain_high_flag(monkeypatch):
    monkeypatch.setattr(
        socket, "getaddrinfo",
        lambda *a, **k: (_ for _ in ()).throw(socket.gaierror("no such host")),
    )
    flags: list = []
    out = enr._source_email("foo@nonexistent-zzz.invalid", flags)
    assert out["email_valid"] is False
    assert any(f["code"] == "EMAIL_DOMAIN_INVALID" for f in flags)


# ─── Rutificador: validates RUT + reports status ──────────────────────────────


def test_rutificador_extracts_only_valid_rut(monkeypatch):
    # Page contains an invalid RUT first, then a valid one — must pick the valid.
    html = "ruido 12.345.678-9 mas ruido 76.086.428-5 fin"
    monkeypatch.setattr(enr, "_get", lambda *a, **k: FakeResponse(200, html))
    out, status = enr._source_rutificador(None, "ACME SpA")
    assert out["company_rut"] == "76086428-5"
    assert status == enr.STATUS_OK


def test_rutificador_no_valid_rut_is_no_data(monkeypatch):
    monkeypatch.setattr(enr, "_get", lambda *a, **k: FakeResponse(200, "solo 12.345.678-9"))
    out, status = enr._source_rutificador(None, "ACME SpA")
    assert out == {}
    assert status == enr.STATUS_NO_DATA


def test_rutificador_unreachable(monkeypatch):
    monkeypatch.setattr(enr, "_get", lambda *a, **k: None)
    out, status = enr._source_rutificador(None, "ACME SpA")
    assert out == {}
    assert status == enr.STATUS_UNREACHABLE


# ─── SII: parse_failed signals scraper breakage ───────────────────────────────


def test_sii_skipped_on_invalid_rut(monkeypatch):
    called = {"n": 0}
    monkeypatch.setattr(enr, "_get", lambda *a, **k: called.__setitem__("n", called["n"] + 1))
    out, status = enr._source_sii("12345678-9", "ACME", [])
    assert status == enr.STATUS_SKIPPED
    assert called["n"] == 0  # never queried a garbage RUT


def test_sii_parse_failed_on_200_without_razon(monkeypatch):
    # A 200 with no parseable razón social → scraper likely broke / captcha.
    monkeypatch.setattr(enr, "_get", lambda *a, **k: FakeResponse(200, "<html>captcha</html>"))
    out, status = enr._source_sii("76086428-5", "ACME", [])
    assert status == enr.STATUS_PARSE_FAILED
    assert out["sii_rut"] == "76086428-5"


def test_sii_ok_and_name_mismatch_flag(monkeypatch):
    html = "NOM_RAZON >COMERCIAL LITORAL LIMITADA</td>"
    monkeypatch.setattr(enr, "_get", lambda *a, **k: FakeResponse(200, html))
    flags: list = []
    out, status = enr._source_sii("76086428-5", "Empresa Totalmente Distinta", flags)
    assert status == enr.STATUS_OK
    assert out["sii_razon_social"] == "COMERCIAL LITORAL LIMITADA"
    assert any(f["code"] == "COMPANY_NAME_MISMATCH" for f in flags)


def test_sii_unreachable(monkeypatch):
    monkeypatch.setattr(enr, "_get", lambda *a, **k: None)
    out, status = enr._source_sii("76086428-5", "ACME", [])
    assert status == enr.STATUS_UNREACHABLE


# ─── Mercado Público statuses ─────────────────────────────────────────────────


def test_mercado_publico_found(monkeypatch):
    html = "<td>76.086.428-5</td> 3 resultados"
    monkeypatch.setattr(enr, "_get", lambda *a, **k: FakeResponse(200, html))
    out, status = enr._source_mercado_publico("ACME")
    assert out["mercado_publico_found"] is True
    assert out["mercado_publico_ruts"] == ["76.086.428-5"]
    assert status == enr.STATUS_OK


def test_mercado_publico_no_data(monkeypatch):
    monkeypatch.setattr(enr, "_get", lambda *a, **k: FakeResponse(200, "<html>nada</html>"))
    out, status = enr._source_mercado_publico("ACME")
    assert out["mercado_publico_found"] is False
    assert status == enr.STATUS_NO_DATA


def test_mercado_publico_unreachable(monkeypatch):
    monkeypatch.setattr(enr, "_get", lambda *a, **k: FakeResponse(503, ""))
    out, status = enr._source_mercado_publico("ACME")
    assert status == enr.STATUS_UNREACHABLE


# ─── v4: website contact/legal extraction (waterfall inputs) ──────────────────


def test_extract_contacts_harvests_rut_email_phone_social():
    html = """
    <footer>RUT: 76.086.428-5 | contacto@acme.cl | +56 9 1234 5678
    <a href="https://www.linkedin.com/company/acme">LinkedIn</a>
    Dirección: Av. Siempre Viva 742, Santiago</footer>
    """
    out = enr._extract_contacts(html)
    assert out["website_ruts"] == ["76086428-5"]          # invalid RUTs dropped
    assert "contacto@acme.cl" in out["website_emails"]
    assert "+56912345678" in out["website_phones"]
    assert any("linkedin.com" in u for u in out["website_social_links"])
    assert "Av. Siempre Viva" in out["website_address"]


def test_extract_contacts_ignores_invalid_rut():
    out = enr._extract_contacts("ruido 12.345.678-9 ruido")  # bad check digit
    assert "website_ruts" not in out


# ─── v4: Boletín Concursal (insolvency) ───────────────────────────────────────


def test_boletin_concursal_flags_insolvency(monkeypatch):
    html = "<div>Procedimiento Concursal de Liquidación vigente</div>"
    monkeypatch.setattr(enr, "_get", lambda *a, **k: FakeResponse(200, html))
    flags: list = []
    out, status = enr._source_boletin_concursal("76086428-5", flags)
    assert status == enr.STATUS_OK
    assert out["boletin_concursal_found"] is True
    assert any(f["code"] == "INSOLVENCY_PROCEEDING" for f in flags)


def test_boletin_concursal_no_data(monkeypatch):
    monkeypatch.setattr(enr, "_get", lambda *a, **k: FakeResponse(200, "sin resultados"))
    out, status = enr._source_boletin_concursal("76086428-5", [])
    assert out["boletin_concursal_found"] is False
    assert status == enr.STATUS_NO_DATA


def test_boletin_concursal_skipped_on_bad_rut(monkeypatch):
    called = {"n": 0}
    monkeypatch.setattr(enr, "_get", lambda *a, **k: called.__setitem__("n", called["n"] + 1))
    out, status = enr._source_boletin_concursal("12345678-9", [])
    assert status == enr.STATUS_SKIPPED
    assert called["n"] == 0


# ─── v4: Mercado Público official API path ────────────────────────────────────


def test_mercado_publico_api_counts_orders(monkeypatch):
    monkeypatch.setattr(enr, "_MP_TICKET", "fake-ticket")
    monkeypatch.setattr(
        enr, "_get",
        lambda *a, **k: FakeResponse(200, json_data={"Cantidad": 7, "Listado": []}),
    )
    out, status = enr._source_mercado_publico("ACME", "76086428-5")
    assert status == enr.STATUS_OK
    assert out["mercado_publico_ordenes"] == 7
    assert out["mercado_publico_found"] is True


# ─── v4: web search prefers Google CSE when configured ────────────────────────


def test_google_cse_used_when_configured(monkeypatch):
    monkeypatch.setattr(enr, "_GOOGLE_CSE_KEY", "k")
    monkeypatch.setattr(enr, "_GOOGLE_CSE_CX", "cx")
    monkeypatch.setattr(
        enr, "_get",
        lambda *a, **k: FakeResponse(200, json_data={
            "items": [{"title": "ACME", "link": "https://acme.cl", "snippet": "perfil"}]
        }),
    )
    hits = enr._google_cse("ACME Chile")
    assert hits and hits[0]["href"] == "https://acme.cl"


# ─── v4: AI synthesis provider selection ──────────────────────────────────────


def test_ai_synthesis_skipped_without_provider(monkeypatch):
    monkeypatch.setattr(enr, "_ANTHROPIC_KEY", None)
    monkeypatch.setattr(enr, "_LLM_URL", None)
    assert enr._source_ai_synthesis({"company": "ACME"}) == {}


def test_ai_synthesis_prefers_claude(monkeypatch):
    monkeypatch.setattr(enr, "_ANTHROPIC_KEY", "sk-ant-fake")
    called = {}

    def fake_claude(prompt):
        called["claude"] = prompt
        return {"ai_synthesis": {"viability": "alta"}}

    monkeypatch.setattr(enr, "_synthesize_claude", fake_claude)
    monkeypatch.setattr(enr, "_synthesize_openai_compatible",
                        lambda prompt: pytest.fail("should not use OpenAI path"))
    out = enr._source_ai_synthesis({"company": "ACME SpA", "sii_actividad": "TI"})
    assert out["ai_synthesis"]["viability"] == "alta"
    assert "ACME SpA" in called["claude"]  # signals reach the prompt


def test_ai_synthesis_falls_back_to_openai(monkeypatch):
    monkeypatch.setattr(enr, "_ANTHROPIC_KEY", None)
    monkeypatch.setattr(enr, "_LLM_URL", "http://localhost:11434")
    monkeypatch.setattr(enr, "_synthesize_openai_compatible",
                        lambda prompt: {"ai_synthesis": {"viability": "media"}})
    out = enr._source_ai_synthesis({"company": "ACME"})
    assert out["ai_synthesis"]["viability"] == "media"


# ─── End-to-end: verification dict is always populated ────────────────────────


def test_enrich_lead_populates_verification(monkeypatch, dns_ok):
    # Everything offline: _get returns None so every remote source degrades.
    monkeypatch.setattr(enr, "_get", lambda *a, **k: None)
    result = enr.enrich_lead(
        email="foo@gmail.com", company="ACME SpA", full_name="Juan Perez",
        phone="+56912345678",
    )
    assert result["enrichment_version"] == "4.0"
    assert "verification" in result
    # SII is skipped because no RUT was resolved (rutificador unreachable).
    assert result["verification"]["sii"] == enr.STATUS_SKIPPED
    assert result["verification"]["rutificador"] == enr.STATUS_UNREACHABLE
    assert result["verification"]["mercado_publico"] == enr.STATUS_UNREACHABLE
    assert "risk_score" in result and "summary" in result
