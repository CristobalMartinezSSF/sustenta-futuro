"""Unit tests for the proposal email (offline, httpx mocked)."""

from __future__ import annotations

import base64

from app import email as email_mod


class _FakeResp:
    status_code = 200
    text = "ok"


def test_send_proposal_to_client_attaches_pdf_and_whatsapp_cta(monkeypatch):
    captured: dict = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["json"] = json
        return _FakeResp()

    monkeypatch.setattr(email_mod, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_mod, "WHATSAPP_CONTACT_URL", "https://wa.me/56900000000")
    monkeypatch.setattr(email_mod.httpx, "post", fake_post)

    pdf = b"%PDF-1.4 fake bytes"
    ok = email_mod.send_proposal_to_client(
        lead_name="Paul",
        lead_email="paul@example.com",
        project_title="Onboarding Buk",
        pdf_bytes=pdf,
    )

    assert ok is True
    payload = captured["json"]
    assert payload["to"] == ["paul@example.com"]
    # PDF is attached and base64-encoded.
    att = payload["attachments"][0]
    assert att["filename"].endswith(".pdf")
    assert base64.b64decode(att["content"]) == pdf
    # The scheduling CTA and project title made it into the body.
    assert "wa.me/56900000000" in payload["html"]
    assert "Onboarding Buk" in payload["html"]


def test_send_proposal_to_client_falls_back_without_whatsapp(monkeypatch):
    captured: dict = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["json"] = json
        return _FakeResp()

    monkeypatch.setattr(email_mod, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_mod, "WHATSAPP_CONTACT_URL", "")
    monkeypatch.setattr(email_mod.httpx, "post", fake_post)

    ok = email_mod.send_proposal_to_client("A", "a@example.com", "", b"x")
    assert ok is True
    # No WhatsApp link; the reply-to-email fallback is shown instead.
    assert "wa.me" not in captured["json"]["html"]
    assert "responde directamente a este correo" in captured["json"]["html"]
