"""AI drafting of proposal text fields (description + functionalities).

Uses the official Anthropic SDK (Claude) to draft the narrative parts of the
evaluation ficha that can't be averaged numerically. The model is grounded on
the lead's own context plus the frozen snapshots of past projects of the same
service type, so the draft reads like prior Sustenta Futuro work.

Single LLM call (Tier 1). Defaults to Claude Opus 4.8; override with
PROPOSAL_AIPROPOSAL_AI_MODEL. Numeric estimates stay with the median-based suggestions in
the evaluations router — this module only writes prose.
"""

from __future__ import annotations

import json
import logging
import os

logger = logging.getLogger(__name__)

_ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")
PROPOSAL_AI_MODEL = os.getenv("PROPOSAL_AIPROPOSAL_AI_MODEL", "claude-opus-4-8")

_SYSTEM = (
    "Eres un consultor senior de Sustenta Futuro SpA que redacta propuestas "
    "técnicas en español. Tono: experto, confiable, moderno, premium. "
    "Redacta a partir de la necesidad del lead y de proyectos similares ya "
    "realizados; no inventes cifras, plazos, ni clientes. Si no hay suficiente "
    "información, mantén la redacción general pero verosímil. Responde "
    "únicamente con el JSON solicitado."
)

# Structured output: a paragraph + a list of concrete scope items.
_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "description": {"type": "string"},
        "functionalities": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["description", "functionalities"],
}


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
        "Devuelve JSON con:\n"
        "- description: 1 párrafo (objetivo del proyecto, claro y orientado a valor).\n"
        "- functionalities: lista de 4 a 8 ítems concretos de alcance."
    )


def generate_proposal_text(lead: dict, history: list[dict]) -> dict:
    """Draft {description, functionalities} via Claude. Raises ProposalAIError
    on any failure (missing key/SDK, no credit, network, bad output)."""
    if not _ANTHROPIC_KEY:
        raise ProposalAIError("No hay clave de IA configurada (ANTHROPIC_API_KEY).")

    try:
        import anthropic  # type: ignore
    except ImportError as exc:  # pragma: no cover - dependency always present in prod
        raise ProposalAIError("El SDK de Anthropic no está instalado.") from exc

    try:
        client = anthropic.Anthropic(api_key=_ANTHROPIC_KEY)
        resp = client.messages.create(
            model=PROPOSAL_AI_MODEL,
            max_tokens=1500,
            system=_SYSTEM,
            messages=[{"role": "user", "content": build_ai_prompt(lead, history)}],
            output_config={"format": {"type": "json_schema", "schema": _SCHEMA}},
        )
    except Exception as exc:
        msg = str(exc)
        if "credit balance" in msg.lower():
            raise ProposalAIError(
                "La cuenta de IA no tiene saldo. Carga crédito en console.anthropic.com."
            ) from exc
        logger.warning("Proposal AI generation failed: %s", exc)
        raise ProposalAIError("No se pudo generar la redacción con IA.") from exc

    text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ProposalAIError("La IA devolvió una respuesta no válida.") from exc

    return {
        "description": (data.get("description") or "").strip(),
        "functionalities": [
            str(f).strip() for f in (data.get("functionalities") or []) if str(f).strip()
        ],
    }
