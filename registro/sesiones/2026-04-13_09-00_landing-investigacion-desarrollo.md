# Sesión: Landing page — Investigación y desarrollo

| Campo | Valor |
|---|---|
| Fecha | 2026-04-13 |
| Horario | 09:00 – 16:00 |
| Duración | ~7h |

## Objetivo
Refinar el sistema de trabajo usando toda la información acumulada, investigar páginas competidoras para alimentar la landing, ver videos de referencia, y avanzar en el desarrollo de la landing page.

## Lo que se hizo

### 09:00 – 10:00 — Refinamiento del sistema
- Releídas y analizadas las 3 reuniones acumuladas (resúmenes Gemini)
- Revisado informe W15 + respuesta de Héctor
- Consolidada la base de conocimiento para trabajar más eficientemente

### 10:00 – 11:20 — Investigación de páginas competidoras
- **Deel.com** — hero + métricas + testimonios + FAQ; lenguaje directo, enfocado en ROI
- **Sísua Digital** — metodología visible, lead magnet (recurso descargable), casos de éxito con Stark
- **ACL TI** — clientes enterprise (IBM, Oracle, BCI, Walmart); texto "partner tecnológico"
- **Urantiacos.cl** — equipo visible, certificaciones en footer, sección nosotros con años de experiencia

### 11:00 – 13:00 — Videos de referencia
- 11:00–11:16 → https://www.youtube.com/watch?v=p6ynR1c5TPA (16 min, completo)
- 11:16–11:37 → https://www.youtube.com/watch?v=C4sTAnCPEiU (21 min, completo)
- 11:37–12:37 → https://www.youtube.com/watch?v=eABNL3igtVo (1h vista de 2:31:13 — pendiente 1:31:13 para mañana)

### 14:10 – 16:00 — Desarrollo landing page
- Sección Tecnología ocultada (`display:none`) + link eliminado del nav
- Globe actualizado de 4 a 5 servicios reales: Diseño Web, Software, Apps Móviles, RPA, Chatbots
- Altura de sección `#producto` corregida proporcionalmente (600vh desktop / 520vh mobile)
- Footer actualizado: columna Servicios con los 5 reales, columna Empresa sin Tecnología
- Nueva sección `#sincon` — comparación Antes/Después (entre diferenciadores y testimonios)
- Nueva sección `#faq` — 7 preguntas frecuentes en acordeón (entre Legal y Contacto)
- Tarjetas flotantes del hero movidas más cerca del título (left/right 14–15%)
- Fix modo claro: texto de tarjetas del globe forzado a blanco (negro sobre negro antes)
- Fix resize: `ScrollTrigger.refresh()` con debounce — soluciona bug al expandir desde pantalla dividida

### 16:00 en adelante — Ajustes por feedback de Héctor
- Badge del hero: eliminado "RPA & Inteligencia Artificial · Santiago, Chile" → "Sustenta Futuro"
- `<title>` de la página: "Sustenta Futuro — Automatización RPA e IA" → "Sustenta Futuro"
- Descripción del hero: reescrita para cubrir los 5 servicios (sin enfoque en RPA)
- Globe servicio 4: "04 / RPA — Automatizaciones y RPA" → "04 / AUTO — Automatizaciones" (RPA mencionado en descripción)
- Reemplazado "robot/robots" por "automatización/el sistema" en toda la página (globe, FAQ, testimonial, sección legal)
- Botón "Explorar" del hero: redirige de `#tecnologia` (oculta) a `#producto`
- Creado informe W16 con formato Lean (desglose diario + pivotes) y cuestionario sección por sección con 25 preguntas urgenciadas (🔴🟡🟢)
- Nueva sección `#nosotros` — Quiénes somos con texto genérico, 3 stats placeholder y cuadro para foto del equipo
- Link "Nosotros" añadido al nav

## Problemas / Dudas
- **Globe bug en pantalla dividida → expandir**: GSAP cachea alturas al cargar. Fix: debounced `ScrollTrigger.refresh()`. ✅ Resuelto
- **Texto invisible en modo claro (globe cards)**: fondo hardcodeado oscuro + variables CSS cambiando en modo claro = texto negro sobre negro. Fix: override `[data-theme="light"]`. ✅ Resuelto
- **Altura sección globe insuficiente al agregar 5° servicio**: timeline GSAP más largo requiere sección proporcionalmente más alta. ✅ Resuelto

## Pendientes
- [ ] Ver resto del video 3 mañana (desde 1:00:00, quedan 1:31:13) — https://www.youtube.com/watch?v=eABNL3igtVo
- [ ] Sección Quiénes somos — bloqueado esperando respuestas de Héctor
- [ ] Validar métricas del hero con Héctor (80%, 247+, <1%)
- [ ] Testimonios reales — entregarlos Héctor
- [ ] Confirmar si Héctor tiene certificaciones (UiPath, Microsoft, AWS, etc.)
- [ ] Decisión redes sociales — preguntarle a Héctor
- [ ] Schema Supabase + backend FastAPI (próxima fase)
