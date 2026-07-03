# Guía del sistema — SG Sustenta Futuro

Documento de referencia para entender, correr y evaluar el **Sistema de Gestión
Sustenta Futuro**: la plataforma que va desde la captación de leads en la landing
hasta la ejecución de proyectos ganados.

> Diagramas complementarios:
> - Modelo de datos → [`diagrama-relacional.md`](./diagrama-relacional.md)
> - Flujo funcional y despliegue → [`diagrama-flujo-sistema.md`](./diagrama-flujo-sistema.md)

---

## 1. Qué hace el sistema

Cubre el ciclo comercial completo de Sustenta Futuro:

1. **Captación** — la landing pública muestra los servicios y captura leads por un
   formulario.
2. **Gestión de leads** — panel interno para revisar, enriquecer y calificar cada
   lead a través de estados.
3. **Evaluación técnico-económica** — una "ficha" por lead con alcance, stack,
   fases, costos y veredicto de viabilidad.
4. **Propuestas** — generación automática de una propuesta en PDF (con número de
   cotización COT correlativo), versionada y con hilo de discusión.
5. **Proyectos** — al ganar, la propuesta se convierte en proyecto con fases,
   tareas (Kanban), archivos y reportes diarios.
6. **Usuarios** — administración de usuarios internos y recuperación de claves.

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Landing pública | HTML + CSS + JS estático (`apps/web/index.html`) |
| Panel admin | **Next.js 16** (App Router, Turbopack) + Tailwind (`apps/admin`) |
| Backend / API | **Python + FastAPI** (`services/api`) |
| Base de datos | **Supabase Postgres** (esquema `public`) |
| Autenticación | **Supabase Auth** (GoTrue, JWT ES256 vía JWKS) |
| Email transaccional | **Resend** (dominio `sustentafuturo.com` verificado) |
| Redacción IA de propuestas | **Google Gemini** (endpoint OpenAI-compatible) |
| Render de PDF | HTML (Jinja2) → **Chromium headless** (fallback fpdf2) |
| Hosting | Admin en **Vercel** · API en **Render** · datos en **Supabase** |

---

## 3. Estructura del repositorio

```text
apps/
  web/            # landing pública estática (index.html, privacidad, términos)
  admin/          # panel admin Next.js (login, leads, propuestas, proyectos, usuarios)
services/
  api/            # backend FastAPI
    app/
      routers/    # auth, leads, evaluations, proposals, projects, landing
      notifications/   # whatsapp.py (puente dormido para Meta Cloud API)
      proposal_render.py / proposal_context.py / proposal_pdf.py  # motor de PDF
      enrichment.py     # enriquecimiento de leads con IA
      database.py       # cliente httpx a Supabase REST (service role)
      auth.py / config.py
    main.py
    requirements.txt
    .env.example   # variables necesarias (sin secretos)
infra/
  supabase/
    migrations/   # 001..013 — DDL incremental e idempotente
docs/             # esta guía, diagramas, informes y formato de propuestas
specs/            # especificaciones (SDD)
```

---

## 4. Cómo correrlo localmente

### Requisitos
- Python 3.10+ (probado en 3.14) con `fastapi`, `uvicorn`, `httpx`, `psycopg2`.
- Node.js 18+ y npm (para el panel admin).
- Google Chrome instalado (para el render de PDF; se autodetecta o vía `CHROME_PATH`).

### Backend (FastAPI) — puerto 8000
```bash
cd services/api
# copiar .env.example a .env y completar las variables (ver sección 5)
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```
Verificación: `http://localhost:8000/openapi.json` debe responder 200.

### Panel admin (Next.js) — puerto 3000
```bash
cd apps/admin
npm install          # primera vez
npm run dev
```
En `apps/admin/.env.local` define hacia qué API apunta el panel:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:8000   # o la URL de Render en prod
```
Panel en `http://localhost:3000`. Inicia sesión con un usuario de `admin_profiles`.

---

## 5. Variables de entorno

Ver la lista completa y comentada en `services/api/.env.example`. Las claves:

| Variable | Para qué |
|---|---|
| `SUPABASE_URL` | Proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso backend (bypass RLS) — **secreto** |
| `SUPABASE_ANON_KEY` | Login/auth |
| `RESEND_API_KEY`, `ADMIN_NOTIFICATION_EMAIL` | Emails transaccionales |
| `GEMINI_API_KEY` | Redacción IA de propuestas |
| `ALLOWED_ORIGINS` | CORS (landing, Vercel, localhost) |
| `WHATSAPP_*` | Puente de recuperación por WhatsApp (opcional, dormido) |

