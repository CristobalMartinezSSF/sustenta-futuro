"""Email service using Resend API.

Sends confirmation emails to leads and notification emails to admins.
Failures are logged but never block the main flow.
"""

import logging
import os

import httpx

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
ADMIN_EMAIL = os.getenv("ADMIN_NOTIFICATION_EMAIL", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "Sustenta Futuro <no-reply@sustentafuturo.com>")
RESEND_URL = "https://api.resend.com/emails"


def _send(to: str, subject: str, html: str) -> bool:
    """Send an email via Resend. Returns True on success."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set, skipping email to %s", to)
        return False

    try:
        resp = httpx.post(
            RESEND_URL,
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": FROM_EMAIL,
                "to": [to],
                "subject": subject,
                "html": html,
            },
            timeout=10.0,
        )
        if resp.status_code in (200, 201):
            logger.info("Email sent to %s: %s", to, subject)
            return True
        logger.error("Resend error %s: %s", resp.status_code, resp.text[:200])
        return False
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        return False


def send_lead_confirmation(lead_name: str, lead_email: str) -> bool:
    """Send a confirmation email to the lead after form submission."""
    html = f"""
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2B3A42;">
      <div style="background: #2B3A42; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; font-size: 20px; margin: 0;">Sustenta Futuro</h1>
      </div>
      <div style="padding: 32px; background: #fff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="font-size: 16px; margin: 0 0 16px;">Hola <strong>{lead_name}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Recibimos tu solicitud correctamente. Nuestro equipo la revisara y te contactaremos pronto.
        </p>
        <p style="font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Si tienes alguna consulta adicional, puedes responder directamente a este correo.
        </p>
        <p style="font-size: 13px; color: #617F8A; margin: 0;">
          Sustenta Futuro SpA<br>
          Potencia tu operacion. Libera tu talento.
        </p>
      </div>
    </div>
    """
    return _send(
        to=lead_email,
        subject="Recibimos tu solicitud — Sustenta Futuro",
        html=html,
    )


def send_admin_notification(
    lead_name: str,
    lead_email: str,
    lead_company: str,
    lead_service: str,
    lead_message: str,
) -> bool:
    """Send a notification email to admin when a new lead arrives."""
    if not ADMIN_EMAIL:
        logger.warning("ADMIN_NOTIFICATION_EMAIL not set, skipping notification")
        return False

    html = f"""
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #2B3A42;">
      <div style="background: #2B3A42; padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; font-size: 20px; margin: 0;">Nuevo Lead</h1>
      </div>
      <div style="padding: 32px; background: #fff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #617F8A; width: 120px;">Nombre</td>
            <td style="padding: 8px 0; font-weight: 600;">{lead_name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #617F8A;">Email</td>
            <td style="padding: 8px 0;">{lead_email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #617F8A;">Empresa</td>
            <td style="padding: 8px 0;">{lead_company}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #617F8A;">Servicio</td>
            <td style="padding: 8px 0;">{lead_service}</td>
          </tr>
        </table>
        <div style="margin-top: 16px; padding: 16px; background: #f7f8fa; border-radius: 6px;">
          <p style="font-size: 12px; color: #617F8A; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px;">Mensaje</p>
          <p style="font-size: 14px; line-height: 1.5; margin: 0; white-space: pre-wrap;">{lead_message}</p>
        </div>
      </div>
    </div>
    """
    return _send(
        to=ADMIN_EMAIL,
        subject=f"Nuevo lead: {lead_name} ({lead_company})",
        html=html,
    )
