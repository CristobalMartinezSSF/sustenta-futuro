"""Build infra/supabase/schema.sql by concatenating the migrations in order.

The migration files carry DUPLICATE numeric prefixes (two 002, two 003) whose
correct sequence is the order they were applied to production — recovered from
git history, not the filename sort. That order is hard-coded below.

Run from the repo root:
    python scripts/build-schema.py
"""

from __future__ import annotations

import datetime
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
MIG = REPO / "infra" / "supabase" / "migrations"
DEST = REPO / "infra" / "supabase" / "schema.sql"

# Chronological apply order (from `git log --diff-filter=A`).
ORDER = [
    "001_initial_schema.sql",
    "002_add_project_title_and_notes.sql",
    "003_roles_and_user_management.sql",
    "004_landing_config.sql",
    "002_propuestas_proyectos_levantamiento.sql",
    "003_proyectos_status_update.sql",
    "005_etapa2_schema.sql",
    "006_admin_auth_rls.sql",
    "007_drop_pista_a.sql",
    "008_proposal_versioning.sql",
    "009_proposal_chat.sql",
    "010_projects.sql",
    "011_project_finished_at.sql",
    "012_proposal_quote_number.sql",
    "013_admin_phone.sql",
]

HEADER = f"""-- =============================================================================
-- SG Sustenta Futuro - Esquema completo de base de datos (consolidado)
-- Generado por scripts/build-schema.py el {datetime.date.today()}.
--
-- Concatenacion de infra/supabase/migrations/ en el ORDEN HISTORICO REAL de
-- aplicacion a produccion (no el alfabetico: hay dos 002 y dos 003).
--
-- USO: pegar completo en el SQL Editor de un proyecto Supabase NUEVO y ejecutar.
-- Reproduce tablas, indices, funciones, triggers y politicas RLS. Requiere un
-- proyecto SUPABASE (usa el schema `auth` y auth.uid()), no un Postgres pelado.
-- No incluye datos; el primer admin se crea aparte (ver docs/SETUP-BASE-DATOS.md).
-- =============================================================================

"""


def main() -> None:
    present = sorted(p.name for p in MIG.glob("*.sql"))
    if sorted(ORDER) != present:
        raise SystemExit(f"Migration set mismatch: {set(present) ^ set(ORDER)}")

    parts = [HEADER]
    for i, name in enumerate(ORDER, 1):
        sql = (MIG / name).read_text(encoding="utf-8").rstrip()
        banner = (
            "\n\n-- " + "=" * 74 +
            f"\n-- [{i:02d}/{len(ORDER)}] {name}\n-- " + "=" * 74 + "\n\n"
        )
        parts.append(banner + sql + "\n")

    DEST.write_text("".join(parts), encoding="utf-8")
    text = DEST.read_text(encoding="utf-8")
    print(f"Wrote {DEST.relative_to(REPO)} ({len(text):,} chars, {text.count(chr(10)):,} lines)")
    print(f"  CREATE TABLE: {text.count('CREATE TABLE')}  |  "
          f"CREATE POLICY: {text.count('CREATE POLICY')}  |  "
          f"FUNCTION: {text.count('CREATE OR REPLACE FUNCTION')}")


if __name__ == "__main__":
    main()
