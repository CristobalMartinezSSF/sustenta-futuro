# Diagrama relacional — SG Sustenta Futuro

Modelo de datos del sistema (Supabase Postgres, esquema `public`). Generado desde
el esquema real de la base. GitHub renderiza el diagrama Mermaid automáticamente.

> Convención: `PK` clave primaria · `FK` clave foránea · `UK` único.
> `assigned_to` en `leads` referencia a `admin_profiles` de forma lógica (sin
> constraint dura).

```mermaid
erDiagram
    admin_profiles {
        uuid id PK
        text email UK
        text full_name
        text role
        text phone
        timestamptz created_at
    }

    leads {
        uuid id PK
        text full_name
        text email
        text phone
        text company
        text source
        text status
        uuid assigned_to
        text service_interest
        jsonb enrichment_data
        timestamptz created_at
    }

    lead_status_history {
        uuid id PK
        uuid lead_id FK
        text old_status
        text new_status
        uuid changed_by
        timestamptz changed_at
    }

    lead_notes {
        uuid id PK
        uuid lead_id FK
        text content
        uuid created_by
        timestamptz created_at
    }

    lead_evaluations {
        uuid id PK
        uuid lead_id FK
        text project_title
        jsonb functionalities
        jsonb stack
        jsonb phases
        numeric client_price
        numeric internal_cost
        numeric monthly_maintenance
        text verdict
        uuid verdict_by
        timestamptz created_at
    }

    lead_proposals {
        uuid id PK
        uuid lead_id FK
        uuid evaluation_id FK
        text quote_number UK
        int version
        boolean is_principal
        text status
        text pdf_storage_path
        jsonb snapshot
        uuid approved_by
        timestamptz created_at
    }

    proposal_counters {
        int year PK
        int last_seq
    }

    proposal_messages {
        uuid id PK
        uuid proposal_id FK
        uuid author_id
        text body
        jsonb attachments
        timestamptz created_at
    }

    projects {
        uuid id PK
        uuid lead_id FK
        uuid proposal_id FK
        text name
        text status
        timestamptz started_at
        timestamptz finished_at
    }

    phases {
        uuid id PK
        uuid project_id FK
        text name
        int order_index
        text status
        uuid approved_by
    }

    tasks {
        uuid id PK
        uuid phase_id FK
        text title
        text status
        int order_index
    }

    task_notes {
        uuid id PK
        uuid task_id FK
        uuid author_id
        text content
    }

    phase_files {
        uuid id PK
        uuid phase_id FK
        uuid uploaded_by
        text filename
        text storage_path
    }

    daily_reports {
        uuid id PK
        uuid phase_id FK
        uuid author_id
        date report_date
        text accomplished
    }

    activity_log {
        uuid id PK
        uuid actor_id
        text action
        text entity_type
        uuid entity_id
        jsonb details
    }

    landing_config {
        uuid id PK
        text section
        text key
        text value
    }

    admin_profiles ||--o{ lead_evaluations : "evalúa (verdict_by)"
    admin_profiles ||--o{ lead_proposals : "aprueba (approved_by)"
    admin_profiles ||--o{ phases : "aprueba"
    admin_profiles ||--o{ task_notes : "escribe"
    admin_profiles ||--o{ phase_files : "sube"
    admin_profiles ||--o{ daily_reports : "reporta"
    admin_profiles ||--o{ activity_log : "acciona"

    leads ||--o{ lead_status_history : "historial"
    leads ||--o{ lead_notes : "notas"
    leads ||--o{ lead_evaluations : "ficha técnico-económica"
    leads ||--o{ lead_proposals : "propuestas"
    leads ||--o{ projects : "proyecto"

    lead_evaluations ||--o{ lead_proposals : "origina"
    lead_proposals ||--o{ proposal_messages : "hilo de discusión"
    lead_proposals ||--o| projects : "se convierte en"

    projects ||--o{ phases : "fases"
    phases ||--o{ tasks : "tareas"
    phases ||--o{ phase_files : "archivos"
    phases ||--o{ daily_reports : "reportes diarios"
    tasks ||--o{ task_notes : "notas"
```

## Módulos por grupo de tablas

| Grupo | Tablas | Rol |
|---|---|---|
| **Usuarios / auth** | `admin_profiles` | Perfiles internos (`admin` / `user`), teléfono para recuperación WhatsApp |
| **Leads (captación)** | `leads`, `lead_status_history`, `lead_notes` | Lead desde la landing, historial de estados y notas internas |
| **Evaluación + propuestas** | `lead_evaluations`, `lead_proposals`, `proposal_counters`, `proposal_messages` | Ficha técnico-económica, propuestas versionadas con número COT y hilo de discusión |
| **Proyectos (delivery)** | `projects`, `phases`, `tasks`, `task_notes`, `phase_files`, `daily_reports` | Ejecución del proyecto ganado: fases, tareas (Kanban), archivos y reportes |
| **Sistema** | `activity_log`, `landing_config` | Auditoría de acciones y configuración editable de la landing |

## Estados del lead (columna `leads.status`)

```
new → reviewing → pending_approval → contacted → evaluating → viable → proposal_sent → won / lost
```
