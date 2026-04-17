# Informe de Trabajo — 17 de Abril 2026

| Campo | Valor |
|---|---|
| Fecha | 2026-04-17 |
| Responsable | Cristóbal |
| Para revisión de | Héctor Molt |

---

## Resumen ejecutivo

Jornada enfocada en implementar el flujo central del sistema de gestión: **Leads → Propuestas → Proyectos**, basado directamente en el feedback de audio enviado por Héctor. Se transcribieron los 5 audios, se identificaron las tareas, y se implementó todo el flujo en el panel admin. El día cerró con la lectura de los documentos de propuesta y cotización de Héctor, que servirán como base para la siguiente etapa de automatización.

---

## 1. Cuenta de Héctor en el admin

Se creó la cuenta de acceso al panel administrativo:

| Campo | Valor |
|---|---|
| URL | https://admin-taupe-nu.vercel.app |
| Email | hector.molt@sustentafuturo.com |
| Contraseña | hector123 |
| Rol | Admin (acceso total) |

---

## 2. Implementación del flujo Leads → Propuestas → Proyectos

Basado en el feedback de los audios, se implementaron **3 secciones distintas** en el panel admin, tal como Héctor describió:

### Menú de navegación

El menú ahora muestra las tres capas del sistema más las secciones de gestión interna:

```
Leads | Propuestas | Proyectos | Usuarios | Config. Landing | Cerrar sesión
```

Este menú es **consistente en todas las páginas** del admin.

---

### Capa 1 — Leads (`/`)

La sección principal del admin muestra todos los leads entrantes.

- Renombrada correctamente de "Proyectos" a "Leads"
- Botón "Agregar lead" para entrada manual
- Cada lead es clickeable y lleva a su página de detalle

**Dentro del detalle de cada lead** se agregaron dos nuevas funciones:

**A) Levantamiento de información**

Cuestionario estándar de 10 preguntas para levantar los requisitos del proyecto antes de generar una propuesta. Las respuestas se guardan automáticamente.

| # | Pregunta |
|---|---|
| 1 | ¿Cuál es el objetivo principal del sistema que necesitas? |
| 2 | ¿Quiénes serán los usuarios del sistema? |
| 3 | ¿Qué funcionalidades son imprescindibles para el lanzamiento? |
| 4 | ¿Existen integraciones con sistemas externos requeridas? |
| 5 | ¿Cuál es el plazo esperado de entrega? |
| 6 | ¿Cuál es el presupuesto aproximado disponible? |
| 7 | ¿Tienes referentes visuales o sistemas similares? |
| 8 | ¿Cuál es la infraestructura tecnológica actual? |
| 9 | ¿Hay requisitos de seguridad o normativas a cumplir? |
| 10 | ¿Qué problema crítico resuelve este sistema? |

**B) Botón "Crear propuesta"**

Una vez completado el levantamiento, el botón "Crear propuesta" lleva al formulario para generar la propuesta formal vinculada a ese lead.

---

### Capa 2 — Propuestas (`/propuestas`)

Vista de todas las propuestas formales generadas desde leads, con sus estados.

**Estados implementados:**

| Estado | Color | Descripción |
|---|---|---|
| En revisión | Azul | Recién creada, en revisión interna |
| Enviada | Amarillo | Enviada al cliente |
| Aprobada | Verde | Cliente aprobó → crea Proyecto automáticamente |
| Rechazada | Rojo | Descartada |

**Campos de una propuesta:**
- Título del proyecto
- Descripción ejecutiva
- Funcionalidades incluidas
- Stack tecnológico
- Plan de implementación
- Costo estimado (CLP)
- Duración (semanas)
- Método de pago

**Regla implementada:** las propuestas **solo se crean desde el detalle de un lead**. La sección `/propuestas` es exclusivamente una vista de estados — no tiene botón de creación independiente. Esto es consistente con el flujo que describiste: el lead es el origen, no la propuesta.

---

### Capa 3 — Proyectos (`/proyectos`)

Muestra los proyectos activos originados desde propuestas aprobadas.

- **Solo se crean automáticamente** cuando una propuesta pasa a estado "Aprobada"
- No hay creación manual de proyectos
- Estados: Activo / Pausado / Completado / Cancelado

---

## 3. Documentación del flujo

Se generó documentación técnica completa del flujo en `docs/flujo-leads-propuestas-proyectos.md` con:
- Diagrama del proceso
- Descripción de cada capa
- Reglas de negocio
- Estructura de base de datos
- URLs del admin

---

## 4. Lectura de propuestas y cotizaciones de referencia

Se leyeron los dos documentos que compartiste (Cotización Conector DT y Propuesta Buk) y se identificó la estructura oficial de documentos de Sustenta Futuro. Esta estructura será la base para la próxima etapa.

---

## Estado general del sistema

| Componente | Estado |
|---|---|
| Landing page | ✅ Activa en sustentafuturo.com |
| Panel admin | ✅ https://admin-taupe-nu.vercel.app |
| Gestión de leads | ✅ Funcionando |
| Levantamiento de requisitos | ✅ Implementado |
| Gestión de propuestas | ✅ Implementado |
| Gestión de proyectos | ✅ Implementado |
| PDF de propuesta automatizado | ⏳ Pendiente tu revisión |
| Envío de propuesta por email | ⏳ Pendiente tu revisión |
| Generación IA del borrador | ⏳ Pendiente tu revisión |

---

## Consulta para Héctor

Antes de continuar con la siguiente etapa (automatización PDF + email + IA), necesito tu confirmación en los siguientes puntos:

**1. ¿El flujo Leads → Propuestas → Proyectos está correcto?**
Tal como lo describiste: leads son ideas entrantes, propuestas son documentos formales generados desde el lead, proyectos solo cuando la propuesta es aprobada.

**2. ¿Las 10 preguntas del levantamiento son las correctas?**
O hay preguntas que quieras cambiar, agregar o eliminar según tu experiencia con clientes.

**3. ¿Los campos de la propuesta son suficientes?**
Actualmente: título, descripción, funcionalidades, stack, plan de implementación, costo, duración, método de pago. ¿Falta algo?

**4. ¿La moneda de las propuestas es siempre CLP o también manejas USD y UF?**
Vi que usas USD en la cotización del Conector DT y UF en la propuesta de Buk.

**5. ¿Quieres avanzar con la automatización PDF + IA?**
El siguiente paso sería que al completar el levantamiento, la IA (Claude) genere automáticamente el borrador de la propuesta con el formato de tus documentos actuales, y luego se exporte como PDF para enviar al cliente por email.

---

*Informe generado el 17 de abril de 2026 — Cristóbal Martínez*
