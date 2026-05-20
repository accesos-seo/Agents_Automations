# Organic Early Warning (V2) + Data Hub

> **Antes de tocar nada en este módulo:** leé `CONVENTIONS.md` en el root de este repo (también disponible localmente en `C:\Users\ceoel\.claude\conventions\agentic-automations.md` si trabajás en la máquina de SeoLab). Son las convenciones canónicas de la agencia que este proyecto sigue al pie de la letra.

Sistema agéntico que detecta **antes de que el tráfico caiga** problemas SEO en las marcas que monitoreamos, vía 13 señales independientes (adelantadas + rezagadas) sobre datos centralizados de GSC, GA4, Ahrefs, CrUX/PSI y crawls.

Es la V2 de `seo-sentinel-position-watch` (V1). V1 era reactivo (clicks WoW). V2 es proactivo (Early Warning = avisa con semanas de antelación).

## Doble entregable en este módulo

Este módulo construye **dos sistemas coordinados**:

### 1. **`seo_data_hub`** — Capa de ingesta centralizada ("bronze layer")

Ingiere semanalmente (GSC, GA4, CrUX) y mensualmente (Ahrefs) los datos crudos. Los almacena en tablas raw en el schema `seo_data_hub`. **No hace lógica de negocio — solo persiste**.

Beneficio: cualquier automatización futura (V2, V3, Lighthouse, otros) consume del hub en vez de pegar a las APIs. Elimina llamadas duplicadas, garantiza consistencia entre sistemas y abarata el coste de Ahrefs.

Vive en: `00-data-hub/`

### 2. **`organic_early_warning`** — Sistema de detección multi-señal

Consume del hub semanalmente (Martes 08:00 CO, después de que el hub termine su corrida del Lunes). Por cada brand, evalúa las 13 señales contra una baseline estadística auto-calibrada (MAD + decay + auto-calibración por varianza). Agrupa eventos relacionados en *incidents* y dispatcha al canal `#alerts-operaciones` (`C0B1B3V4ZB5`) + DM al especialista responsable.

Vive en: `01-organic-early-warning/`

## Catálogo de señales

13 señales pluggable en la tabla `signal_definitions`. Cada una tiene `kind`, `weight`, `cadence` y se puede habilitar/deshabilitar sin tocar código.

| ID | Tipo | Qué detecta |
|---|---|---|
| **S1** | leading | URL antes indexada ahora "Crawled - currently not indexed" |
| **S2** | leading | Pico de errores 404/5xx/soft-404 |
| **S3** | leading | Cambios técnicos (noindex, canonical, robots.txt) detectados vía crawl diff |
| **S4** | leading | Enlaces internos rotos / páginas huérfanas |
| **S5** | leading | Regresión Core Web Vitals (LCP/INP/CLS) |
| **S6** | leading | Caída de referring domains |
| **S7** | leading | Pico de enlaces tóxicos |
| **S8** | mixed | CTR muy por debajo del esperado para esa posición |
| **S9** | mixed | Pérdida de feature SERP / AI Overview (impresiones estables + posición ~1 + CTR colapsa) |
| **S10** | mixed | Competidor nuevo aparece en el top |
| **S11** | lagging | Caída de clicks/posición fuera de banda estadística |
| **S12** | lagging | Caída de conversiones orgánicas (GA4) |
| **S13** | lagging | Divergencia GSC ↔ GA4 → indica tracking roto, no SEO |

Severidad en 3 niveles: **WATCH** (señal adelantada sola → digest semanal), **YELLOW** (adelantada + rezagada confirmando), **RED** (rezagada hard o ≥3 señales correlacionadas).

## Quick start (para la IA ejecutora)

1. Leer convenciones: `C:\Users\ceoel\.claude\conventions\agentic-automations.md`
2. Leer este README + `ARCHITECTURE.md`
3. Seguir `handoff/04-task-list-tecnico.md` (es el plan paso a paso)
4. Construir Fase 0 (data hub) ANTES de Fase A (oew), porque oew consume del hub

