# Reunión Semanal — Semana W15 (06/04/2026 al 12/04/2026)

## Sesiones de la semana
| Fecha | Tema | Duración | Archivo |
|---|---|---|---|
| 2026-04-09 | Sistema de registro de tareas | corta | *(protocolo en CLAUDE.md)* |
| 2026-04-09 | Gestión agéntica y proceso de trabajo | extendida | [ver](../sesiones/2026-04-09_extendida_gestion-agentica.md) |
| 2026-04-09 | Diseño landing page — reunión con Hector | — | [ver](../sesiones/2026-04-09_18-21_gestion-agentica.md) |
| 2026-04-10 | Landing page — mejoras visuales y sección tecnología | — | [ver](../sesiones/2026-04-10_landing-page-mejoras.md) |

## Logros consolidados
- Sistema de registro de sesiones implementado (resumen automático, archivo semanal)
- Árbol agéntico base definido: 12 agentes activos en `.claude/agents/`
- CLAUDE.md actualizado con protocolo de sesiones y arquitectura agéntica
- **Hito**: Repositorio [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) — patrón de diseño de agentes superior incorporado (personalidad + memoria + vibe)
- Landing page rediseñada a paleta B&W minimalista (backup verde guardado como `index.green.html`)
- Globe (`cobe`) integrado en sección pinneable con scroll-driven rotation
- Servicios revelados uno a la vez con GSAP al scrollear el globe (tarjetas alternando derecha/izquierda)
- CTA renombrado a "Conversemos" en todos los puntos de la página
- Fix "Libera tu talento" invisible en modo oscuro y claro
- Sección Servicios reemplazada por sección Tecnología con 8 agentes + stack tecnológico
- Nav actualizado a "Tecnología" con anchor `#tecnologia`
- Deploy automático funcionando vía GitHub Actions (push a main → GitHub Pages)

## Problemas encontrados
- `background-clip: text` no es compatible con animaciones `opacity` en hijos — causa texto invisible; patrón a evitar
- Las tarjetas del globe se ven pequeñas y dispersas en pantallas medianas (ajuste de `calc(50% ± 275px)` pendiente de validación)

## Dudas / pendientes para Hector
- [ ] ¿Cómo llegan los proyectos de clientes? ¿Solo por Hector o también por leads directos?
- [ ] Validar que los 8 agentes listados en la sección Tecnología son los correctos y están bien nombrados
- [ ] Revisar y aprobar el texto de la sección Tecnología antes de dar la landing por terminada
- [ ] ¿Cuáles son los servicios exactos que vendemos? Lista completa con nombres, descripción breve y cuáles deben aparecer en la landing page

## Plan para la próxima semana
- [ ] Terminar de pulir la landing page (responsividad, elementos dispersos, sección diferenciadores)
- [ ] Definir y crear el schema de Supabase (tabla `leads`, `lead_status_history`, `admin_profiles`)
- [ ] Iniciar backend FastAPI: endpoint `POST /leads`
- [ ] Conectar el formulario de la landing al backend
