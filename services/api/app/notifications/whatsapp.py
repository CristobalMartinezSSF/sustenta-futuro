"""WhatsApp password-recovery bridge (Meta WhatsApp Cloud API).

STATUS: dormant scaffolding. Nothing is sent until the environment variables
below are set, so importing/calling this module is a safe no-op in the current
deployment.

------------------------------------------------------------------------------
What is still needed to turn this ON (Meta WhatsApp Cloud API):
------------------------------------------------------------------------------
1. Meta Business account + a WhatsApp Business phone number
   (https://business.facebook.com → WhatsApp → API setup).
2. A permanent access token (System User token) — the temporary 24h token from
   the dashboard is only for testing.
3. An approved **message template** of category "Authentication" or "Utility",
   e.g. name ``password_reset`` with a single body variable {{1}} for the code
   or link. Business-initiated messages MUST use a pre-approved template.
4. Set these env vars (Render + local .env):
       WHATSAPP_ENABLED=true
       WHATSAPP_PHONE_NUMBER_ID=<the number's phone_number_id>
       WHATSAPP_ACCESS_TOKEN=<permanent token>
       WHATSAPP_TEMPLATE_NAME=password_reset
       WHATSAPP_TEMPLATE_LANG=es          # must match the approved template
       WHATSAPP_GRAPH_VERSION=v20.0       # optional
5. Store the worker's phone (E.164, e.g. +56912345678) in
   ``admin_profiles.phone`` — added by migration 013_admin_phone.sql.

------------------------------------------------------------------------------
Where to wire it (when enabled):
------------------------------------------------------------------------------
The admin reset endpoint (routers/auth.py :: admin_reset_password) or a future
"send recovery code" endpoint can call ``send_password_reset(phone, code)``
after generating a one-time code/link. Keep the actual secret out of logs.
"""

from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    """True only when every required WhatsApp env var is present and enabled."""
    return (
        os.getenv("WHATSAPP_ENABLED", "").lower() == "true"
        and bool(os.getenv("WHATSAPP_PHONE_NUMBER_ID"))
        and bool(os.getenv("WHATSAPP_ACCESS_TOKEN"))
        and bool(os.getenv("WHATSAPP_TEMPLATE_NAME"))
    )


def _to_wa_number(phone: str) -> str:
    """Normalize an E.164 phone to the digits Meta expects (no '+', no spaces)."""
    return "".join(ch for ch in phone if ch.isdigit())


def send_password_reset(phone: str, code_or_link: str) -> bool:
    """Send a password-recovery template message via the WhatsApp Cloud API.

    Returns True on success. Returns False (a safe no-op) when the channel is
    not configured yet, so callers can treat WhatsApp as best-effort:

        if profile.get("phone"):
            whatsapp.send_password_reset(profile["phone"], code)

    Never raises for a missing configuration; only network/HTTP issues are
    logged and swallowed into a False result.
    """
    if not is_configured():
        logger.info("WhatsApp channel not configured; skipping send.")
        return False
    if not phone:
        logger.info("No phone on record; skipping WhatsApp send.")
        return False

    version = os.getenv("WHATSAPP_GRAPH_VERSION", "v20.0")
    phone_number_id = os.environ["WHATSAPP_PHONE_NUMBER_ID"]
    token = os.environ["WHATSAPP_ACCESS_TOKEN"]
    template = os.environ["WHATSAPP_TEMPLATE_NAME"]
    lang = os.getenv("WHATSAPP_TEMPLATE_LANG", "es")

    url = f"https://graph.facebook.com/{version}/{phone_number_id}/messages"
    body = {
        "messaging_product": "whatsapp",
        "to": _to_wa_number(phone),
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": lang},
            "components": [
                {
                    "type": "body",
                    "parameters": [{"type": "text", "text": code_or_link}],
                }
            ],
        },
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                url,
                json=body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
    except httpx.RequestError as exc:
        logger.error("WhatsApp request failed: %s", exc)
        return False

    if resp.status_code >= 400:
        # Do not log the token or the code; only the API error context.
        logger.error("WhatsApp send failed (%s): %s", resp.status_code, resp.text)
        return False

    logger.info("WhatsApp recovery message sent to %s", _to_wa_number(phone)[-4:])
    return True
