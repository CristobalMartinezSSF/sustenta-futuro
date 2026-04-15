# Informe Diario — Martes 14 de abril, 2026

---

## Tarea: Investigación — programación con IA y novedades Claude
**Proyecto:** Sistema interno / formación
**Horario:** 09:00 – 11:00

**Avances:**
- Completado video sobre programación con IA: https://www.youtube.com/watch?v=eABNL3igtVo ✅
- Investigadas novedades de Claude (abril 2026):
  - Claude Sonnet/Opus 4.6 con contexto de 1M tokens
  - Claude Mythos (solo invitación, SWE-bench 93.9%)
  - Claude Code Q1 2026: Agent Hooks, MCP elicitation, comando `/plan`, Vim motions
  - Agent SDK + Managed Agents API (lanzado 10 abr 2026)
  - Three-agent harness: Plan / Generate / Evaluate

**Aprendizajes:**
- El Agent SDK ya está disponible para producción — relevante para automatizaciones futuras del sistema de gestión

**Por definir:**
- —

---

## Tarea: Investigación chatbot Onyx + n8n
**Proyecto:** Chatbot / automatización
**Horario:** 11:00 – 12:00

**Avances:**
- Investigado Onyx: https://github.com/onyx-dot-app/onyx (YC W24, 27k+ stars, licencia MIT)
  - Plataforma open-source de chat empresarial con conectores, RAG y widget embebible
  - Evaluado como base para chatbot propio bajo licencia Sustenta Futuro
- Creado `chatbot/onyx-investigacion.md` con documentación completa de arquitectura, conectores y configuración LLM
- Generado spec del chatbot platform propio en `specs/chatbot-platform-spec.md`
- Completado video n8n: https://www.youtube.com/watch?v=8A8PyJeQhlo ✅

**Aprendizajes:**
- Onyx tiene todo lo necesario para construir un chatbot empresarial rápidamente; el esfuerzo real estará en la UI de gestión de bots y en la integración con los datos del cliente
- n8n es la herramienta correcta para el flujo de notificaciones de leads (confirmación al cliente + alerta interna)

**Por definir:**
- Decidir si el chatbot propio parte como fork de Onyx o se construye desde cero

---

## Tarea: Investigación de otros bots del mercado
**Proyecto:** Chatbot
**Horario:** 12:00 – 13:00

**Avances:**
- Sesión interrumpida por agotamiento de tokens de contexto
- Inveistigación parcial, sin registro de conclusones

**Por definir:**
- Completar investigación en próxima sesión

---

## Tarea: Definición de infraestructura del proyecto
**Proyecto:** Sistema interno
**Horario:** 14:00 – 14:30

**Avances:**
- Definido el orden de construcción del MVP:
  1. Leads (backend + Supabase) — base de todo
  2. Conectar formulario landing al backend
  3. n8n workflow (notificaciones automáticas)
  4. Panel admin
  5. Chatbot (canal de captura de leads)
  6. Plataforma de gestión

**Aprendizajes:**
- Empezar por la capa de datos evita refactorizaciones costosas en el frontend después

**Por definir:**
- —

---

## Tarea: Nuevo repositorio GitHub + reescritura de historial
**Proyecto:** Sistema interno / DevOps
**Horario:** 14:30 – 15:00

**Avances:**
- Creada cuenta GitHub: `CristobalMartinezSSF` (cristobalmsustentafuturo@gmail.com)
- Creado repo: https://github.com/CristobalMartinezSSF/sustenta-futuro
- Historial git reescrito con `git-filter-repo`: todos los commits ahora muestran `Cristobal Martinez <cristobalmsustentafuturo@gmail.com>`
- Landing page desplegada en GitHub Pages: https://cristobalmartinezssf.github.io/sustenta-futuro/

**Aprendizajes:**
- GitHub permite tener múltiples cuentas activas en el mismo equipo sin conflicto; se maneja por remote URL con token embebido
- `git-filter-repo` es la herramienta correcta para reescribir historial (reemplaza `git filter-branch`)

**Por definir:**
- —

---

## Tarea: Supabase — schema inicial + RLS
**Proyecto:** Backend / base de datos
**Horario:** 15:00 – 16:00

**Avances:**
- Proyecto Supabase creado: https://rddbfflzhdwhefrkpkcj.supabase.co (región Americas)
- Schema aplicado vía SQL Editor:
  - Tabla `leads` con CHECK constraint de estados + índices en email, status, created_at
  - Tabla `lead_status_history` con trigger automático `fn_record_lead_status_change`
  - Tabla `admin_profiles`
- RLS habilitado en las 3 tablas con políticas:
  - `anon` → INSERT en leads (formulario público)
  - `authenticated` → SELECT + UPDATE en leads (panel admin)
