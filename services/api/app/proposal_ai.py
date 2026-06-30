"""AI drafting of proposal text fields (description + functionalities).

Uses Google Gemini (via its OpenAI-compatible endpoint) to draft the narrative
parts of the evaluation ficha that can't be averaged numerically. The model is
grounded on the lead's own context plus the frozen snapshots of past projects of
the same service type, so the draft reads like prior Sustenta Futuro work.

Single LLM call. Defaults to ``gemini-2.5-flash``; override the model with
``PROPOSAL_AI_MODEL`` and the endpoint with ``GEMINI_BASE_URL``. Numeric
estimates stay with the median-based suggestions in the evaluations router —
this module only writes prose.
"""

from __future__ import annotations

import json
import logging
import os
import re

import httpx

logger = logging.getLogger(__name__)

_GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
_GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai"
)
PROPOSAL_AI_MODEL = os.getenv("PROPOSAL_AI_MODEL", "gemini-2.5-flash")

_SYSTEM = (
    "Eres un consultor senior de Sustenta Futuro SpA que redacta propuestas "
    "técnicas en español. Tono: experto, confiable, moderno, premium. "
    "Redacta a partir de la necesidad del lead y de proyectos similares ya "
    "realizados; no inventes cifras, plazos, ni clientes. Si no hay suficiente "
    "información, mantén la redacción general pero verosímil. Responde "
    "únicamente con el JSON solicitado."
)


class ProposalAIError(RuntimeError):
    """Raised when the AI draft can't be produced (no key, no credit, etc.)."""


def build_ai_prompt(lead: dict, history: list[dict]) -> str:
    """Compose the user prompt from the lead's context + past project snapshots.

    `history` is a list of past project evaluation snapshots (the same dicts the
    median suggestions are computed from). Pure function — unit-testable.
    """
    lead_ctx = {
        "servicio": lead.get("service_interest"),
        "empresa": lead.get("company"),
        "industria": lead.get("industry"),
        "mensaje_del_cliente": lead.get("message"),
    }

    examples = []
    for ev in history[:5]:
        examples.append(
            {
                "titulo": ev.get("project_title"),
                "descripcion": ev.get("description"),
                "funcionalidades": ev.get("functionalities") or [],
            }
        )

    return (
        "Redacta la descripción/objetivo y las funcionalidades de una propuesta "
        "para este lead.\n\n"
        f"LEAD:\n{json.dumps(lead_ctx, ensure_ascii=False, indent=2)}\n\n"
        f"PROYECTOS SIMILARES YA REALIZADOS (referencia de estilo y alcance, "
        f"{len(examples)}):\n{json.dumps(examples, ensure_ascii=False, indent=2)}\n\n"
        "Devuelve únicamente un objeto JSON con esta forma exacta:\n"
        '{"description": "<1 párrafo: objetivo del proyecto, claro y orientado '
        'a valor>", "functionalities": ["<ítem de alcance>", "..."]}\n'
        "functionalities debe tener de 4 a 8 ítems concretos."
    )


def _parse_json(content: str) -> dict:
    """Best-effort JSON parse: handles code fences and surrounding prose."""
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", content, re.S)
        if not match:
            raise
        return json.loads(match.group(0))


def generate_proposal_text(lead: dict, history: list[dict]) -> dict:
    """Draft {description, functionalities} via Gemini. Raises ProposalAIError
    on any failure (missing key, quota, network, bad output)."""
    if not _GEMINI_KEY:
        raise ProposalAIError("No hay clave de IA configurada (GEMINI_API_KEY).")

    try:
        resp = httpx.post(
            _GEMINI_BASE_URL.rstrip("/") + "/chat/completions",
            json={
                "model": PROPOSAL_AI_MODEL,
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": build_ai_prompt(lead, history)},
                ],
                "temperature": 0.3,
                "response_format": {"type": "json_object"},
            },
            headers={
                "Authorization": f"Bearer {_GEMINI_KEY}",
                "Content-Type": "application/json",
            },
            timeout=45.0,
        )
    except httpx.HTTPError as exc:
        logger.warning("Proposal AI request failed: %s", exc)
        raise ProposalAIError("No se pudo conectar con el servicio de IA.") from exc

    if resp.status_code != 200:
        body = resp.text.lower()
        if resp.status_code == 429 or "quota" in body or "exceeded" in body:
            raise ProposalAIError(
                "La cuenta de IA superó su cuota. Revisa tu plan en "
                "aistudio.google.com."
            )
        if resp.status_code in (401, 403):
            raise ProposalAIError("La clave de IA (GEMINI_API_KEY) es inválida.")
        logger.warning("Proposal AI HTTP %s: %s", resp.status_code, resp.text[:300])
        raise ProposalAIError("No se pudo generar la redacción con IA.")

    try:
        content = resp.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, ValueError) as exc:
        raise ProposalAIError("La IA devolvió una respuesta inesperada.") from exc

    try:
        data = _parse_json(content)
    except json.JSONDecodeError as exc:
        raise ProposalAIError("La IA devolvió una respuesta no válida.") from exc

    return {
        "description": (data.get("description") or "").strip(),
        "functionalities": [
            str(f).strip() for f in (data.get("functionalities") or []) if str(f).strip()
        ],
    }
