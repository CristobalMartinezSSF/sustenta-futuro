# Sesión: Gestión agéntica y estructura principal del modelo

| Campo | Valor |
|---|---|
| Fecha | 2026-04-09 |

## Objetivo
Diseñar e implementar la arquitectura agéntica base de Claude como orquestador de Sustenta Futuro.

## Lo que se hizo
- Diseñado el árbol agéntico: orquestador raíz → rama proyectos-clientes → rama gestión-interna
- Creado `docs/arquitectura-agentica.md` — documento vivo con árbol visual, tabla de agentes activos, agentes pendientes y convención de creación
- 7 agentes existentes generalizados (eliminadas referencias al "MVP mes 1", ahora sirven para cualquier proyecto)
- `CLAUDE.md §12` actualizado para apuntar a la arquitectura como fuente de verdad
- Definido que `rpa-automation` y `chatbot-builder` se crean cuando llegue el primer proyecto de ese tipo

## Problemas / Dudas
- Sin bloqueantes en esta sesión

## Pendientes
- [ ] Pregunta para Hector: ¿cómo llegan los proyectos de clientes? ¿solo por él o también por leads directos?
- [ ] Crear agente `rpa-automation` cuando llegue el primer proyecto RPA
- [ ] Crear agente `chatbot-builder` cuando llegue el primer proyecto de chatbot
- [ ] Definir más ramas de gestión interna según necesidad futura
