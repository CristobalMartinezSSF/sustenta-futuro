# Informe de Trabajo — 16 de Abril 2026

| Campo | Valor |
|---|---|
| Fecha | 2026-04-16 |
| Responsable | Cristobal |
| Jornada | 09:00 – 18:00 (colación 13:00 – 14:00) |

---

## Resumen ejecutivo

Jornada completa de desarrollo y planificación técnica. Se realizó un diagnóstico integral del estado del proyecto, se analizaron opciones de hosting para FastAPI, se documentó el roadmap técnico, y se construyó e implementó el sistema CMS completo para gestión de contenido de la landing page desde el admin panel. El día cerró con correcciones de bugs del CMS, resolución de conflictos git, y revisión del feedback W16 de Héctor.

---

## Registro por bloques horarios

### 09:00 – 09:45 | Revisión del estado del proyecto

Diagnóstico completo de todos los componentes del sistema al inicio de la jornada:

| Componente | Estado |
|---|---|
| Landing page (GitHub Pages) | ✅ Desplegada y funcionando |
| Panel admin (Vercel) | ✅ Desplegado, auto-deploy desde GitHub |
| Base de datos (Supabase) | ✅ Activa, 3 migraciones aplicadas |
| Backend FastAPI | ⚠️ Código listo, sin servidor en producción |
| n8n automatización | ⚠️ Instalado local, sin flujos configurados |
| Emails (Resend) | ❌ Pendiente |

**Pendientes críticos identificados:**
1. Anon key expuesta en HTML público — el formulario llama directo a Supabase.
2. Emails sin configurar — sin notificaciones de leads ni confirmaciones al contacto.

---

### 09:45 – 10:45 | Análisis de infraestructura — hosting 24/7 para FastAPI

Se evaluaron 4 opciones de hosting permanente para el backend FastAPI:

| Plataforma | Costo | 24/7 real | Setup | Veredicto |
|---|---|---|---|---|
| **Railway** | ~$5/mes | ✅ | Muy fácil | ⭐ Recomendado ahora |
| **Fly.io** | ~$2/mes | ✅ | Medio (Docker + CLI) | Mejor en mes 3–4 |
| **Render** | $7/mes | ⚠️ Free se duerme | Fácil | Descartado en free tier |
| **VPS (Hetzner)** | ~$4/mes | ✅ | Alto (manual) | Mes 6+ |

**Diferencia clave Railway vs. Fly.io:**
- Railway abstrae toda la infraestructura — conecta al repo de GitHub, detecta Python automáticamente, despliega en minutos. Sin Docker ni config de servidor.
- Fly.io da más control con contenedores Docker y soporte multi-región. Su ventaja aparece cuando el sistema necesite escalar horizontalmente.

**Decisión:** Railway para el MVP. Migrar a Fly.io cuando el volumen lo justifique.

---

### 10:45 – 11:15 | Roadmap técnico y estimación de costos

Se documentó el roadmap técnico en tres horizontes:

**Corto plazo — mayo 2026:**
- Desplegar FastAPI en Railway
- Configurar Resend + flujos n8n (nuevo lead + confirmación al contacto)
- Restringir CORS en FastAPI a dominios reales

**Mediano plazo — junio–julio 2026:**
- Migrar a Fly.io
- Tests Playwright end-to-end
- Supabase Pro + dominio `admin.sustentafuturo.cl`

**Largo plazo — agosto 2026+:**
- VPS propio, dashboard de métricas, chatbot en landing, portal de clientes

**Costo mensual estimado al mes 3:**

| Servicio | Costo |
|---|---|
| Railway (FastAPI) | ~$5 USD |
| Supabase Pro | $25 USD |
| Dominio .cl | ~$3 USD amortizado |
| Resend | Gratis hasta 3.000 emails/mes |
| **Total estimado** | **~$33 USD/mes** |

---

### 11:15 – 12:00 | Análisis de Supabase — cuándo upgradear

Se analizó el estado actual del free tier y se identificaron los 3 triggers de upgrade a Pro ($25/mes):

| # | Trigger | Razón |
|---|---|---|
| 1 | Panel admin en uso diario de producción | Free tier pausa el proyecto a los 7 días sin actividad |
| 2 | Storage supera ~800 MB | Fotos de testimonios y adjuntos acumulan espacio rápido |
| 3 | Más de ~50 leads activos en el sistema | Sin backups automáticos, un error de datos es irrecuperable |

**Recomendación:** Free tier suficiente ahora. Evaluar Pro en mes 3–4 cuando haya clientes reales en el sistema.

Documento generado: `registro/informes/informe-infraestructura-upgrades.md`

---

### 12:00 – 13:00 | Cambios de contenido en landing page — Feedback W16 de Héctor

Se aplicaron todos los cambios de contenido indicados por Héctor en su respuesta W16:

- **Hero:** texto aprobado ("En Sustenta Futuro transformamos la complejidad tecnológica…")
- **Métricas:** 80% ahorro de tiempo / 24/7 disponibilidad / 100% personalización
- **Servicios:** 5 descripciones elevadas al nuevo tono (Globe interactivo)
- **Quiénes somos:** historia de origen en la agroindustria, posicionamiento boutique, placeholder foto fundador
- **Testimonios:** 3 placeholders con textos reales de casos de éxito (Agro Uvas, Agro Nueces, Plantas procesamiento)
- **FAQ:** respuestas 1 y 2 actualizadas con modelo 50/50, sin mención a piloto gratuito
- **Diferenciadores:** "Piloto gratuito" eliminado → reemplazado por "Evaluación y Arquitectura a Medida"
- **Global:** eliminada toda mención a la palabra "piloto" en el código

