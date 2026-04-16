# Informe Técnico — Infraestructura, Upgrades y Roadmap
**Sustenta Futuro SpA**
**Fecha:** 16 de abril, 2026
**Elaborado por:** Cristobal Martínez

---

## Resumen ejecutivo

Este informe detalla el estado actual de la infraestructura tecnológica de Sustenta Futuro, compara las opciones de hosting disponibles para garantizar disponibilidad 24/7, y proyecta las mejoras de mayor impacto para los próximos meses.

El objetivo es que Héctor tenga visibilidad completa del stack, los costos reales y las decisiones técnicas que vienen.

---

## 1. Estado actual de la infraestructura

### Arquitectura en producción hoy

```
[Usuario público]
      │
      ▼
Landing Page (apps/web)
  • Tecnología: HTML + Tailwind CSS estático
  • Hosting: GitHub Pages — GRATUITO
  • Deploy: automático al hacer push a main (GitHub Actions)
  • URL: nuqtaflaiker.github.io/sustenta-futuro-web
      │
      ▼
Formulario de contacto ─────────────────────────────────────────────────►
      │                                                               Supabase
      │                                                            (base de datos)
[Admin interno]                                                          │
      │                                                                  │
      ▼                                                                  │
Panel Admin (apps/admin)                                                 │
  • Tecnología: Next.js + Tailwind                                       │
  • Hosting: Vercel — GRATUITO (Hobby plan)                              │
  • Deploy: automático al hacer push a main                              │
  • URL: admin-taupe-nu.vercel.app  ◄──────────────────────────────────┘
```

### Componente pendiente de desplegar

```
Backend API (services/api)
  • Tecnología: Python + FastAPI
  • Estado: código listo, SIN servidor en producción
  • Bloqueador actual: necesita un servidor permanente
```

### Base de datos (Supabase)

- **Plan:** Free tier
- **Almacenamiento:** 500 MB incluidos
- **Límite de solicitudes:** 50,000 por mes (Free) → 2,000,000 (Pro)
- **Backups automáticos:** solo en plan Pro ($25/mes)
- **Estado actual:** suficiente para MVP

---

## 2. El problema: FastAPI necesita un servidor 24/7

A diferencia de la landing (archivos estáticos) o del panel admin (Vercel Edge), **FastAPI es un proceso de Python que debe estar corriendo permanentemente**.

Esto significa que necesitamos un servidor que:
1. Mantenga el proceso activo las 24 horas
2. Escale ante picos de tráfico
3. Reinicie automáticamente si falla
4. Permita actualizar el código sin downtime

---

## 3. Comparativa de opciones de hosting para FastAPI

### Opción A — Railway ⭐ (recomendada para ahora)

| Atributo | Detalle |
|---|---|
| **Costo** | Free: $5 crédito/mes · Pro: desde $5/mes por uso real |
| **Dificultad de setup** | Muy baja — conecta GitHub y listo |
| **Tiempo estimado de deploy** | 15–30 minutos |
| **24/7** | ✅ Sí, siempre activo |
| **Auto-deploy desde GitHub** | ✅ Sí |
| **Variables de entorno** | ✅ Panel visual fácil |
| **Logs en tiempo real** | ✅ Sí |
| **Soporte Docker** | ✅ Opcional |
| **Escalamiento** | Manual por ahora, automático en planes superiores |
| **Limitaciones** | Free tier tiene límite de crédito mensual (~500 horas de cómputo) |

**Veredicto:** la opción más rápida y simple para el MVP. Sin configuración de servidor.

---

### Opción B — Fly.io

| Atributo | Detalle |
|---|---|
| **Costo** | Free tier generoso (3 VMs compartidas) · desde $1.94/mes por VM dedicada |
| **Dificultad de setup** | Media — requiere instalar CLI `flyctl` y escribir `fly.toml` |
| **Tiempo estimado de deploy** | 45–90 minutos (primera vez) |
| **24/7** | ✅ Sí, siempre activo |
| **Auto-deploy desde GitHub** | ✅ Vía GitHub Actions |
| **Variables de entorno** | ✅ Via CLI o dashboard |
| **Logs en tiempo real** | ✅ Sí |
| **Soporte Docker** | ✅ Requerido (usa contenedores) |
| **Escalamiento** | Automático con configuración — múltiples regiones |
| **Limitaciones** | Curva de aprendizaje inicial más alta que Railway |

**Diferencia clave con Railway:** Fly.io corre contenedores Docker con más control sobre la infraestructura. Railway abstrae todo eso. Para el estado actual del proyecto, Fly.io es overkill — su ventaja real aparece cuando necesitamos múltiples regiones o despliegues más complejos.

**Veredicto:** más potente y flexible, pero requiere más tiempo de setup. Recomendable para el mes 3–4 cuando escalemos.

---

### Opción C — Render

| Atributo | Detalle |
|---|---|
| **Costo** | Free tier disponible (con limitación crítica) · desde $7/mes |
| **Dificultad de setup** | Baja |
| **24/7** | ⚠️ Free tier se **duerme** después de 15 min de inactividad (cold start ~30 seg) |
| **Auto-deploy desde GitHub** | ✅ Sí |
| **Limitaciones** | El free tier NO es apto para producción por el cold start |

**Veredicto:** descartado para producción en free tier. A $7/mes es válido pero Railway es más conveniente.

