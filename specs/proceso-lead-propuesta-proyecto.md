# Spec — Proceso Lead → Propuesta → Proyecto (con versionado)

**Estado**: Draft
**Fecha**: 2026-06-18
**Autor**: Cristóbal / Claude
**Decidido con el usuario**: 2026-06-18

---

## 1. Visión

El sistema modela un único proceso de negocio con tres etapas encadenadas:

```
LEAD  ──(se crea propuesta)──►  PROPUESTA(s)  ──(gana una)──►  PROYECTO
 1                                  N (versionadas)               1
```

- Un **lead** es solo un lead: datos de contacto + enriquecimiento. **Sin fases propias**.
- De un lead se generan **una o varias propuestas**. Cada propuesta es una **versión congelada** (snapshot) de la ficha de evaluación + notas + contenido al momento de crearla — como un commit de Git.
- Entre todas las versiones de un lead, una se marca como **principal**: es la que se muestra por defecto al abrir las propuestas de ese lead. Las demás quedan como **versiones guardadas** (solo lectura, historial).
- El **proyecto** es la propuesta **ganadora** (aceptada) de ese lead.
- El **Kanban** representa TODO el proceso macro: columnas Lead → Propuesta → Proyecto. (Distinto del tablero de tareas/fases actual, que es ejecución interna de un proyecto.)

---

## 2. Modelo de datos

### 2.1 Cambios en `lead_proposals` (migración 008)

Hoy: `id, lead_id, evaluation_id, pdf_storage_path, status, approved_by, approved_at, sent_at, created_at`.
`status ∈ {draft, approved, sent, accepted, rejected}`. Varias filas por lead ya permitidas.

Agregar:
| Columna | Tipo | Notas |
|---|---|---|
| `version` | `int NOT NULL` | Correlativo por lead (1, 2, 3…). |
| `is_principal` | `boolean NOT NULL DEFAULT false` | Una sola principal por lead. |
| `title` | `text` | Nombre legible de la versión (ej. "Propuesta con mantención"). |
| `snapshot` | `jsonb` | Copia inmutable de ficha + notas + contenido al crear. |

Restricciones:
- Índice único parcial: `UNIQUE (lead_id) WHERE is_principal` → máximo una principal por lead.
- `UNIQUE (lead_id, version)`.
- Backfill: filas existentes → `version` por `created_at`, la más reciente `is_principal=true`, `snapshot` = copia de su `lead_evaluations` actual.

### 2.2 `snapshot` (forma)

```json
{
  "evaluation": { ...copia de lead_evaluations al momento... },
  "notes": [ { "content": "...", "created_at": "...", "created_by": "..." } ],
  "lead": { "full_name": "...", "company": "...", "email": "..." },
  "captured_at": "2026-06-18T..."
}
```

La ficha `lead_evaluations` sigue siendo el **borrador vivo** (editable). Crear una propuesta congela su estado en `snapshot`; editar la ficha después NO altera versiones ya creadas.

### 2.3 Proyecto (migración 010) — DECIDIDO 2026-06-19

El **proyecto es una entidad de primera clase**: es lo que se trabaja a nivel desarrollo.
Se separa de la propuesta porque tienen ciclos de vida distintos (la propuesta es un
documento comercial congelado; el proyecto es trabajo vivo que dura semanas, con su
propio estado y su propio tablero de fases/tareas).

Nueva tabla `projects`:
| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `lead_id` | `uuid` NOT NULL → `leads(id)` | Cliente de origen. |
| `proposal_id` | `uuid` → `lead_proposals(id)` ON DELETE SET NULL | Propuesta ganadora que lo originó. Único parcial. |
| `name` | `text` NOT NULL | Toma `project_title` del snapshot al convertir. |
| `status` | `text` NOT NULL DEFAULT `'active'` | `active \| paused \| done \| cancelled`. |
| `started_at` | `timestamptz` DEFAULT now() | |
| `created_at` | `timestamptz` NOT NULL DEFAULT now() | |

Restricciones: `UNIQUE (proposal_id) WHERE proposal_id IS NOT NULL` (un proyecto por
propuesta ganadora); índice por `lead_id`. RLS: `authenticated` puede CRUD.

`phases.project_id` deja de ser texto fijo (`'sg-sustenta-futuro'`) y pasa a ser
**FK → `projects(id)`** (la tabla `phases` está vacía hoy, conversión limpia). Así el
tablero de fases/tareas/reportes queda anclado a un proyecto real. Cadena completa:
**lead → propuesta ganadora → proyecto → fases → tareas/reportes**.

**Conversión** (acción "Convertir en proyecto"): sobre una propuesta se marca
`status='accepted'`, se crea el `project` (nombre = `project_title` del snapshot) y el
lead avanza a `won`. Idempotente: si la propuesta ya tiene proyecto, devuelve el existente.

---

## 3. Etapa macro derivada (para el Kanban de proceso)