Commit y push realizados a rama `main`.

---

### 13:00 – 14:00 | Colación

---

### 14:00 – 15:30 | Desarrollo del CMS — "Configuración de la página" en admin panel

Se construyó el sistema completo de edición de contenido para la landing:

**Archivos creados:**
- `apps/admin/app/configuracion/page.tsx` — página de edición con 4 secciones: Hero, Métricas (solo labels), Quiénes somos, Testimonios. Incluye subida de imagen del fundador a Supabase Storage y publicación con timestamp.
- `apps/admin/app/api/publish/route.ts` — handler POST que lee la `landing_config` desde Supabase (service role), descarga `index.html` desde GitHub API, aplica reemplazos CMS vía regex sobre marcadores `<!-- CMS:key:START -->…<!-- CMS:key:END -->`, y hace commit del HTML actualizado de vuelta a GitHub main.

**Migración aplicada:** `infra/supabase/migrations/004_landing_config.sql` — tabla `landing_config` con RLS (solo admins), trigger `updated_at`, y seed con todos los valores iniciales.

**Bucket creado:** `landing-images` en Supabase Storage para la foto del fundador.

**Variables de entorno añadidas en Vercel:** `SUPABASE_SERVICE_ROLE_KEY` y `GITHUB_TOKEN`.

---

### 15:30 – 16:30 | Corrección de bugs del CMS

Al probar la publicación, se detectaron y corrigieron 3 bugs en `route.ts`:

| Bug | Causa | Fix |
|---|---|---|
| Texto plano reemplazaba etiquetas HTML | `applyCms` recibía texto sin envolver | Función `wrapValue()` que envuelve cada key en su HTML correcto (`<p>`, `<strong>`, `<span>`, etc.) |
| Foto vacía borraba el SVG placeholder | `applyCms("")` reemplazaba el SVG por vacío | Skip de `founder_photo_url` cuando `value` está vacío |
| Números de métricas rompían la animación JS | `data-target="80"` reemplazado por "80%" | `continue` en route.ts para keys `_num`; marcadores eliminados del HTML |

**Conflicto git resuelto:** el CMS había commiteado la versión rota al remote. Se hizo rebase, se resolvió el conflicto a favor de la versión corregida, y se pusheó exitosamente.

---

### 16:30 – 17:00 | Corrección del admin panel — métricas no editables

Se eliminaron los campos "Métrica X — número" del panel de Configuración. Los números (80%, 24/7, 100%) son hardcodeados con animación JS (`data-target`) y no son editables vía CMS. Solo quedan los campos de descripción (labels) para cada métrica.

Archivo modificado: `apps/admin/app/configuracion/page.tsx`
Commit y push realizados.

---

### 17:00 – 18:00 | Revisión del feedback W16 de Héctor — consulta foto fundador

Se leyó el PDF completo "Respuesta a Informes W16 y Feedback de Mejora Continua". Respuesta a la consulta sobre el tipo de foto:

> "Incluiremos una foto mía como Fundador/Arquitecto de Soluciones. En un modelo boutique, la confianza recae en el líder del proyecto. Si aún no te envío la foto ideal, deja un espacio o usa una imagen abstracta de alta calidad (código o arquitectura cloud) temporalmente. ¡Cero fotos de equipos falsos!"

**Estado:** landing usa SVG placeholder abstracto — correcto según instrucción. Foto real se subirá desde el admin panel cuando Héctor la envíe.

---

## Estado al cierre del día

### ✅ Completado
- Diagnóstico completo del estado del sistema
- Análisis comparativo de hosting 24/7 para FastAPI (Railway seleccionado)
- Roadmap técnico documentado (corto, mediano y largo plazo)
- Estimación de costos mensuales al mes 3 (~$33 USD)
- Análisis de triggers de upgrade a Supabase Pro
- Cambios de contenido de landing page según feedback W16 de Héctor
- CMS completo: panel de edición + API de publicación a GitHub
- Migración 004 aplicada en Supabase + bucket `landing-images` creado
- Corrección de 3 bugs críticos del CMS (wrapValue, foto vacía, metric_num)
- Eliminación de campos no editables de métricas en admin panel
- Revisión completa del feedback W16

### 🔴 Pendiente crítico
- Desplegar FastAPI en Railway (anon key aún expuesta en formulario de landing)
- Deshabilitar el formulario de la landing hasta que FastAPI esté en producción (instrucción directa de Héctor)
- Configurar Resend + flujos n8n

### 🟡 Próximos pasos
- Ejecutar deploy de FastAPI en Railway
- Deshabilitar formulario de contacto temporalmente en landing
- Configurar flujos 1 y 2 en n8n (nuevo lead + confirmación al contacto)
- Foto del fundador: pendiente que Héctor la envíe → subir desde admin panel
- Mejoras visuales pendientes del feedback: imágenes en "Cómo trabajamos" y sección "Servicios"
