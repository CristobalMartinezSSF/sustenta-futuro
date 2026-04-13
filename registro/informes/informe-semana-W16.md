# Informe Semanal — Semana W16
**13 al 19 de abril, 2026**

---

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

**Conclusiones:** Agregar sección Quiénes somos (bloqueada, esperar info de Héctor). Considerar certificaciones y lead magnet en fases posteriores.

### 11:00 – 13:00 — Investigación de videos
- 11:00–11:16 → https://www.youtube.com/watch?v=p6ynR1c5TPA (16 min, completo)
- 11:16–11:37 → https://www.youtube.com/watch?v=C4sTAnCPEiU (21 min, completo)
- 11:57–12:57 → https://www.youtube.com/watch?v=eABNL3igtVo (1h vista de 2:31:13 — **pendiente 1:31:13 para mañana**)

### 14:10 – 16:00 — Desarrollo landing page

| # | Cambio | Archivo |
|---|---|---|
| 1 | Badge del hero: eliminado "RPA & Inteligencia Artificial · Santiago, Chile" → "Sustenta Futuro" | `apps/web/index.html` |
| 2 | Título de página: "Sustenta Futuro — Automatización RPA e IA" → "Sustenta Futuro" | `apps/web/index.html` |
| 3 | Descripción del hero actualizada: cubre los 5 servicios reales, sin mención de RPA como etiqueta | `apps/web/index.html` |
| 4 | Globe servicio 4: "04 / RPA — Automatizaciones y RPA" → "04 / AUTO — Automatizaciones" | `apps/web/index.html` |
| 5 | Sección Legal: "procesos de RPA e IA" → "procesos de automatización e IA" | `apps/web/index.html` |
| 6 | Sección Tecnología ocultada (`display:none`) + link de nav eliminado | `apps/web/index.html` |
| 7 | Globe actualizado a 5 servicios reales (Web, Software, Apps, Automatizaciones, Chatbots) | `apps/web/index.html` |
| 8 | Altura de sección `#producto` corregida proporcionalmente (600vh desktop / 520vh mobile) | `apps/web/index.html` |
| 9 | Footer actualizado: columna Servicios con los 5 reales, columna Empresa sin Tecnología | `apps/web/index.html` |
| 10 | Nueva sección `#sincon` — comparación Sin/Con Sustenta Futuro | `apps/web/index.html` |
| 11 | Nueva sección `#faq` — 7 preguntas frecuentes en acordeón | `apps/web/index.html` |
| 12 | Tarjetas flotantes del hero movidas más cerca del título (left/right 14–15%) | `apps/web/index.html` |
| 13 | Fix modo claro: texto de tarjetas del globe forzado a blanco | `apps/web/index.html` |
| 14 | Fix resize: `ScrollTrigger.refresh()` con debounce 250ms | `apps/web/index.html` |

---

## Problemas encontrados y cómo se resolvieron (pivotes)

| Problema | Causa raíz | Solución |
|---|---|---|
| Globe bug al expandir ventana desde pantalla dividida | GSAP ScrollTrigger cachea alturas al cargar | `debounced ScrollTrigger.refresh()` en `window resize` |
| Texto invisible en modo claro (globe cards) | `.srv-item` tiene fondo hardcodeado oscuro; texto usa variables CSS que cambian en modo claro | Override de colores en `[data-theme="light"]` |
| Altura de sección globe insuficiente al agregar 5° servicio | El timeline GSAP se alarga con cada servicio; la altura debe calcularse proporcionalmente | Recálculo matemático de `600vh` desktop / `520vh` mobile |

---

## Preguntas para Héctor — Sección por sección

> Las preguntas están ordenadas por urgencia. 🔴 Bloquea desarrollo · 🟡 Mejora calidad · 🟢 Nice to have

### Hero
| # | Pregunta | Urgencia |
|---|---|---|
| H1 | ¿Apruebas la nueva descripción del hero?: *"Diseñamos y desarrollamos soluciones digitales a medida: sitios web, software, apps móviles, automatizaciones y chatbots con IA. Transformamos los procesos de tu empresa para que tu equipo se enfoque en lo que realmente importa."* | 🔴 |
| H2 | ¿Los números del hero son reales? 80% reducción de costos · 247+ documentos/día · <1% tasa de error | 🔴 |
| H3 | ¿Quieres que las tarjetas flotantes del hero muestren otros datos o están bien así? | 🟡 |

### Servicios (Globe)
| # | Pregunta | Urgencia |
|---|---|---|
| S1 | ¿Apruebas los 5 nombres finales?: Diseño y Desarrollo Web · Desarrollo de Software · Aplicaciones Móviles · Automatizaciones · Chatbots y Landing Pages | 🔴 |
| S2 | ¿La descripción breve de cada servicio en el globe es correcta o quieres ajustar alguna? | 🟡 |