Se deriva de los datos, sin columna nueva en `leads`:

| Etapa | Condición |
|---|---|
| **Lead** | El lead no tiene propuestas. |
| **Propuesta** | Tiene ≥1 propuesta y ninguna `accepted`. |
| **Proyecto** | Tiene una propuesta `accepted` (la ganadora). |

(Se puede refinar con sub-estados usando `lead_proposals.status`.)

---

## 4. Backend (FastAPI)

- `POST /leads/{lead_id}/proposals` — crea nueva versión: snapshot del estado actual (ficha + notas), `version = max(version)+1`, primera versión queda `is_principal=true`.
- `PUT /proposals/{id}/principal` — marca principal (apaga las demás del mismo lead en una transacción).
- `GET /proposals?group_by=lead` — lista agrupada por lead (para la página Propuestas).
- `GET /leads/{lead_id}/proposals` — versiones de un lead (historial).
- `GET /proposals/{id}` — devuelve snapshot (vista de solo lectura de una versión).

### 4.1 Proyectos (migración 010)
- `POST /leads/{lead_id}/proposal/{proposal_id}/convert` — convierte la propuesta en proyecto: `status='accepted'`, crea `project`, lead → `won`. Idempotente.
- `GET /projects` — lista de proyectos (con datos del lead y propuesta).
- `GET /projects/{id}` — un proyecto.
- `PUT /projects/{id}` — actualiza `name` / `status`.

---

## 5. Frontend (Next.js admin)

### 5.1 Página Propuestas — de tabla plana a lista de leads
- Hoy: una fila por propuesta.
- Nuevo: una fila por **lead** con propuestas → muestra título de la principal, nº de versiones, etapa, estado.
- Click → vista del lead con sus propuestas.

### 5.2 Vista de propuestas de un lead (historial tipo Git)
- Se abre mostrando la **principal**.
- Lista lateral de **versiones** (v1, v2…), con su título/fecha; click para ver cualquiera (solo lectura del snapshot).
- Acción "Marcar como principal" en cualquier versión.
- Acción "Nueva versión" (crea snapshot del estado actual de la ficha).

### 5.3 Ficha del lead
- Ya se quitó el stepper de fases (✅ commit dc3e78c).
- Botón "Crear propuesta" → crea v1 (o nueva versión).

### 5.4 Convertir propuesta en proyecto
- En la vista de propuestas de un lead, la propuesta ganadora muestra un botón **"Convertir en proyecto"**.
- Tras convertir, el lead queda en `won` y aparece el proyecto en `/proyectos`.

### 5.5 Página `/proyectos` (lista de proyectos)
- Reemplaza el stub que redirige a inicio.
- Una fila por proyecto: nombre, cliente (lead), estado, fecha inicio.
- Click → abre el tablero de ejecución de ese proyecto (`/kanban?project=<id>`).

### 5.6 Kanban de ejecución por proyecto
- El `/kanban` deja de usar el `project_id` de texto fijo: ahora recibe `?project=<uuid>` y muestra las fases/tareas/reportes de ese proyecto.
- Sin `?project`, muestra un selector / lista de proyectos para elegir.

---

## 6. Fases de implementación

1. **Fundación (datos + backend)** ✅: migración 008, endpoints de versionado y principal.
2. **Propuestas UI** ✅: lista por lead + historial de versiones + marcar principal + ver snapshot + hilo de discusión (009).
3. **Proyecto (datos + backend)**: migración 010 (tabla `projects` + `phases.project_id` → FK), endpoints convert/list/get/update.
4. **Proyecto UI**: acción "Convertir en proyecto", página `/proyectos`, Kanban de ejecución por proyecto.

---

## 7. Deuda técnica / riesgos detectados

- `/proyectos` (frontend) probablemente apunta a la tabla `proyectos` eliminada en migración 007 → verificar y arreglar.
- `proyectos.propuesta_id` referenciaba `propuestas` (también dropeada) — irrelevante ahora, pero a considerar si se reintroduce proyecto.
- Migraciones en producción requieren aprobación humana (regla CLAUDE.md §5). Backfill debe ser idempotente y verificado.
- Snapshot puede crecer; `jsonb` es suficiente para el MVP.

---

## 8. Decisiones (cerradas 2026-06-19)

- ✅ **"Proyecto" tendrá tabla propia** (`projects`), no solo `status='accepted'`. Razón: propuesta y proyecto tienen ciclos de vida distintos; el proyecto es el espacio de trabajo de desarrollo (ya hay multi-cliente y el tablero de fases necesita un ancla real). Ver §2.3.
- ✅ El menú **"Kanban" pasa a ser el tablero de ejecución por proyecto** (recibe `?project`). No se construye un Kanban macro Lead·Propuesta·Proyecto por ahora — el seguimiento del embudo se ve en `/` (leads) y `/propuestas`.
- 🔲 Sub-estados dentro de "Propuesta" en un futuro tablero macro: diferido.
