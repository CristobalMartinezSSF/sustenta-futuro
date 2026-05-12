# Documentación Landing Page — Sustenta Futuro SpA

> Última actualización: 2026-05-11
> URL actual: https://cristobalmartinezssf.github.io/sustenta-futuro/

---

## 1. Visión general

Landing page institucional de **Sustenta Futuro SpA**, empresa chilena de automatización y desarrollo de software a medida. El sitio está construido en **HTML/CSS/JS vanilla** (single-file por página), desplegado en **GitHub Pages**.

---

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | HTML5 + CSS3 + JavaScript vanilla |
| Backend | FastAPI (Python) en Render |
| Base de datos | Supabase (PostgreSQL) |
| Auth (admin) | Supabase Auth |
| Email | Resend |
| Hosting | GitHub Pages |
| Repositorio | github.com/CristobalMartinezSSF/sustenta-futuro |

---

## 3. Estructura de archivos

```
apps/web/
├── index.html              # Landing page principal
├── terminos.html           # Términos y condiciones
├── privacidad.html         # Política de privacidad
├── sitemap.xml             # SEO — mapa del sitio
├── robots.txt              # SEO — directivas para crawlers
├── logo-full.webp          # Logo con texto (WebP lossless, producción)
├── logo-full.png           # Logo con texto (PNG original)
├── logo.png / logo.jpg     # Logo isotipo alternativo
├── earth-mask.jpg          # Máscara para globo Three.js (legado)
├── fonts/
│   ├── 205TF-Indiana-Regular.otf
│   ├── 205TF-Indiana-Italic.otf
│   ├── 205TF-Indiana-Light.otf
│   └── 205TF-Indiana-LightItalic.otf
└── img/
    ├── diseño web.webp
    ├── desarrollo de software.webp
    ├── apps moviles.webp
    ├── automatizaciones.webp
    └── chatbots y landing.webp
```

---

## 4. Sistema de diseño

### 4.1 Paleta de colores (Pantone)

| Token CSS | Hex | Pantone | Uso |
|---|---|---|---|
| `--bg` | `#D4DEE5` | 7541 C | Fondo de página |
| `--text` | `#455A64` | 7545 C | Texto body |
| `--text-muted` | `rgba(69,90,100,0.6)` | — | Texto secundario |
| `--text-subtle` | `rgba(69,90,100,0.38)` | — | Placeholders, disclaimers |
| Brand blue | `#0093B2` | 3155 C | Acentos, íconos, CTA |
| Titles | `#617F8A` | 7543 C | Títulos de sección |
| Dark | `#2B3A42` | 7546 C | Navbar, texto oscuro |

### 4.2 Tipografía

| Fuente | Uso | Origen |
|---|---|---|
| Indiana (205TF) | Botones y links (display) | Archivo local `fonts/` |
| Montserrat | Navbar, cards proceso, labels | Google Fonts |
| Inter | Texto body general | Google Fonts |
| JetBrains Mono | Badges, código | Google Fonts |

### 4.3 Variables de glassmorphism (navbar)

```css
--glass-bg:     rgba(0,0,0,0.55)
--glass-border: #617F8A
blur:           18px saturate(1.2)
```

---

## 5. Páginas

### 5.1 `index.html` — Landing principal

#### Secciones en orden

| ID | Nombre visible | Descripción |
|---|---|---|
| `#navbar` | — | Barra de navegación fija con glassmorphism y logo |
| `#hero` | Hero | Split layout: texto alineado a la izquierda + animación de logo a la derecha, CTA "Conversemos" y "Servicios" debajo del texto, burbujas de métricas, canvas de partículas |
| `#nosotros` | Quiénes somos | Historia de la empresa, misión, foto del fundador |
| `#proceso` | Cómo trabajamos | Diagrama interactivo de 5 pasos con panel de detalle expandible |
| `#producto` | Servicios | Voyage slider (coverflow) con 5 tarjetas de servicio |
| `#sincon` | Antes / Después | Comparativa visual antes (sin Sustenta) vs después (con Sustenta) |
| `#testimonios` | Testimonios | Carrusel de 3 tarjetas con foto de persona + logo empresa |
| `#diferenciadores` | Por qué elegirnos | Grid de ventajas diferenciales |
| `#legal` | Cumplimiento | Normas legales y certificaciones relevantes |
| `#faq` | Preguntas frecuentes | Acordeón de preguntas y respuestas |
| `#contacto` | Cuéntanos sobre tu empresa | Formulario de contacto/lead |
| `footer` | — | Links, redes sociales, lema, logo |

#### Navbar