> Nunca commitear `.env` ni `.env.local`: están en `.gitignore`. Las credenciales
> reales se comparten por canal seguro, no por el repositorio.

---

## 6. Base de datos y migraciones

> Para levantar la base **desde cero** en un proyecto Supabase nuevo, sigue
> [`SETUP-BASE-DATOS.md`](./SETUP-BASE-DATOS.md): un solo archivo
> `infra/supabase/schema.sql` para pegar y ejecutar, + primer admin.

- El esquema vive en `infra/supabase/migrations/` (`001` … `013`), incremental e
  **idempotente** (se puede reejecutar sin romper nada).
- Migraciones destacadas: `005` (esquema Etapa 2), `008/009` (propuestas
  versionadas + chat), `010` (proyectos), `012` (número de cotización COT +
  función `allocate_quote_number`), `013` (`admin_profiles.phone`).
- No hay `psql` en el entorno Windows; las DDL se aplican con `psycopg2` vía el
  **pooler** de Supabase (`aws-1-...pooler.supabase.com:5432`, sslmode require).
  Tras aplicar DDL, ejecutar `NOTIFY pgrst, 'reload schema'` para refrescar el
  cache de PostgREST.

### Estados del lead
```
new → reviewing → pending_approval → contacted → evaluating → viable → proposal_sent → won / lost
```

### Roles de usuario
- `admin` — acceso total, incluye gestión de usuarios y reset de claves.
- `user` — acceso operativo (sin gestión de usuarios).

---

## 7. Módulos principales (dónde mirar)

| Módulo | Backend | Frontend |
|---|---|---|
| Leads | `routers/leads.py`, `enrichment.py` | `app/leads` |
| Evaluación | `routers/evaluations.py` | `app/leads/[id]/EvaluationSection.tsx` |
| Propuestas + PDF | `routers/proposals.py`, `proposal_render.py`, `proposal_context.py` | `app/propuestas/[leadId]` |
| Proyectos + Kanban | `routers/projects.py` | `app/proyectos`, `app/kanban` |
| Usuarios + recuperación | `routers/auth.py` | `app/usuarios`, `app/login`, `app/reset-password` |
| Config landing | `routers/landing.py` | `app/configuracion` |

---

## 8. Recuperación de claves (implementado)

- **Autoservicio por email**: enlace "¿Olvidaste tu contraseña?" en el login →
  Supabase envía un correo con enlace a `/reset-password` para fijar la nueva clave.
  Requiere configurar en Supabase: *Redirect URLs* (incluir `/reset-password`) y
  *SMTP custom con Resend* (el SMTP interno limita a ~3-4 correos/hora).
- **Reset por admin**: en *Usuarios*, botón "Resetear clave" por fila →
  `POST /auth/users/{id}/reset-password` (solo rol `admin`, usa service role).
- **WhatsApp** (puente listo, dormido): `admin_profiles.phone` ya se captura;
  `services/api/app/notifications/whatsapp.py` tiene la integración con Meta
  WhatsApp Cloud API, inerte hasta setear las variables `WHATSAPP_*`.

---

## 9. Despliegue

| Componente | Dónde | Notas |
|---|---|---|
| Panel admin | Vercel | build de `apps/admin`; setear `NEXT_PUBLIC_API_URL` a la API de prod |
| API | Render | auto-deploy no confiable → disparar deploy manual por API |
| Datos/Auth | Supabase | migraciones vía pooler; RLS activo en tablas sensibles |
| Landing | hosting estático | `apps/web` |

> Estado actual (jul 2026): el servicio de Render está en pausa por facturación;
> para evaluar, el sistema corre **localmente** (backend en `:8000`, admin en
> `:3000` apuntando al backend local vía `NEXT_PUBLIC_API_URL`).

---

## 10. Cómo evaluar rápido (para Héctor)

1. Clonar el repo y abrir esta guía + los dos diagramas.
2. Levantar backend y admin (sección 4) con las credenciales que se comparten
   aparte.
3. Recorrido sugerido: **landing → lead → ficha de evaluación → generar propuesta
   PDF → convertir en proyecto → Kanban**, y **Usuarios → reset de clave**.
4. El código es propio y modificable (la interfaz y las funciones de chat son los
   puntos de mejora conversados).
