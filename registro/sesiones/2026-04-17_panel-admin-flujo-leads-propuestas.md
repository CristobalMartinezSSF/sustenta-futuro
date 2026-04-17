# Sesión: Flujo Leads → Propuestas → Proyectos en el admin panel

| Campo | Valor |
|---|---|
| Fecha | 2026-04-17 |
| Responsable | Cristóbal |

---

## Objetivo

Implementar el flujo completo de gestión de leads → propuestas → proyectos en el panel admin, basado en el feedback de audio de Héctor (5 audios del 17/04).

---

## Lo que se hizo

### Cuenta de Héctor
- Creada cuenta en el admin panel: `hector.molt@sustentafuturo.com` / contraseña: `hector123`, rol `admin`
- Verificado acceso al admin: https://admin-taupe-nu.vercel.app

### Análisis de feedback (audios de Héctor)
- Transcripción de 5 audios OGG con Whisper local (modelo medium)
- Identificados 9 puntos de acción concretos
- Creada lista de tareas en el sistema

### Reestructura del nav (todas las páginas)
- Renombrado "Proyectos" → "Leads" en la página principal del admin
- Renombrado "Configuración" → "Config. Landing"
- Nuevo orden de nav: **Leads | Propuestas | Proyectos | Usuarios | Config. Landing | Cerrar sesión**
- Nav aplicado consistentemente en todas las páginas: `/`, `/leads/[id]`, `/usuarios`, `/configuracion`

### Nuevas tablas en Supabase
Migración `002_propuestas_proyectos_levantamiento.sql` aplicada:
- `propuestas` — documento formal con campos: título, descripción, stack, funcionalidades, plan de implementación, costo, duración, método de pago, estado
- `proyectos` — creado automáticamente desde propuesta aprobada
- `levantamiento_respuestas` — respuestas al cuestionario de 10 preguntas por lead

### Página /propuestas
- Vista de todas las propuestas con sus estados
- Badges de estado: En revisión (azul) / Enviada (amarillo) / Aprobada (verde) / Rechazada (rojo)
- Cambio de estado inline por fila
- Al aprobar una propuesta → se crea el proyecto automáticamente
- **No tiene botón de crear propuesta** (solo se crea desde el detalle de un lead)
- Botón "← Ir a Leads" como recordatorio del flujo correcto

### Página /proyectos
- Vista de proyectos activos originados desde propuestas aprobadas
- Cambio de estado inline: activo / pausado / completado / cancelado
- Empty state explica que los proyectos solo vienen de propuestas aprobadas

### Lead detail (/leads/[id]) — nuevas funciones
- **Sección Levantamiento**: cuestionario de 10 preguntas estándar, auto-guardado por pregunta, contador de progreso "X/10 respondidas"
- **Botón "Crear propuesta"**: redirige a la página de propuestas con el lead pre-seleccionado
- Nav actualizado con estructura completa

### Documentación
- `docs/flujo-leads-propuestas-proyectos.md` — flujo completo documentado con estructura de datos, reglas de negocio, URLs

### Lectura de documentos de referencia de Héctor
- Leídos: Cotización COT-001-2026 (Conector DT) y Propuesta Comercial BUK
- Identificada estructura oficial de propuestas/cotizaciones de Sustenta Futuro
- Base para implementar el template PDF automatizado

---

## Commits del día

| Hash | Descripción |
|---|---|
| `0ea59cc` | feat: unified nav across admin panel |
| `ec5e4de` | feat: implement Propuestas, Proyectos, and Levantamiento modules |
| `8093d34` | fix: remove create propuesta button from /propuestas |
| `39acd9e` | docs: add full Leads → Propuestas → Proyectos flow documentation |

---

## Estado del sistema al cierre

| Componente | Estado |
|---|---|
| Landing page (GitHub Pages) | ✅ Activa |
| Panel admin (Vercel) | ✅ Desplegado con nuevo flujo |
| Base de datos (Supabase) | ✅ 5 tablas activas |
| Flujo Leads | ✅ Implementado |
| Flujo Propuestas | ✅ Implementado |
| Flujo Proyectos | ✅ Implementado |
| Levantamiento | ✅ Implementado |
| PDF de propuesta | ⏳ Pendiente confirmación de Héctor |
| Email con PDF | ⏳ Pendiente confirmación de Héctor |
| IA → borrador propuesta | ⏳ Pendiente confirmación de Héctor |

---

## Próximo paso

Esperar confirmación de Héctor sobre la implementación actual antes de continuar con la automatización PDF + email + IA.