- Logo: `logo-full.webp` a 72px de alto con `margin-block: -18px` para no expandir la barra
- Links: Montserrat, `letter-spacing: 0.06em`, color `#2B3A42`
- CTA "Conversemos": botón shimmer con padding `0.6rem 1.6rem`, apunta a `#contacto`
- Fondo: `rgba(0,0,0,0.55)` con `blur(18px)`, borde inferior `#617F8A`
- Logo footer: 84px de alto

#### Hero

- **Layout:** Split horizontal — texto a la izquierda, animación de logo a la derecha
- **Texto:** Alineado a la izquierda (`text-align: left`), h1 en `white-space: nowrap`
- **h1 font-size:** `clamp(2.2rem, 3.2vw, 3.6rem)` — responsive entre 1080p y 2K
- **Animación de logo:** Componente SVG standalone (triángulo azul + barra verde colisionan), fondo transparente, tamaño `clamp(320px, 35vw, 680px)`, sin estrellas
- **Botones:** Debajo del texto del hero (dentro de `.hero-content`), no a la derecha
- **CTA "Conversemos":** `btn-shimmer` con fondo verde grisáceo `#5A7A6B`, texto blanco
- **CTA "Servicios":** `btn-secondary` con borde y fondo transparente
- Fondo: canvas `<canvas id="prism-canvas">` con red de partículas animadas
- Burbujas de métricas flotantes (`.hero-float-stat`): `zoom: 0.8`, 3 métricas (ahorro de tiempo, disponibilidad, personalización)
- **Padding:** `0 2% 0 6%` — margen izquierdo 6%, derecho 2%
- **Centrado vertical:** `align-items: center; justify-content: center`
- En mobile (<=768px): la animación se oculta, layout vuelve a columna centrada

#### Proceso (`#proceso`) — Diagrama interactivo

Componente portado de React/Framer Motion a vanilla JS/CSS.

**5 pasos:**
1. Diagnóstico — análisis de procesos, pain points, viabilidad
2. Diseño — arquitectura técnica, UX, SLA
3. Desarrollo — iterativo con feedback continuo
4. QA y Testing — unit tests, integración, rendimiento, seguridad
5. Deploy — entrega en producción, monitoreo 24/7

**Comportamiento:**
- Cada paso es un botón/card con número, ícono SVG animado y descripción corta
- Al hacer click, se expande un panel de detalle debajo con badges, descripción larga y lista de features
- Solo un paso activo a la vez
- Conectores animados (SVG dashed arrow) entre pasos
- Fuente Montserrat en todas las cards
- Todas las cards tienen la misma altura (`flex-direction: column` + `height: 100%`)

**Estructura CSS clave:**
```css
.pf-grid     { display: flex; align-items: stretch; }
.pf-step     { flex: 1; display: flex; flex-direction: column; }
.pf-card     { flex: 1; width: 100%; height: 100%; }
.pf-detail   { max-height: 0; opacity: 0; transition: max-height 400ms; }
.pf-detail.pf-open { max-height: 500px; opacity: 1; }
```

#### Producto / Servicios (`#producto`) — Voyage Slider

Carrusel coverflow con 5 servicios:
1. Diseño web
2. Desarrollo de software
3. Apps móviles
4. Automatizaciones
5. Chatbots y landing pages

Cada card: imagen WebP (`.img/`), ícono SVG, título, descripción.

#### Testimonios (`#testimonios`)

Carrusel de 3 testimonios. Estructura de cada tarjeta:
- Izquierda: foto de persona (`.tc-person-photo`, 77px, circular) + cita textual
- Abajo izquierda: nombre y rol
- Zona inferior: logo de empresa (`.tc-avatar`)

CSS clave:
```css
.tc-body        { display: flex; flex-direction: row; align-items: center; }
.tc-person-photo { order: -1; }  /* foto a la izquierda */
```

#### Stack Tecnológico (logo-stepper dentro de `#sincon`)

Logo stepper horizontal que muestra los logos de tecnologías usadas:
- Python, AWS, React, Node.js, OpenAI, Gemini, WhatsApp (inline SVG en `#0093B2`), Supabase

Los logos de OpenAI, Gemini y WhatsApp son SVG inline para evitar errores CORS.

#### Contacto (`#contacto`) — Formulario de leads

Campos: Nombre, Empresa, Email, Teléfono, Área de interés, Mensaje.
- Submit → FastAPI `POST /leads` en `https://sustenta-futuro-api.onrender.com`
- Botón "Enviar": clase `.form-submit`, border `1.5px solid rgba(43,58,66,0.25)`, hover fondo gris claro

---

### 5.2 `terminos.html` — Términos y condiciones

Misma navbar y footer que `index.html`. Contenido legal estándar.

