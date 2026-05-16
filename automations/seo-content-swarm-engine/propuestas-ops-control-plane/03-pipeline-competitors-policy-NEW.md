# NUEVO ARCHIVO — `pipeline/competitors-policy.md`

**Acción:** Crear este archivo nuevo en `accesos-seo/ops-control-plane:automation_projects/02-seo-content-generation/pipeline/competitors-policy.md`.

**Rol del archivo:** es el contrato que el `brand-context-loader` debe cargar y los agentes (`content-writer`, `editor-agent`, `contract-validator-agent`) deben respetar. La fuente de verdad operativa machine-readable vive en `Agents_Automations:automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml`; este markdown es la versión cargada por el pipeline.

---

## Contenido del archivo

```markdown
# Pipeline Policy — Forbidden Competitors

**Status:** active — blocking in production
**Authority:** Producto
**Canonical source:** `accesos-seo/Agents_Automations:referencias/politica-competidores-prohibidos.md`
**Machine-readable list:** `accesos-seo/Agents_Automations:automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml`

## Rule

> No content output by the SEO Content Swarm Engine — articles, briefs, audio scripts, image descriptions, ad copies, or internal visible prompts — may mention, compare, recommend, or reference any competitor of the brand emitting the content. The rule is non-negotiable. Presence of a competitor in the output is a defect, not an editorial decision.

## Why this exists

We do not advertise the competition for free, we do not dilute the authority of our brands, we do not send the reader off our funnel.

## Scope (4 planes)

1. **End-user output** — published articles, audio scripts, image descriptions, copies.
2. **Pipeline intermediate output** — briefs, contracts, loaded contexts, prompts.
3. **Human operation** — Content Managers, editors, external writers, support staff.
4. **External reports and audits** — any artifact leaving internal scope.

## Active list — iGaming pt-BR (16 brands)

The following brands and their domain or compound-name variants must never appear in content generated for `cassino-bet` or `vera-bet`:

Blaze · Stake · Betano · 1xBet · F12Bet · KTO · Estrela Bet · Pixbet · Sportingbet · Superbet · Novibet · BetMGM · BetBoom · bet365 · Betnacional · Aposta Ganha

## Permitted look-alikes (do NOT block)

- **"stake"** (lowercase, used as English/iGaming jargon for "betting amount"). Example permitted: *"limite a stake por entrada"*. Blocked only as proper-noun-of-brand (Stake.com, Stake Casino, Stake Brasil).
- **"Pix"** (the Brazilian instant payment method). Universally permitted, except when forming part of the competitor brand name "Pixbet" / "Pix.Bet" / "Pix Bet".
- **".bet.br"** domain convention (regulatory). Permitted in discussions of licensing.
- **SPA/MF**, **SIGAP** (regulatory entities). Permitted.

## Enforcement layers

| Layer | Mechanism | Action on detection |
|---|---|---|
| Brief (n8n A: `fn_trigger_seo_investigation`) | Pre-filter the `brief_data` before returning to the orchestrator. Strip mentions or tag them as `context_only_not_for_writing`. | Log `forbidden_competitor_filtered` in `content_generation_logs`. Non-blocking. |
| Writer prompt (`content-writer` / `section-writer-agent`) | Inject this policy as a `system` block instructing: "Never mention any of: <list>". | Defensive layer. Model is instructed to refuse. |
| Editor prompt (`editor-agent`) | Same injection, plus instruction to remove any residual mention. | Defensive layer. |
| Contract validator (`contract-validator-agent` / `seo-content-contract-validator-agent`) | Regex match against the alias list from `competidores-prohibidos.yaml`. Case-insensitive, word-boundary, with `requires_brand_context` strategy for ambiguous canonicals. | Reject article with `error_code: forbidden_competitor_mentioned`, severity `high`. Route to `final_repair`. Max 2 retries. After that: `status=failed`, human escalation. |
| Post-publication audit | Scheduled query over `content_items` with `status='published'`. | Generate `content_generation_alerts` with `alert_type='forbidden_competitor_mentioned'`, severity `high`. |

## Exception process

Mentions of a competitor are allowed only via written authorization from Producto, registered in the `exceptions:` section of `competidores-prohibidos.yaml`. Without a registered entry there is no exception. The exception entry must specify: emitting brand, competitor, scope (URL or topic), start date, end date, authorizing person.

## Per-brand specifics

- `cassino-bet`: inherits `industries.igaming_pt_br`. No additions, no exclusions.
- `vera-bet`: inherits `industries.igaming_pt_br`. No additions, no exclusions.
- Other brands (`armor-corp`, `doug-construction`, `educa-college-prep`, `floty`, `holisteek`, `leasy`, `vozy-ai`): pending — to be defined per brand in a future iteration. Until defined, the global rule applies but with empty industry list, so only future per-brand additions trigger blocking.

## Versioning

This file is a contract loaded by `brand-context-loader` for every run. Any modification requires:

1. PR on `ops-control-plane`.
2. Sync update in the machine-readable `competidores-prohibidos.yaml` on `Agents_Automations`.
3. Entry in `automations/seo-content-swarm-engine/README.md` bitácora.
```
