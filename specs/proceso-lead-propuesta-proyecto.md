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

### 2.3 Proyecto

El **proyecto = propuesta aceptada**. MVP: no se reintroduce tabla `proyectos`; un lead está "en proyecto" cuando su propuesta principal tiene `status='accepted'`. (Si más adelante se necesita gestión rica de proyecto, se evalúa tabla aparte.)

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

### 5.4 Kanban de proceso (nuevo)
- Columnas: Lead · Propuesta · Proyecto (derivadas, §3).
- Cada tarjeta = un lead, ubicado por su etapa macro.
- El tablero de tareas/fases actual (`/kanban`) se mantiene como ejecución **dentro** de un proyecto (se renombra/reubica para evitar confusión).

---

## 6. Fases de implementación

1. **Fundación (datos + backend)**: migración 008 (version/is_principal/title/snapshot + backfill), endpoints de versionado y principal.
2. **Propuestas UI**: lista por lead + vista historial de versiones + marcar principal + ver snapshot.
3. **Kanban de proceso**: tablero Lead→Propuesta→Proyecto derivado.
4. **Limpieza/Proyecto**: arreglar/reubicar página `/proyectos` (tabla fue dropeada en 007); aclarar separación tablero de proceso vs. tablero de tareas.

---

## 7. Deuda técnica / riesgos detectados

- `/proyectos` (frontend) probablemente apunta a la tabla `proyectos` eliminada en migración 007 → verificar y arreglar.
- `proyectos.propuesta_id` referenciaba `propuestas` (también dropeada) — irrelevante ahora, pero a considerar si se reintroduce proyecto.
- Migraciones en producción requieren aprobación humana (regla CLAUDE.md §5). Backfill debe ser idempotente y verificado.
- Snapshot puede crecer; `jsonb` es suficiente para el MVP.

---

## 8. Decisiones abiertas (para confirmar en su momento)

- ¿El Kanban de proceso reemplaza al menú "Kanban" actual o convive como vista separada?
- ¿"Proyecto" necesita tabla propia (gestión rica) o basta con `status='accepted'` sobre la propuesta principal?
- Sub-estados dentro de "Propuesta" (borrador/enviada/aceptada) en el Kanban.
