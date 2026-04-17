# Flujo: Leads → Propuestas → Proyectos

**Sistema de Gestión Sustenta Futuro**
Última actualización: 2026-04-17

---

## Visión general

El sistema opera en **tres capas distintas**. Un contacto entra como Lead, se trabaja hasta convertirse en una Propuesta formal, y si el cliente la aprueba, se transforma en un Proyecto activo.

```
┌─────────────┐     levantamiento      ┌──────────────┐     aprobada      ┌─────────────┐
│    LEADS    │ ──────────────────────▶ │  PROPUESTAS  │ ────────────────▶ │  PROYECTOS  │
│  (ideas /   │                         │  (documento  │                   │  (trabajo   │
│ solicitudes)│                         │   formal)    │                   │   activo)   │
└─────────────┘                         └──────────────┘                   └─────────────┘
```

Las secciones **no son lineales** — un lead no desaparece cuando genera una propuesta. Son vistas del mismo proceso en distintas etapas.

---

## Capa 1 — Leads

### ¿Qué es un lead?
Una idea o solicitud recibida, ya sea desde el formulario público del sitio web o ingresada manualmente por el equipo.

### ¿Cómo llega un lead?
- Formulario público en `sustentafuturo.com` → se crea automáticamente en la DB
- Entrada manual desde el panel admin → botón "Agregar lead"

### Estados de un lead

| Estado | Descripción |
|---|---|
| `new` | Recién llegado, sin gestión |
| `reviewing` | Esperando reunión inicial |
| `contacted` | En proceso de prototipado / exploración |
| `qualified` | En proceso de propuesta |
| `proposal_pending` | En desarrollo (propuesta enviada, en espera) |
| `won` | Proyecto completado |
| `lost` | Cancelado o descartado |

### ¿Qué se hace con un lead?

1. Revisar los datos de contacto (nombre, empresa, email, mensaje)
2. Iniciar el **levantamiento de información** (ver sección más abajo)
3. Una vez completado el levantamiento, generar una **Propuesta formal**

---

## Levantamiento de información

Antes de generar una propuesta, se realiza un levantamiento estándar. Desde el detalle de cada lead hay una sección **"Levantamiento"** con 10 preguntas predefinidas:

| # | Pregunta |
|---|---|
| 1 | ¿Cuál es el objetivo principal del sistema que necesitas? |
| 2 | ¿Quiénes serán los usuarios del sistema? (roles, cantidad estimada) |
| 3 | ¿Qué funcionalidades son imprescindibles para el lanzamiento? |
| 4 | ¿Existen integraciones con sistemas externos requeridas? (ERP, CRM, APIs, etc.) |
| 5 | ¿Cuál es el plazo esperado de entrega? |
| 6 | ¿Cuál es el presupuesto aproximado disponible? |
| 7 | ¿Tienes referentes visuales o sistemas similares que te gusten? |
| 8 | ¿Cuál es la infraestructura tecnológica actual de tu empresa? |
| 9 | ¿Hay requisitos de seguridad, compliance o normativas específicas a cumplir? |
| 10 | ¿Qué problema crítico resuelve este sistema para tu empresa? |

Las respuestas se guardan automáticamente y alimentan el borrador de la propuesta.

---

## Capa 2 — Propuestas

### ¿Qué es una propuesta?
Un documento formal generado a partir de un lead y su levantamiento. Contiene toda la información necesaria para que el cliente apruebe el trabajo.

### ¿Cómo se crea una propuesta?
**Solo desde el detalle de un lead** — botón "Crear propuesta" en la página `/leads/{id}`.
No se pueden crear propuestas de forma independiente.

### Contenido de una propuesta

| Campo | Descripción |
|---|---|
| **Título** | Nombre del proyecto/sistema propuesto |
| **Descripción** | Resumen ejecutivo del proyecto |
| **Funcionalidades** | Lista de features incluidos en el alcance |
| **Stack tecnológico** | Tecnologías que se utilizarán |
| **Plan de implementación** | Fases del proyecto con plazos estimados |
| **Costo estimado** | Valor total del proyecto (en CLP) |
| **Duración** | Semanas estimadas de desarrollo |
| **Método de pago** | Ej: 50% inicio / 50% entrega |