---

### Opción D — VPS (DigitalOcean / Hetzner)

| Atributo | Detalle |
|---|---|
| **Costo** | Hetzner: desde €3.29/mes · DigitalOcean: desde $6/mes |
| **Dificultad de setup** | Alta — requiere configurar servidor, nginx, SSL, systemd, etc. |
| **24/7** | ✅ Control total |
| **Escalamiento** | Manual |
| **Limitaciones** | Requiere administración del servidor (actualizaciones, seguridad) |

**Veredicto:** la opción más barata a largo plazo y con más control. Recomendable cuando tengamos carga predecible y tiempo para administrar. Horizonte: mes 6+.

---

### Resumen comparativo

| | Railway | Fly.io | Render | VPS |
|---|---|---|---|---|
| **Costo mínimo real** | ~$5/mes | ~$2/mes | $7/mes | ~$4/mes |
| **Velocidad de deploy** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐ |
| **24/7 sin cold start** | ✅ | ✅ | ❌ free / ✅ paid | ✅ |
| **Mantenimiento requerido** | Mínimo | Bajo | Mínimo | Alto |
| **Escala horizontal** | Limitado | ✅ | ✅ | Manual |
| **Recomendado para** | Ahora (MVP) | Mes 3–4 | — | Mes 6+ |

---

## 4. Mejoras identificadas — roadmap técnico

### Corto plazo (mes 2 — mayo 2026)

| # | Mejora | Impacto | Por qué importa |
|---|---|---|---|
| 1 | **Desplegar FastAPI en Railway** | 🔴 Crítico | La anon key de Supabase está expuesta en el HTML público. FastAPI oculta las credenciales. |
| 2 | **Configurar Resend + flujos n8n** | 🔴 Crítico | Sin esto no hay notificaciones de nuevos leads. El equipo no se entera en tiempo real. |
| 3 | **CORS restringido en FastAPI** | 🟡 Importante | Hoy permite cualquier origen. Debe limitarse a los dominios reales de producción. |
| 4 | **Sección "Quiénes somos"** | 🟡 Importante | Bloqueada esperando contenido de Héctor. Las páginas con equipo visible generan más confianza. |
| 5 | **Testimonios reales** | 🟡 Importante | Bloqueada esperando Héctor. Factor de conversión alto. |

### Mediano plazo (mes 3–4 — junio/julio 2026)

| # | Mejora | Impacto | Por qué importa |
|---|---|---|---|
| 6 | **Migrar a Fly.io** | Infraestructura | Más control, múltiples regiones, mejor para escalar. |
| 7 | **Tests Playwright end-to-end** | Calidad | Valida el flujo completo lead → admin sin intervención manual. |
| 8 | **Supabase Pro** | Confiabilidad | Backups automáticos, más solicitudes, soporte prioritario. ($25/mes) |
| 9 | **Dominio propio** | Profesionalismo | Pasar de `admin-taupe-nu.vercel.app` a `admin.sustentafuturo.cl`. |
| 10 | **Alertas de sistema** | Operación | Notificación automática si el API cae o hay errores críticos. |

### Largo plazo (mes 5–6 — agosto 2026+)

| # | Mejora | Impacto | Por qué importa |
|---|---|---|---|
| 11 | **VPS propio** | Costo/control | A partir de cierto volumen, el VPS es más barato que Railway/Fly. |
| 12 | **Dashboard de métricas** | Negocio | KPIs reales: tasa de conversión, tiempo promedio por fase, leads por canal. |
| 13 | **Chatbot en landing** | Captación | Widget de chat inteligente (investigación Onyx realizada en sesión anterior). |
| 14 | **Portal de clientes** | Entrega | Los clientes ven el avance de su proyecto sin depender de WhatsApp. |

---

## 5. Arquitectura objetivo — mes 3

```
[Usuario público]
      │
      ▼
Landing Page                    (GitHub Pages — gratis)
      │
      ▼
FastAPI Backend                 (Railway o Fly.io — ~$5/mes)
  • Recibe formularios
  • Valida con Pydantic
  • Guarda en Supabase
  • Dispara n8n webhook
      │
      ├─────────────────────────────────►  Supabase Postgres
      │                                    (base de datos — $25/mes Pro)
      │
      ▼
n8n (local o Railway)           (flujos de automatización)
  • Email de confirmación al lead (Resend)
  • Notificación interna al equipo (Resend)
  • Alerta si deal lleva +7 días sin mover

[Admin interno]
      │
      ▼
Panel Admin                     (Vercel — gratis hasta cierta escala)
  • Login Supabase Auth
  • Pipeline de proyectos
  • Notas y gestión de usuarios
```

**Costo mensual estimado (mes 3):** ~$30–35 USD/mes
- Railway FastAPI: ~$5
- Supabase Pro: $25
- Dominio .cl: ~$3 amortizado
- Resend: gratis hasta 3,000 emails/mes

---

## 6. Recomendación inmediata

**Para esta semana:** desplegar FastAPI en Railway y configurar los primeros 2 flujos de n8n con Resend. Esto cierra los 2 pendientes críticos del MVP y deja el sistema completamente operativo.

**Tiempo estimado:** 2–3 horas de trabajo técnico.

---

*Documento generado el 16 de abril de 2026. Costos en USD, sujetos a cambio según planes de cada proveedor.*