**Navbar idéntica a index:**
- Logo `logo-full.webp` a 72px, `margin-block: -18px`
- Fondo glass `rgba(0,0,0,0.55)`
- Border `#617F8A`

**Incluye:** texture loader que consume el mismo API para aplicar texturas/colores consistentes con el index.

---

### 5.3 `privacidad.html` — Política de privacidad

Misma estructura que `terminos.html`. Referencia a Ley 19.628 de protección de datos personales de Chile.

---

## 6. Integraciones

### 6.1 Texture Loader

Script al final de cada página que consume:
```
GET https://sustenta-futuro-api.onrender.com/landing/textures
```

Aplica dinámicamente:
- Imagen de textura de fondo (overlay `position: absolute`)
- Colores de texto por sección via `<style>` inyectado con `!important`

**Secciones controladas:** navbar, hero, nosotros, proceso, producto, sincon, testimonios, diferenciadores, legal, faq, contacto.

**Nota importante:** el selector `text_color` para `#contacto` excluye `.form-submit` para no sobreescribir el color del botón de envío:
```js
text_color: '#contacto *:not(.form-submit)'
```

### 6.2 Backend FastAPI

URL: `https://sustenta-futuro-api.onrender.com`

Endpoints relevantes para el landing:
- `POST /leads` — recibe datos del formulario de contacto
- `GET /landing/textures` — devuelve configuración de texturas/colores

### 6.3 CMS inline (comment tags)

El contenido editable está marcado con tags especiales para el panel de administración:
```html
<!-- CMS:seccion-campo:START -->contenido<!-- CMS:seccion-campo:END -->
```

Esto permite al admin panel publicar cambios de texto sin tocar el código.

---

## 7. SEO

| Archivo | Contenido |
|---|---|
| `sitemap.xml` | 3 URLs: index, terminos, privacidad |
| `robots.txt` | `Allow: /` + referencia al sitemap |

**Pendiente:** actualizar URLs base cuando se asigne dominio propio (reemplazar `cristobalmartinezssf.github.io/sustenta-futuro/`).

---

## 8. Historial de tareas completadas

| # | Tarea | Descripción |
|---|---|---|
| 1 | Imágenes en Servicios | Se agregaron imágenes WebP reales a cada tarjeta del voyage slider |
| 2 | Stack Tecnológico | Se reemplazó la sección "Antes/Después" por un logo stepper de tecnologías |
| 3 | QA y Testing en Proceso | Se agregó el paso 4 "QA y Testing" al diagrama interactivo de proceso |
| 4 | Restructura de Testimonios | Foto de persona a la izquierda del texto, logo de empresa abajo |
| 5 | Footer clickeable | Se corrigieron los links del footer que no respondían |
| 6 | Imágenes a WebP | Todas las imágenes del sitio convertidas a WebP (logo con lossless para preservar transparencia) |
| 7 | sitemap.xml + robots.txt | Creados para SEO |
| 8 | Páginas legales | Creadas `terminos.html` y `privacidad.html` con navbar/footer idénticos al index |
| 9 | Lema footer | Actualizado el texto del lema en el pie de página |
| 10 | Hero split layout | Texto alineado a la izquierda, botones debajo del texto, animación de logo a la derecha |
| 11 | Animación de logo en hero | Integración del componente SVG animado (triángulo + barra colisionan) en el hero |
| 12 | Botones CTA verde grisáceo | Color de botones "Conversemos" (hero + navbar) cambiado de `#2DA52D` a `#5A7A6B` |
| 13 | Texto botones CTA blanco | Color de texto de ambos botones CTA (hero y navbar) unificado a `#fff` |
| 14 | Testimonios compactos | Reducción de tarjeta de testimonios: stage `clamp(180px, 20vw, 320px)`, padding y gap menores |
| 15 | Testimonios botones verde gris | Botones de navegación y dots del carrusel cambiados a tono verde grisáceo `#6B7F75` |
| 16 | Hero h1 single-line | h1 en una sola línea con `white-space: nowrap`, "Potencia tu operación." + "Libera tu talento." |
| 17 | Párrafo hero más ancho | `max-width` del párrafo del hero ampliado de `480px` a `720px` para reducir líneas visibles |
| 18 | Análisis responsive 1080p/2K | Ajuste de logo y h1 para que el hero se vea correcto en ambas resoluciones |

### Cambios de diseño y estilo adicionales

- Fuente **Montserrat** aplicada a navbar links, cards de proceso y botones del navbar
- **Indiana** (205TF) aplicada a todos los botones y links como fuente display
- Logo del navbar y footer cambiado a `logo-full.webp` (WebP lossless)
- Paleta Pantone unificada en todo el sitio
- `letter-spacing: 0.06em` en links del navbar
- Padding del CTA navbar aumentado a `0.6rem 1.6rem`
- Border visible en botón "Enviar" del formulario
- Partículas animadas restauradas en el hero (canvas `particle-net`)
- Diagrama de proceso portado desde componente React/v0.dev a vanilla JS
- Altura igual en todas las cards del diagrama de proceso

