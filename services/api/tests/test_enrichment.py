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


# ─── End-to-end: verification dict is always populated ────────────────────────


def test_enrich_lead_populates_verification(monkeypatch, dns_ok):
    # Everything offline: _get returns None so every remote source degrades.
    monkeypatch.setattr(enr, "_get", lambda *a, **k: None)
    result = enr.enrich_lead(
        email="foo@gmail.com", company="ACME SpA", full_name="Juan Perez",
        phone="+56912345678",
    )
    assert result["enrichment_version"] == "3.1"
    assert "verification" in result
    # SII is skipped because no RUT was resolved (rutificador unreachable).
    assert result["verification"]["sii"] == enr.STATUS_SKIPPED
    assert result["verification"]["rutificador"] == enr.STATUS_UNREACHABLE
    assert result["verification"]["mercado_publico"] == enr.STATUS_UNREACHABLE
    assert "risk_score" in result and "summary" in result