### Estados de una propuesta

```
reviewing ──▶ sent ──▶ approved ──▶ [crea Proyecto automáticamente]
                  └──▶ rejected
```

| Estado | Descripción |
|---|---|
| `reviewing` | En revisión interna (default al crear) |
| `sent` | Enviada al cliente por email |
| `approved` | Cliente aprobó — se crea el Proyecto automáticamente |
| `rejected` | Cliente rechazó o se descartó internamente |

### ¿Qué pasa cuando se aprueba?
Al cambiar el estado a `approved`, el sistema crea automáticamente un **Proyecto** en la capa 3 con los datos de la propuesta (título, costo, duración).

---

## Capa 3 — Proyectos

### ¿Qué es un proyecto?
Un trabajo activo que comenzó porque una propuesta fue aprobada por el cliente.

### ¿Cómo se crea un proyecto?
**Nunca de forma manual.** Solo se crea automáticamente cuando una propuesta pasa al estado `approved`.

### Estados de un proyecto

| Estado | Descripción |
|---|---|
| `active` | En desarrollo activo |
| `paused` | Pausado temporalmente |
| `completed` | Entregado y finalizado |
| `cancelled` | Cancelado post-aprobación |

---

## Flujo completo paso a paso

```
1. Llega solicitud (web o manual)
        ↓
2. Aparece en /leads como "Sin iniciar"
        ↓
3. Se revisa y se actualiza el estado del lead
        ↓
4. Se abre el lead y se hace click en "Iniciar levantamiento"
        ↓
5. Se responden las 10 preguntas estándar (auto-guardado)
        ↓
6. Se hace click en "Crear propuesta" desde el lead
        ↓
7. Se completa el formulario de propuesta (funcionalidades, stack, plan, costo)
        ↓
8. La propuesta queda en estado "reviewing"
        ↓
9. El equipo la revisa y la perfecciona
        ↓
10. Se cambia a "sent" → se envía al cliente
        ↓
11a. Cliente aprueba → estado "approved" → se crea Proyecto automáticamente
11b. Cliente rechaza → estado "rejected" → el lead puede seguir trabajándose
        ↓
12. El Proyecto aparece en /proyectos con estado "active"
```

---

## Estructura de datos

```
leads
  ├── id
  ├── name, email, phone, company, message
  ├── status (new → ... → won/lost)
  └── created_at

levantamiento_respuestas
  ├── id
  ├── lead_id → leads.id
  ├── pregunta, respuesta, orden
  └── updated_at

propuestas
  ├── id
  ├── lead_id → leads.id
  ├── title, description
  ├── status (reviewing → sent → approved/rejected)
  ├── cost, duration_weeks, payment_method
  ├── stack, functionalities, implementation_plan
  └── created_at, updated_at

proyectos
  ├── id
  ├── propuesta_id → propuestas.id
  ├── lead_id → leads.id
  ├── title, status (active/paused/completed/cancelled)
  ├── cost, duration_weeks
  └── started_at, created_at
```

---

## URLs del panel admin

| Sección | URL | Descripción |
|---|---|---|
| Leads | `/` | Lista de todos los leads |
| Detalle lead | `/leads/{id}` | Datos, levantamiento, notas, crear propuesta |
| Propuestas | `/propuestas` | Vista de todas las propuestas con sus estados |
| Proyectos | `/proyectos` | Proyectos activos desde propuestas aprobadas |
| Usuarios | `/usuarios` | Gestión de usuarios internos (solo admin) |
| Config. Landing | `/configuracion` | Editor de contenido del sitio web (solo admin) |

---

## Reglas de negocio

- Una propuesta **solo se crea desde un lead** — nunca de forma independiente
- Un proyecto **solo se crea desde una propuesta aprobada** — nunca de forma manual
- Un lead puede tener **múltiples propuestas** (si una es rechazada, se puede generar otra)
- Los leads **no desaparecen** cuando generan propuestas — siguen visibles en `/leads`
- El levantamiento es **opcional** pero recomendado antes de crear la propuesta
