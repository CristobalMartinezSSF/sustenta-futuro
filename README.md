# Sistema de Gestión Sustenta Futuro

Sistema interno de captura, evaluación y seguimiento de leads para Sustenta Futuro SpA.

## Stack

| Capa | Tecnología |
|------|-----------|
| Landing pública | HTML/CSS/JS estático (`apps/web/`) |
| Admin panel | Next.js 15 + Tailwind (`apps/admin/`) |
| Backend API | Python 3.11 + FastAPI (`services/api/`) |
| Base de datos | Supabase Postgres |
| Auth | Supabase Auth (JWT/ES256) |
| Email | Resend (`no-reply@sustentafuturo.com`) |
| Deploy API | Render (`sustenta-futuro-api.onrender.com`) |
| Deploy Admin | Vercel (`admin-taupe-nu.vercel.app`) |
| Tests E2E | Playwright (`e2e/`) |

## Estructura

```
apps/
  web/          Landing page pública (HTML estático)
  admin/        Panel de administración (Next.js)
services/
  api/          Backend FastAPI
infra/
  supabase/
    migrations/ Migraciones SQL (001–007)
e2e/
  tests/        6 suites Playwright (16 tests)
docs/           Especificaciones y propuestas
specs/          Spec MVP
```

## Setup local

### 1. Variables de entorno

```bash
cp .env.example .env
# Completar con los valores reales
```

### 2. Backend (FastAPI)

```bash
cd services/api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Admin panel (Next.js)

```bash
cd apps/admin
npm install
# Crear apps/admin/.env.local con:
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev   # http://localhost:3000
```

### 4. Base de datos

Aplicar migraciones en orden desde el Supabase SQL editor:

```
infra/supabase/migrations/
  001_initial_schema.sql
  002_add_project_title_and_notes.sql
  003_roles_and_user_management.sql
  004_landing_config.sql
  005_etapa2_schema.sql       ← Schema principal Etapa 2
  006_admin_auth_rls.sql      ← RLS y políticas
  007_drop_pista_a.sql        ← Limpieza tablas obsoletas
```

## Tests E2E

```bash
cd e2e
npm install
npx playwright install chromium

# Correr suite completa (16 tests)
npx playwright test

# Solo landing
npx playwright test --project=landing

# Solo admin
npx playwright test --project=admin

# Ver reporte HTML
npx playwright show-report
```

Los tests de landing sirven el HTML localmente (`http://localhost:3999`).  
Los tests de admin corren contra producción (`admin-taupe-nu.vercel.app`).

## Deploy

### Backend (Render)

El auto-deploy está desactivado. Para desplegar manualmente:

```bash
curl -X POST "https://api.render.com/v1/services/srv-d7j5139kh4rs73bd6sng/deploys" \
  -H "Authorization: Bearer <RENDER_API_KEY>" \
  -H "Content-Type: application/json" -d "{}"
```

### Admin panel (Vercel)

Auto-deploy al push a `main`.

## Flujo de un lead

```
Landing (formulario público)
  → POST /leads/ (FastAPI)
  → Lead guardado en Supabase (status: new)
  → Email de confirmación al contacto
  → Notificación interna a Héctor

Admin panel → Revisión → status: reviewing
  → Script enrichment (Google/LinkedIn)
  → status: pending_approval → Héctor aprueba contacto

Contacto → Reunión → status: contacted
  → Ficha de evaluación técnica-económica (15 campos)
  → Veredicto: viable / not_viable

Viable → Generación PDF propuesta (FastAPI)
  → Héctor aprueba borrador → status: proposal_sent
  → Cliente acepta → status: won
```

## Roles

| Rol | Usuario | Permisos |
|-----|---------|----------|
| `admin` | Cristóbal | Todo — crear, editar, ejecutar, ficha, propuesta |
| `supervisor` | Héctor | Revisar, aprobar, dejar notas |

## Etapa 2 — Estado (junio 2026)

- ✅ Fase 1: Schema BD + API CRUD + Formulario público (6+3 campos)
- ✅ Fase 2: Auth JWT + RLS + Panel admin + Enrichment + Emails Resend
- ✅ Fase 3: Ficha evaluación + Veredicto + PDF propuesta institucional
- ✅ Fase 4: Kanban interno (fases, tareas, notas, reportes diarios)
- ✅ Fase 5: Tests E2E Playwright (16/16 passing)
- ✅ Fase 6: Documentación + Cierre