### Quiénes somos
| # | Pregunta | Urgencia |
|---|---|---|
| Q1 | ¿Cuántos años lleva la empresa operando? | 🔴 |
| Q2 | ¿Cuántos proyectos han entregado hasta hoy? | 🔴 |
| Q3 | ¿Quieres incluir tu foto o imagen del equipo? | 🔴 |
| Q4 | ¿Cuál es el texto o historia de la empresa que quieres contar? (misión, origen, valores) | 🔴 |
| Q5 | ¿Tienes certificaciones relevantes? (UiPath, Microsoft, AWS, Google, etc.) | 🟡 |

### Métricas
| # | Pregunta | Urgencia |
|---|---|---|
| M1 | ¿Confirmas los 3 números del bloque de métricas o los cambiamos? (80%, 247+, <1%) | 🔴 |
| M2 | ¿Tienes algún número adicional que quieras destacar? (ej: años de experiencia, clientes atendidos) | 🟡 |

### Por qué elegirnos
| # | Pregunta | Urgencia |
|---|---|---|
| E1 | ¿La agroindustria es el rubro en que más has trabajado? ¿La usamos como ejemplo o lo dejamos genérico? | 🟡 |
| E2 | ¿Los 4 diferenciadores actuales reflejan tu propuesta de valor o quieres cambiar alguno? | 🟡 |

### Sin/Con
| # | Pregunta | Urgencia |
|---|---|---|
| SC1 | ¿Apruebas los puntos de la columna "Sin Sustenta Futuro" vs "Con Sustenta Futuro"? | 🟡 |

### Testimonios
| # | Pregunta | Urgencia |
|---|---|---|
| T1 | ¿Tienes clientes que puedan dar testimonios reales? (nombre, empresa, texto breve) | 🔴 |
| T2 | ¿Tienes casos de éxito documentados con cifras concretas? | 🟡 |

### Proceso de trabajo
| # | Pregunta | Urgencia |
|---|---|---|
| P1 | ¿Las 4 etapas del proceso (Diagnóstico → Diseño → Implementación → Optimización) son correctas? | 🟡 |
| P2 | ¿Quieres agregar tiempos estimados por etapa? | 🟢 |

### FAQ
| # | Pregunta | Urgencia |
|---|---|---|
| F1 | ¿Las 7 preguntas frecuentes reflejan lo que tus clientes realmente preguntan? | 🟡 |
| F2 | ¿Quieres agregar o quitar alguna? | 🟡 |

### Contacto / Formulario
| # | Pregunta | Urgencia |
|---|---|---|
| C1 | ¿El formulario debe quedar en la landing o prefieres redirigir a WhatsApp/email directo? | 🔴 |
| C2 | ¿A qué email deben llegar los leads que completen el formulario? | 🔴 |
| C3 | ¿Quieres mostrar tu número de teléfono o solo el formulario? | 🟡 |

### Redes sociales / Footer
| # | Pregunta | Urgencia |
|---|---|---|
| R1 | ¿Tienes o quieres crear redes sociales para la empresa? (LinkedIn, Instagram, etc.) | 🟡 |
| R2 | ¿El texto del footer está bien o quieres ajustar algo? | 🟢 |

---

## Estado actual de la landing

| Sección | Estado |
|---|---|
| Hero | ✅ Completo (métricas pendientes validación H2) |
| Servicios / Globe | ✅ Completo — 5 servicios aprobados por Héctor |
| Métricas | ⚠️ Pendiente validación números reales (M1) |
| Tecnología | ⏸ Oculta — pendiente decisión definitiva |
| Por qué elegirnos | ✅ Completo |
| Sin/Con | ✅ Completo |
| Testimonios | ❌ Pendiente — placeholders, esperar testimonios reales (T1) |
| Proceso | ✅ Completo |
| Legal | ✅ Completo |
| FAQ | ✅ Completo |
| Contacto / Formulario | ✅ Frontend listo — email destino pendiente (C2) |
| Footer | ✅ Completo |
| Quiénes somos | ❌ Pendiente — bloqueado (Q1–Q4) |

---

## Plan próxima semana

- [ ] Terminar video 3 (desde 1:00:00, quedan 1:31:13) — https://www.youtube.com/watch?v=eABNL3igtVo
- [ ] Respuestas de Héctor → implementar cambios en landing
- [ ] Definir schema Supabase (`leads`, `lead_status_history`, `admin_profiles`)
- [ ] Iniciar backend FastAPI: endpoint `POST /leads`
- [ ] Conectar formulario de la landing al backend
