# Política — Prohibición de mencionar competidores

**Estado:** ACTIVA — regla no negociable
**Aplicación:** TODO el contenido editorial, publicitario y operativo generado en el ecosistema.
**Fecha:** 2026-05-16
**Owner:** Producto

---

## 1. Regla universal

> **Ningún contenido producido por el ecosistema —artículos, briefs, audio, imágenes, redes sociales, copys publicitarios, prompts internos visibles— puede mencionar, nombrar, comparar, recomendar o referenciar a un competidor de cualquiera de nuestras marcas. La regla no es negociable. La presencia de un competidor en el output es un defecto, no una decisión editorial.**

Razón de existir: no le hacemos publicidad gratuita a la competencia, no diluimos la autoridad de nuestras marcas, no enviamos al lector fuera del funnel propio.

## 2. Alcance

Esta política aplica en cuatro planos:

1. **Output al usuario final** — artículos publicados, scripts de audio, descripciones de imagen, copys.
2. **Output intermedio del pipeline** — briefs, contratos, contextos cargados, prompts.
3. **Operación humana** — Content Managers, editores, redactores externos, equipo de soporte.
4. **Auditorías y reportes externos** — cualquier documento que salga del ámbito interno.

## 3. Defensa en profundidad — 7 capas donde se refuerza

La regla vive simultáneamente en todos estos lugares para que un fallo aislado no la rompa:

| # | Capa | Documento de referencia |
|---|---|---|
| 1 | Política canónica (este documento) | `referencias/politica-competidores-prohibidos.md` |
| 2 | Lista operativa por industria/marca | `automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml` |
| 3 | Brand-voice por marca | `accesos-seo/ops-control-plane:automation_projects/02-seo-content-generation/brands/<brand_slug>/brand-voice.md` |
| 4 | Contrato de carga de recursos del pipeline | `accesos-seo/ops-control-plane:automation_projects/02-seo-content-generation/pipeline/resource-loading-contract.md` |
| 5 | Investigación SEO (n8n A) | `fn_trigger_seo_investigation` → webhook n8n: filtro de competidores antes de devolver el `brief_data` |
| 6 | Prompts de agentes | `content-writer`, `section-writer-agent`, `editor-agent`: bloque "FORBIDDEN COMPETITORS" inyectado en el system prompt |
| 7 | Contract validator | `seo-content-contract-validator-agent`: regla **bloqueante** `forbidden_competitors_check` con severidad `high` |

Una mención que escape de la capa 1 debería detenerse en la 6. Si llega a la 7, debería bloquearse antes de persistir. Si llegara al output del usuario, es un incidente reportable.

## 4. Jerarquía de listas

Cada competidor está en una de tres categorías:

### 4.1. Global

Competidores prohibidos en CUALQUIER contenido del ecosistema, sin importar la marca emisora. Lista vacía hoy (se irá poblando con marcas que sean competidoras transversales).

### 4.2. Por industria / mercado

Competidores prohibidos en todas las marcas de una misma industria/mercado.

Hoy definido: **iGaming pt-BR** — 16 marcas. Detalle en `competidores-prohibidos.yaml`.

### 4.3. Por marca específica

Overrides o ampliaciones que solo aplican a una marca. Vive dentro del `brand-voice.md` de cada marca, sección "Concorrentes proibidos".

## 5. Resolución de ambigüedades

Algunos nombres de competidor son palabras comunes. La regla distingue entre **mención del competidor** (prohibida) y **uso genérico de la palabra** (permitido).

Ejemplos resueltos:

| Forma | ¿Bloqueada? | Razón |
|---|---|---|
| "Stake.com", "Stake Casino", "Stake Brasil", "Stake bet" | ✅ Bloqueada | Referencia al competidor |
| "limite a stake por entrada" (monto apostado) | ❌ Permitida | Sustantivo común del inglés, terminología de iGaming |
| "Pix" como método de pago | ❌ Permitida | Método de pago brasileño universal |
| "Pixbet", "Pix.Bet", "Pix Bet" | ✅ Bloqueada | Referencia al competidor Pixbet |
| "bet365", "Bet 365" | ✅ Bloqueada | Referencia al competidor |
| Dominios `.bet.br` genéricos | ❌ Permitida | Convención regulatoria, no marca |

La lista operativa en `competidores-prohibidos.yaml` define los aliases exactos a bloquear y las excepciones de terminología.

## 6. Excepciones legítimas (deben ser aprobadas por Producto)

La única vía para mencionar un competidor es una **excepción autorizada** por Producto, registrada por escrito en este repositorio. Casos posibles, no exhaustivos:

- Análisis comparativo público requerido por una marca cliente (raro).
- Comunicación legal o regulatoria.
- Mención obligatoria por contrato.

Una excepción se documenta como una entrada en una sección al final de `competidores-prohibidos.yaml` con: marca emisora, competidor, alcance, fecha de inicio, fecha de fin, autorizador.

Sin entrada registrada, no hay excepción.

## 7. Respuesta a violaciones

- **Detectado en brief** (capa 5): el filtro de n8n A elimina la mención y la registra como `forbidden_competitor_filtered` en `content_generation_logs`. No bloquea generación.
- **Detectado en artículo antes de publicar** (capa 7): el contract-validator rechaza el artículo con error `forbidden_competitor_mentioned`, severidad `high`. El run vuelve a `final_repair`. Si tras dos reintentos sigue contaminado, queda en `failed` y escala a revisión humana.
- **Detectado después de publicar**: alerta `forbidden_competitor_mentioned` con `severity='high'` en `content_generation_alerts`. El Content Manager despublica o edita en el día.
- **Detectado en producción por un cliente**: incidente. Despublicación inmediata, post mortem, ajuste de la capa que falló.

## 8. Auditoría retroactiva (resultado 2026-05-16)

| Indicador | Valor |
|---|---|
| Artículos con `article_content` analizados (status ≠ archived) | 153 |
| Artículos con menciones reales de competidores | **0** |
| Falsos positivos descartados | 3 (uso genérico de "stake" como monto apostado en artículos de Vera Bet) |

**Conclusión auditoría:** los artículos publicados están limpios. La política se introduce de forma preventiva, no remedial. La fuente de riesgo es el `brief_data` generado por n8n A, que sí enumera competidores en `contexto_investigacion` con datos específicos (números de licencia, patrocinios) — es solo cuestión de tiempo que un futuro writer los cite.

## 9. Mantenimiento

- La lista operativa (`competidores-prohibidos.yaml`) se revisa con frecuencia trimestral o cuando se incorpora una marca nueva.
- Cualquier cambio en la lista se commitea aquí con descripción del porqué.
- El owner de Producto aprueba altas, bajas y excepciones.