## Estructura del proyecto

```
organic-early-warning/
├── README.md                           ← este archivo
├── ARCHITECTURE.md                     ← diseño completo con diagramas
├── SECRETS.md                          ← qué cargar en Supabase Vault
├── .env.example                        ← vars locales para deploy
├── deploy.py                           ← deploya las 12 edge functions
├── 00-data-hub/                        ← FASE 0: ingesta centralizada
│   ├── README.md
│   ├── 01-migrations/                  ← 4 migraciones SQL del hub
│   └── 02-edge-functions/              ← _shared + 5 ingestors
├── 01-organic-early-warning/           ← FASES A-D: sistema V2
│   ├── 01-migrations/                  ← 5 migraciones SQL del oew
│   └── 02-edge-functions/              ← _shared + 7 edge functions
├── handoff/                            ← DOCS para la IA ejecutora
│   ├── 00-data-flow.md
│   ├── 01-edge-functions-contracts.md
│   ├── 02-validation-checklist.md
│   ├── 03-runbook.md
│   ├── 04-task-list-tecnico.md         ← ¡EMPIEZA POR ACÁ!
│   └── 05-backtesting-guide.md
└── scripts/
    ├── seed_brands_registry.sql
    └── backtest_runner.py
```

## Diferencias vs V1

| Aspecto | V1 (`seo-sentinel-position-watch`) | V2 (`organic-early-warning`) |
|---|---|---|
| Cadencia | Diaria 08:00 CO | Semanal Martes 08:00 CO + digest Viernes 18:00 |
| Fuentes | GSC + GA4 (directo) | GSC + GA4 + CrUX/PSI + Ahrefs + crawl, vía hub |
| Detección | Clicks WoW al 20% umbral fijo | 13 señales con motor estadístico MAD + decay |
| Anomalías | 2 tablas (`clicks_anomalies`, `position_anomalies`) | 1 tabla unificada `signal_events` + `signal_definitions` pluggable |
| Severidad | RED/YELLOW (basado en %drop) | WATCH/YELLOW/RED (basado en correlación leading + lagging) |
| LLM | Sí (cluster + summary) | Sí (mismo patrón, prompt extendido) |
| Slack | Canal + DM especialista | Mismo modelo |
| Outbox | `public.notifications_outbox` con `source='seo_sentinel_alert'` | Misma tabla con `source='oew_alert'` |
| Bot | Orbit SeoLab (`D0A4NMACLPP`) | Mismo bot |
| Schema | `seo_sentinel` | `organic_early_warning` + `seo_data_hub` |

V1 y V2 **no se cruzan**. V1 sigue corriendo en su schema. Cuando V2 esté estable, se apaga el cron de V1 (UPDATE `cron.job` SET active=false).

## Estado

- [ ] Conventions doc cargado en `~/.claude/conventions/`
- [ ] Carpeta scaffold creada
- [ ] Docs handoff escritas (este PR contiene solo handoff, NO el código)
- [ ] PR draft abierto
- [ ] **Pendiente para la IA ejecutora:** construir migraciones SQL + 12 edge functions + deploy + validación E2E

## Project Supabase

| Item | Valor |
|---|---|
| Project | Light_House |
| Ref | `stjugsrkrweakvzmizpq` |
| URL | `https://stjugsrkrweakvzmizpq.supabase.co` |
| Functions URL | `https://stjugsrkrweakvzmizpq.functions.supabase.co` |
| Schemas a crear | `seo_data_hub`, `organic_early_warning` |
| Schema compartido | `public.notifications_outbox` (reusa el existente) |
| Bot Slack | Orbit SeoLab (`D0A4NMACLPP`) — reusa, NO crear app nueva |
| Canal alertas | `#alerts-operaciones` (`C0B1B3V4ZB5`) |