- FastAPI backend (`services/api/`) operativo localmente en puerto 8001
  - Usa `httpx` directo a Supabase REST API (evita incompatibilidad `supabase-py` + `pyiceberg` en Python 3.14/Windows sin Visual Studio)
  - Test exitoso: lead guardado en Supabase correctamente
- Formulario de la landing conectado directo a Supabase REST API con anon key (**TEMPORAL — CRÍTICO**, ver nota abajo)
- Label formulario cambiado: "¿Qué proceso quieres automatizar?" → "Déjanos ayudarte"

**Aprendizajes:**
- `supabase-py` 2.28.3 depende de `storage3` que importa `pyiceberg`, el cual requiere compilación nativa con Visual Studio en Windows/Python 3.14 → no viable en este equipo. Solución: `httpx` directo a la REST API de Supabase
- El nuevo formato de API keys de Supabase (`sb_publishable_` / `sb_secret_`) rompe compatibilidad con `@supabase/ssr` en Next.js

**Por definir:**
- —

---

## Tarea: Panel admin Next.js — construcción y deploy
**Proyecto:** Panel admin
**Horario:** 16:00 – 18:00

**Avances:**
- Construido panel admin en `apps/admin/` con Next.js 16 + TypeScript + Tailwind CSS + App Router
- Login con Supabase Auth (email/password, sin registro público)
- Dashboard con tabla de proyectos: nombre, empresa, email, estado, fase Lean, fecha
- Badges de estado con colores (7 estados del pipeline)
- Badges de fase Lean: PLANIFICAR / CONSTRUIR / CONTINUAR
- Usuario admin creado: cristobalmsustentafuturo@gmail.com
- Desplegado en Vercel: https://admin-taupe-nu.vercel.app
- **Importante:** Vercel desplegado vía CLI (`npx vercel --prod`), NO por integración GitHub — push al repo no redespliega

**Diseño del modelo de plataforma de gestión (próxima fase):**
- Los leads se llamarán "proyectos" en la UI
- Pipeline visible + badge Lean en la lista
- Ciclo Lean explícito dentro de cada proyecto con checklists por fase
- Solo uso interno (Héctor + Cristóbal), sin portal de cliente

**Problemas encontrados y resueltos:**
- `@supabase/ssr` incompatible con nueva key format → reemplazado por `@supabase/supabase-js`
- Next.js 16: `middleware.ts` renombrado a `proxy.ts`, export nombrado `proxy` (breaking change)
- Internal server error en Vercel → causa: `createServerClient` de `@supabase/ssr` falla con `sb_publishable_`
- Solución: `proxy.ts` vacío (pass-through) + toda la auth client-side

**Bug abierto al cierre — panel no carga proyectos ni redirige al login:**
- Confirmado: hay 3 leads reales en Supabase (verificado con service role key directamente)
- Diagnóstico: el cliente JS con `sb_publishable_` no adjunta el JWT del usuario en los headers REST → Supabase ejecuta la query como `anon` → RLS bloquea el SELECT → retorna vacío sin error
- Sesión vieja de testing quedó en `localStorage` del navegador → `getSession()` la lee sin validar → no redirige a `/login`
- Último intento: `getUser()` (valida contra servidor) + `getSession()` para obtener `access_token` + `fetch()` manual con `Authorization: Bearer <token>` explícito
- **Pendiente resolver:** el bug persiste al cierre de la sesión

**Por definir:**
- Resolver bug de autenticación/datos del panel admin
- Conectar Vercel al repo por integración GitHub (para que el deploy sea automático)

---

## ⚠️ Nota crítica — DEBE resolverse antes de producción

> **El formulario de contacto de la landing conecta DIRECTAMENTE a Supabase con la anon key.**
> - La anon key es visible en el HTML público
> - No hay validación de negocio, anti-spam ni rate limiting
> - No hay notificaciones automáticas
>
> **Solución requerida:** Desplegar FastAPI en Railway/Render/VPS y redirigir el formulario a `POST /leads/`.

---

## Estado al cierre del día

| Componente | Estado |
|---|---|
| Landing page | ✅ Desplegada en GitHub Pages |
| Formulario de contacto | ⚠️ Funcional — conexión directa a Supabase (temporal) |
| Supabase schema | ✅ Completo con RLS |
| FastAPI backend | ✅ Funcional localmente — sin hosting externo aún |
| Panel admin (UI) | ✅ Construido y desplegado en Vercel |
| Panel admin (auth + datos) | 🔴 Bug abierto — no redirige a login, no carga proyectos |
| n8n workflow | ❌ No iniciado |
| Email de notificación | ❌ No iniciado |

---

Adjunto nuevos links de la landing y el login del panel (aun no operativo).

https://admin-flyqoidff-cristobalmartinezssfs-projects.vercel.app/
https://cristobalmartinezssf.github.io/sustenta-futuro/

(se cambiaron por un mail temporal que es mas formal que el personal)

*Cristóbal Martínez — Sustenta Futuro*
