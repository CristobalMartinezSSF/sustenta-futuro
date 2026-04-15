# Sesión: Investigación, infraestructura y configuración de Git

| Campo | Valor |
|---|---|
| Fecha | 2026-04-14 |
| Horario | 09:00 – 18:00 |

## Objetivo
Continuar investigación de herramientas (chatbot, novedades Claude), definir infraestructura del proyecto, configurar el nuevo repositorio de GitHub y comenzar construcción del backend y panel admin.

---

## Lo que se hizo

### 09:00 – 11:00 — Investigación y novedades

#### Video retomado (09:00 – 11:00)
- Retomado y completado: https://www.youtube.com/watch?v=eABNL3igtVo — video sobre programación con IA ✅

#### Novedades de desarrollo con Claude
- Claude Sonnet/Opus 4.6 (1M tokens), Claude Mythos (solo invitación, SWE-bench 93.9%)
- Claude Code Q1 2026: Agent Hooks, MCP elicitation, /plan command, Vim motions
- Agent SDK + Managed Agents API (lanzado 10 abr 2026)
- Three-agent harness: Plan / Generate / Evaluate

---

### 11:00 – 12:00 — Investigación chatbot Onyx
- Investigado https://github.com/onyx-dot-app/onyx (YC W24, 27k+ stars, MIT)
- Creado `chatbot/onyx-investigacion.md` con documentación completa
- Generado spec del chatbot platform propio en `specs/chatbot-platform-spec.md`
- Video n8n completado: https://www.youtube.com/watch?v=8A8PyJeQhlo ✅

---

### 12:00 – 13:00 — Investigación otros bots del mercado

### 13:00 – 14:00 — Almuerzo

---

### 14:00 – 15:30 — Definición de infraestructura + Git + Supabase

#### Decisión de infraestructura (orden de construcción)
1. Leads (backend + Supabase) — base de todo
2. Conectar formulario landing al backend
3. n8n workflow (notificaciones automáticas)
4. Panel admin
5. Chatbot (canal de captura de leads)
6. Plataforma de gestión

#### Nuevo repositorio GitHub
- Cuenta: `CristobalMartinezSSF` (cristobalmsustentafuturo@gmail.com)
- Repo: https://github.com/CristobalMartinezSSF/sustenta-futuro (privado → público para GitHub Pages)
- Historial git reescrito: todos los commits a `Cristobal Martinez <cristobalmsustentafuturo@gmail.com>`
- Landing desplegada: https://cristobalmartinezssf.github.io/sustenta-futuro/

#### Supabase
- Proyecto creado: https://rddbfflzhdwhefrkpkcj.supabase.co (región Americas)
- Schema aplicado vía SQL Editor:
  - Tabla `leads` con CHECK constraint de estados + índices
  - Tabla `lead_status_history` con trigger automático de auditoría
  - Tabla `admin_profiles`
  - RLS habilitado con políticas: anon INSERT en leads, authenticated SELECT/UPDATE

#### FastAPI backend (`services/api/`)
- Endpoint `POST /leads/` funcionando localmente (puerto 8001)
- Usa httpx directo a Supabase REST API (evita pyiceberg/supabase-py incompatibilidad con Python 3.14)
- Test exitoso: lead de prueba guardado en Supabase

#### Formulario landing conectado a Supabase
- ⚠️ **TEMPORAL — CRÍTICO**: formulario conectado directo a Supabase REST API con anon key
- Esto DEBE migrarse a FastAPI + hosting antes de producción
- Cambio: label "¿Qué proceso quieres automatizar?" → "Déjanos ayudarte"

---

### 15:30 – 17:25 — Break (tokens agotados + descanso)

---

### 17:25 – 18:00 — Panel admin Next.js + debugging auth/datos

#### Construcción del panel admin (`apps/admin/`)
- Next.js 16 + TypeScript + Tailwind CSS + App Router
- Login con Supabase Auth (email/password, sin registro público)
- Dashboard con tabla de proyectos (leads): nombre, empresa, email, estado, fase Lean, fecha
- Badges de estado con colores + badges de fase Lean (PLANIFICAR / CONSTRUIR / CONTINUAR)
- Usuario admin creado en Supabase Auth: cristobalmsustentafuturo@gmail.com
- Desplegado en Vercel: https://admin-taupe-nu.vercel.app