### Cambios 11-05-2026

**Hero — rediseño completo:**
- Layout cambiado de centrado a split horizontal (texto izquierda, animación derecha)
- h1 forzado a una línea con `white-space: nowrap`, font-size reducido a `clamp(2.2rem, 3.2vw, 3.6rem)`
- Párrafo `max-width` ampliado de 480px a 720px
- Botones movidos debajo del texto (no a la derecha)
- Animación de logo SVG integrada a la derecha del texto, fondo transparente, tamaño `clamp(320px, 35vw, 680px)` con `margin-right: 5%`
- Padding del hero: `0 2% 0 6%`
- Centrado vertical restaurado con `align-items: center; justify-content: center`
- En mobile: animación oculta, layout columna centrada

**Botones CTA:**
- Color de fondo shimmer: `#2DA52D` (verde puro) -> `#5A7A6B` (verde grisáceo)
- Active state: `#4A6A5B`
- Box-shadow actualizado a `rgba(90, 122, 107, ...)`
- Texto de ambos CTAs (hero `.btn-primary` y navbar `.nav-cta.btn-shimmer`) unificado a blanco `#fff`

**Testimonios:**
- Stage min-height reducido: `clamp(200px, 29.63vw, 480px)` -> `clamp(180px, 20vw, 320px)`
- Card padding: `1.4rem 2.8rem 2.4rem` -> `1.2rem 2rem 1.4rem`
- Card gap: `1.4rem` -> `1rem`
- Botones navegación y dots: color cambiado a verde grisáceo `#6B7F75`

**Análisis responsive 1080p vs 2K:**
- Todas las secciones verificadas con clamp/vw values
- Único problema detectado: hero (logo demasiado grande para 1080p) — corregido
- Resto de secciones usan caps que se alcanzan antes de 1920px, consistentes en ambas resoluciones

---

## 9. Notas técnicas importantes

### Scroll snap
```css
html { scroll-snap-type: y proximity; }
```
La sección `#contacto` tiene `scroll-snap-align: none` para que el footer sea visible.

### Zoom
`body { zoom: 1; }` y `#navbar { zoom: 1; }` — se mantiene en 1 (se usó 1.25x en experimentos, revertido).
Las burbujas del hero tienen `zoom: 0.8` propio.

### Particle net canvas
Canvas fullscreen en el hero con red de partículas conectadas. El script lo inicializa al cargar la página y se adapta al resize de ventana.

### Animación de logo en hero

Componente SVG inline integrado en el hero (lado derecho). Dos piezas del logo colisionan en el centro:
- **Triángulo azul** (`#009EE1`): entra desde abajo-izquierda con `logo-triangleFly`
- **Barra verde** (`#3AA933`): cae desde arriba-derecha con `logo-barFall`
- **Efectos de impacto:** 3 ondas expansivas (`.shockwave`), flash blanco, 20 partículas generadas por JS
- **Timing:** animaciones de 1.6s con `cubic-bezier(0.16, 1, 0.3, 1)`, impacto a 1.55s
- **Contenedor:** `.logo-scene` con fondo transparente, tamaño `clamp(320px, 35vw, 680px)`
- **Todas las clases CSS prefijadas** con `.logo-scene` y keyframes con `logo-` para evitar colisiones
- **Mobile:** `display: none` en <=768px
- **Script de partículas:** al final del `<body>`, genera 20 partículas con colores del logo

### Animación btn-layered
Botones con clase `btn-layered` tienen animación de círculo expandible al hover (`.lb-circle`, `.lb-label`, `.lb-hover`). El botón "Enviar" del formulario **no usa** esta clase para evitar conflictos con el texture loader.

### Texture loader y colores
El texture loader inyecta `<style>` tags con `!important`. Para sobreescribir colores de elementos específicos dentro de secciones afectadas, usar selectores `:not()` en `ELEMENT_SELECTORS` o agregar reglas CSS más tardías.

---

## 10. Pendientes / próxima fase

- Actualizar `sitemap.xml` y `robots.txt` con dominio propio cuando esté disponible
- Agregar meta tags Open Graph y Twitter Card para compartir en redes
- Optimizar imágenes con `loading="lazy"` en todas las `<img>`
- Implementar analytics (Google Analytics 4 o Plausible)
- Subir fotos reales de clientes y logos de empresa a los testimonios
- Subir foto real del fundador en la sección "Quiénes somos"
