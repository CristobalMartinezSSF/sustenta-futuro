# Reunión Semanal — Semana W16 (13/04/2026 al 19/04/2026)

## Sesiones de la semana
| Fecha | Tema | Duración | Archivo |
|---|---|---|---|
| 2026-04-13 | Landing page — investigación y desarrollo | ~7h | [ver](../sesiones/2026-04-13_09-00_landing-investigacion-desarrollo.md) |

## Trabajo del día 2026-04-13

### 09:00 – 10:00 — Refinamiento del sistema de trabajo
- Releídas y analizadas las 3 reuniones acumuladas (resúmenes Gemini)
- Revisado informe W15 + respuesta de Héctor
- Consolidada la base de conocimiento para trabajar de forma más eficiente

### 10:00 – 11:20 — Investigación de páginas competidoras
| Página | Lo destacable |
|---|---|
| Deel.com | Estructura hero + métricas + testimonios + FAQ. Lenguaje directo, enfocado en ROI |
| Sísua Digital | Metodología visible, lead magnet (recurso descargable), casos de éxito con Stark |
| ACL TI | Clientes enterprise (IBM, Oracle, BCI, Walmart). Texto "partner tecnológico" |
| Urantiacos.cl | Equipo visible, certificaciones en footer, sección nosotros con años de experiencia |

**Conclusiones de investigación:**
- Agregar sección Quiénes somos (bloqueada, esperar info de Héctor)
- Agregar certificaciones cuando Héctor confirme cuáles tiene
- Considerar lead magnet en fases posteriores
- Texto tipo "partner tecnológico" a incorporar cuando tengamos info de nosotros

### 11:00 – 13:00 — Investigación de videos
- 11:00–11:16 → https://www.youtube.com/watch?v=p6ynR1c5TPA (16 min, completo)
- 11:16–11:37 → https://www.youtube.com/watch?v=C4sTAnCPEiU (21 min, completo)
- 11:57–12:57 → https://www.youtube.com/watch?v=eABNL3igtVo (1h vista de 2:31:13 — **pendiente 1:31:13 para mañana**)

### 14:10 en adelante — Desarrollo landing page

## Logros de desarrollo

| # | Cambio | Archivo |
|---|---|---|
| 1 | Sección Tecnología ocultada (`display:none`) + link de nav eliminado | `apps/web/index.html` |
| 2 | Globe actualizado de 4 a 5 servicios reales (Web, Software, Apps, RPA, Chatbots) | `apps/web/index.html` |
| 3 | Altura de sección `#producto` corregida proporcionalmente (600vh desktop / 520vh mobile) | `apps/web/index.html` |
| 4 | Footer actualizado: columna Servicios con los 5 reales, columna Empresa sin Tecnología | `apps/web/index.html` |
| 5 | Nueva sección `#sincon` — comparación Sin/Con Sustenta Futuro (entre diferenciadores y testimonios) | `apps/web/index.html` |
| 6 | Nueva sección `#faq` — 7 preguntas frecuentes en acordeón (entre Legal y Contacto) | `apps/web/index.html` |
| 7 | Tarjetas flotantes del hero movidas más cerca del título (left/right 14–15%) | `apps/web/index.html` |
| 8 | Fix modo claro: texto de tarjetas del globe forzado a blanco (estaban negro sobre negro) | `apps/web/index.html` |
| 9 | Fix resize: `ScrollTrigger.refresh()` con debounce 250ms — soluciona bug al expandir ventana desde pantalla dividida | `apps/web/index.html` |

## Problemas encontrados
- **Globe bug en pantalla dividida → expandir**: GSAP ScrollTrigger cachea alturas al cargar. Fix: debounced `ScrollTrigger.refresh()` en `window resize`. ✅ Resuelto
- **Texto invisible en modo claro (globe cards)**: `.srv-item` tiene fondo hardcodeado oscuro pero texto usa variables CSS que cambian en modo claro → texto negro sobre negro. Fix: override de colores en `[data-theme="light"]`. ✅ Resuelto
- **Altura de sección globe insuficiente**: Al agregar el 5° servicio, el timeline de GSAP se alarga proporcionalmente y la altura debe calcularse en consecuencia (no es parche, es matemática). ✅ Resuelto

## Dudas / pendientes para Héctor
- [ ] ¿Cuántos años lleva la empresa operando?
- [ ] ¿Cuántos proyectos han entregado hasta hoy?
- [ ] ¿La agroindustria es el rubro en el que más has trabajado? ¿La usamos como ejemplo en la landing o prefieres dejarlo genérico?
- [ ] ¿Tienes certificaciones relevantes? (UiPath, Microsoft, AWS, etc.)
- [ ] ¿Quieres crear redes sociales para la empresa? (LinkedIn, Instagram, etc.)
- [ ] Validar métricas del hero: ¿son reales los números 80% reducción de costos, 247+ documentos/día, <1% tasa de error?
- [ ] Entregar testimonios reales de clientes (nombre, empresa, texto) para reemplazar los placeholders actuales

## Estado de la landing page
| Sección | Estado |
|---|---|
| Hero | ✅ Completo (métricas pendientes validación) |
| Servicios / Globe | ✅ Completo — 5 servicios reales |
| Métricas | ✅ Completo (números pendientes validación) |
| Tecnología | ⏸ Oculta (decidir si se elimina o reemplaza) |
| Por qué elegirnos | ✅ Completo |
| Sin/Con | ✅ Completo |
| Testimonios | ❌ Pendiente — placeholders, esperar testimonios reales de Héctor |
| Proceso | ✅ Completo |
| Legal | ✅ Completo |
| FAQ | ✅ Completo |
| Contacto / Formulario | ✅ Completo |
| Footer | ✅ Completo |
| Quiénes somos | ❌ Pendiente — bloqueado esperando info de Héctor |

## Plan para la próxima semana
- [ ] Crear sección Quiénes somos cuando Héctor responda las preguntas pendientes
- [ ] Definir y crear schema de Supabase (`leads`, `lead_status_history`, `admin_profiles`)
- [ ] Iniciar backend FastAPI: endpoint `POST /leads`
- [ ] Conectar formulario de la landing al backend