#### Problemas encontrados y resueltos
- `@supabase/ssr` + nuevo formato de keys (`sb_publishable_`) → incompatible en proxy/middleware → reemplazado por `@supabase/supabase-js` puro
- Next.js 16 renombró `middleware.ts` a `proxy.ts` (breaking change)
- Internal server error en Vercel → causa: `createServerClient` de `@supabase/ssr` falla con nueva key format
- Solución final: proxy.ts vacío (pass-through) + auth check client-side en `app/page.tsx`

#### Nota importante: deploy Vercel es vía CLI, no GitHub
- El panel admin se despliega con `npx vercel --prod` desde `apps/admin/`
- Push a GitHub NO redespliega — Vercel no está conectado al repo por integración
- Remote de git: `ssf` (no `origin`)

#### Diseño del modelo de plataforma de gestión (para próxima fase)
- Pipeline: Sin iniciar → Esperando reunión → En prototipado → En propuesta → En desarrollo → En entrega → Completado / Cancelado
- Lean integrado: badge en lista + ciclo explícito dentro de cada proyecto
- Checklists Lean por fase (definidos por nosotros, editables)
- Solo uso interno (Héctor + David), sin portal de cliente

#### Bug abierto al cierre: panel admin no muestra proyectos ni redirige al login
- Confirmado via API con service role: hay 3 leads reales en la tabla `leads` en Supabase
- Diagnóstico: el cliente JS (`@supabase/supabase-js` 2.103.0) con el nuevo formato de key `sb_publishable_` no adjunta correctamente el JWT del usuario en los headers del request REST → Supabase ejecuta la query como rol `anon` → RLS bloquea el SELECT → retorna vacío sin error
- Comportamiento adicional: el dashboard se muestra sin hacer login porque una sesión vieja quedó almacenada en `localStorage` del navegador. `getSession()` la lee sin validar → no redirige a `/login`. `getUser()` sí valida contra el servidor
- Último estado del código (`app/page.tsx`): usa `getUser()` para validar sesión + `getSession()` para obtener `access_token` + `fetch()` manual con `Authorization: Bearer <access_token>` explícito
- **Pendiente resolver en próxima sesión**: el bug persiste, posiblemente el `access_token` de la sesión almacenada está expirado y el cliente no lo está refrescando antes del fetch

---

## ⚠️ Nota crítica — DEBE resolverse antes de producción

> **El formulario de contacto de la landing conecta DIRECTAMENTE a Supabase con la anon key.**
> Esto es temporal y funcional para MVP, pero tiene riesgos:
> - La anon key es visible en el HTML público
> - No hay validación de negocio (anti-spam, rate limiting, etc.)
> - No hay notificaciones automáticas (n8n/email)
>
> **Solución requerida:** Desplegar FastAPI en un host (Railway/Render/VPS) y redirigir el formulario al endpoint `POST /leads/`.

---

## Pendientes
- [x] Video programación con IA completado — https://www.youtube.com/watch?v=eABNL3igtVo ✅
- [x] Video n8n completado — https://www.youtube.com/watch?v=8A8PyJeQhlo ✅
- [ ] 🔴 Resolver bug panel admin: no redirige a login + no carga proyectos (ver diagnóstico en sección 17:25–18:00)
- [ ] Conectar Vercel al repo GitHub por integración (evitar depender de CLI para deployar)
- [ ] Agregar detalle de proyecto al hacer click en una fila
- [ ] Implementar cambio de estado desde el panel admin
- [ ] Definir y construir ciclo Lean dentro del detalle del proyecto
- [ ] Desplegar FastAPI en host y migrar formulario (CRÍTICO)
- [ ] Definir si n8n self-hosted o cloud
- [ ] Sección Quiénes somos — bloqueada esperando info de Héctor
- [ ] Testimonios reales — pendiente Héctor
