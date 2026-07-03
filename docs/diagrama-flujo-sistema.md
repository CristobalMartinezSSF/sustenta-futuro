# Diagrama de flujo — SG Sustenta Futuro

Recorrido funcional del sistema, de punta a punta: desde que un visitante llega a
la landing hasta que un proyecto ganado se ejecuta en el panel. GitHub renderiza
el Mermaid automáticamente.

## 1. Flujo principal: de visitante a proyecto entregado

```mermaid
flowchart TD
    A[Visitante en landing pública] -->|completa formulario| B[POST /leads]
    B --> C[(leads · status=new)]
    C --> D[Enrichment IA<br/>enrichment.py]
    D --> E[Panel admin · lista de Leads]

    E --> F{Revisión del lead}
    F -->|descartar| G[(status=lost)]
    F -->|avanzar| H[Ficha de evaluación<br/>técnico-económica]

    H --> I[(lead_evaluations)]
    I --> J{Veredicto}
    J -->|no viable| G
    J -->|viable| K[Generar propuesta]

    K --> L[allocate_quote_number<br/>COT-NNN-AAAA]
    L --> M[Render PDF<br/>HTML→Chromium]
    M --> N[(lead_proposals · versionada)]
    N --> O[Hilo de discusión<br/>proposal_messages]
    N --> P[Enviar propuesta al cliente<br/>Resend email]

    P --> Q{Cliente acepta?}
    Q -->|no| G
    Q -->|sí| R[Convertir propuesta en proyecto]
    R --> S[(projects)]
    S --> T[Fases + Tareas · Kanban]
    T --> U[Reportes diarios / archivos]
    U --> V[(status=won · proyecto entregado)]
```

## 2. Autenticación y gestión de usuarios

```mermaid
flowchart TD
    L1[Login /login] -->|signInWithPassword| L2{Credenciales OK?}
    L2 -->|no| L3["¿Olvidaste tu contraseña?"]
    L2 -->|sí| L4[Panel admin]

    L3 -->|resetPasswordForEmail| L5[Email de recuperación<br/>Supabase + Resend SMTP]
    L5 --> L6[/reset-password · fija nueva clave/]
    L6 --> L1

    L4 -->|rol admin| M1[Página Usuarios]
    M1 --> M2[Crear usuario<br/>signUp + admin_profiles]
    M1 --> M3[Resetear clave de un usuario<br/>POST /auth/users/id/reset-password]
    M3 -.->|puente futuro| M4[[WhatsApp · Meta Cloud API<br/>usa admin_profiles.phone]]
```

## 3. Arquitectura de despliegue

```mermaid
flowchart LR
    subgraph Cliente
      W[Landing estática<br/>index.html]
      AD[Panel admin<br/>Next.js]
    end
    subgraph Servicios
      API[FastAPI<br/>Render]
      SB[(Supabase<br/>Postgres + Auth + Storage)]
      RS[Resend<br/>email]
      GE[Gemini<br/>redacción propuestas]
    end
    W -->|POST /leads| API
    AD -->|REST + JWT| API
    AD -->|Auth directo| SB
    API -->|httpx REST| SB
    API --> RS
    API --> GE
    API -->|render PDF| CH[Chromium headless]
```

## Módulos y rutas clave

| Módulo | Frontend (admin) | Backend (FastAPI) |
|---|---|---|
| Captación de leads | landing `index.html` (form) | `routers/landing.py`, `routers/leads.py` |
| Revisión de leads | `app/leads/…` | `routers/leads.py` |
| Ficha de evaluación | `app/leads/[id]/EvaluationSection.tsx` | `routers/evaluations.py` |
| Propuestas + PDF | `app/propuestas/[leadId]` | `routers/proposals.py`, `proposal_render.py` |
| Proyectos + Kanban | `app/proyectos`, `app/kanban` | `routers/projects.py` |
| Usuarios + recuperación | `app/usuarios`, `app/login`, `app/reset-password` | `routers/auth.py` |
