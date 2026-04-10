# Sesión: Landing page — mejoras visuales y sección tecnología

| Campo | Valor |
|---|---|
| Fecha | 2026-04-10 |

## Objetivo
Refinar la landing page: reemplazar los elementos vacíos del globe, corregir textos invisibles, renombrar CTAs y reemplazar la sección de servicios con la arquitectura multi-agente.

## Lo que se hizo
- **Globe section**: eliminadas las 3 tarjetas tooltip estáticas (Automatización 24/7 / Precisión máxima / ROI inmediato)
- **Servicios en el globe**: agregados 4 servicios (RPA, IA, Dev, TI) que aparecen uno a la vez con GSAP mientras el usuario scrollea y el globe gira; animación alternando derecha/izquierda
- **Tarjetas laterales**: rediseñadas para quedar pegadas al globe (`left/right: calc(50% ± 275px)`) en vez de en los bordes de pantalla; tamaño aumentado
- **CTA renombrado**: "Innovar Ahora" → "Conversemos" en los 4 lugares donde aparecía (nav, hero, botón layered)
- **Fix "Libera tu talento" invisible (modo oscuro)**: `background-clip: text` con `opacity: 0` en hijos `.word-reveal` causaba que el texto no se viera; reemplazado por `color: rgba(255,255,255,0.55)`
- **Fix "Libera tu talento" invisible (modo claro)**: texto blanco sobre fondo `#F8F8F6`; agregada regla `[data-theme="light"] .gradient-text { color: rgba(10,10,10,0.5) }`
- **Sección Servicios → Tecnología**: reemplazada la grilla de 4 exp-cards por una sección `#tecnologia` con 8 agentes (Sales B2B, PMO, DevOps, Finance, Legal, Marketing, Design, Support) + pills del stack tecnológico (Python, FastAPI, OpenAI/Gemini, Selenium, OCR, PostgreSQL, Docker, GitHub Actions, Streamlit, WhatsApp API)
- **Nav actualizado**: "Servicios" → "Tecnología", href `#servicios` → `#tecnologia`
- Todos los cambios desplegados vía push a main (GitHub Pages)

## Problemas / Dudas
- La landing page aún no está terminada (falta pulir más elementos según David)
- `background-clip: text` no es compatible con animaciones de opacidad en hijos — patrón a evitar en el futuro

## Pendientes
- [ ] Continuar refinando la landing page (elementos que se sienten dispersos o incompletos)
- [ ] Revisar responsividad de las tarjetas del globe en distintos tamaños de pantalla
- [ ] Iniciar backend FastAPI + schema Supabase (Semana 2 del roadmap)
- [ ] Revisar si la sección de diferenciadores también necesita ajustes visuales
