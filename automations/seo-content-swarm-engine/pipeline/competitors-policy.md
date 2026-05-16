# Pipeline Policy — Forbidden Competitors

**Status:** active — blocking in production
**Authority:** Producto
**Canonical source:** `accesos-seo/Agents_Automations:referencias/politica-competidores-prohibidos.md`
**Machine-readable list:** `accesos-seo/Agents_Automations:automations/seo-content-swarm-engine/politicas/competidores-prohibidos.yaml`
**Last update:** 2026-05-16

---

## Rule

> No content output by the SEO Content Swarm Engine — articles, briefs, audio scripts, image descriptions, ad copies, or internal visible prompts — may mention, compare, recommend, or reference any competitor of the brand emitting the content. The rule is non-negotiable. Presence of a competitor in the output is a defect, not an editorial decision.

## Why this exists

We do not advertise the competition for free, we do not dilute the authority of our brands, we do not send the reader off our funnel.

## Scope (4 planes)

1. **End-user output** — published articles, audio scripts, image descriptions, copies.
2. **Pipeline intermediate output** — briefs, contracts, loaded contexts, prompts.
3. **Human operation** — Content Managers, editors, external writers, support staff.
4. **External reports and audits** — any artifact leaving internal scope.

---

## Active list — iGaming pt-BR (16 brands)

The following brands and their domain or compound-name variants must never appear in content generated for `cassino-bet` or `vera-bet`:

Blaze · Stake · Betano · 1xBet · F12Bet · KTO · Estrela Bet · Pixbet · Sportingbet · Superbet · Novibet · BetMGM · BetBoom · bet365 · Betnacional · Aposta Ganha

## Active list — IA Conversacional B2B LATAM (15 brands)

The following brands must never appear in content generated for `vozy-ai`:

Kore.ai · Yellow.ai · IBM Watson Assistant · Google Contact Center AI · Amazon Connect · Microsoft Nuance · Avaya · Genesys · Talkdesk · Twilio Flex · LivePerson · NICE inContact · Salesforce Einstein · Zendesk AI · Botpress

---

## Permitted look-alikes (do NOT block)

- **"stake"** (lowercase, used as English/iGaming jargon for "betting amount"). Blocked only as proper-noun-of-brand (Stake.com, Stake Casino, Stake Brasil).
- **"Pix"** (the Brazilian instant payment method). Universally permitted, except when forming part of the competitor brand name "Pixbet" / "Pix.Bet" / "Pix Bet".
- **".bet.br"** domain convention (regulatory). Permitted in discussions of licensing.
- **SPA/MF**, **SIGAP** (regulatory entities). Permitted.

---

## Enforcement layers

| Layer | Mechanism | Action on detection |
|---|---|---|
| Brief (n8n A: `fn_trigger_seo_investigation`) | Pre-filter the `brief_data` before returning to the orchestrator. Strip mentions or tag them as `context_only_not_for_writing`. | Log `forbidden_competitor_filtered` in `content_generation_logs`. Non-blocking. |
| Writer prompt (`content-writer` / `section-writer-agent`) | Inject this policy as a `system` block instructing: "Never mention any of: <list>". | Defensive layer. Model is instructed to refuse. |
| Editor prompt (`editor-agent`) | Same injection, plus instruction to remove any residual mention. | Defensive layer. |
| Contract validator (`contract-validator-agent` / `seo-content-contract-validator-agent`) | Regex match against the alias list from `competidores-prohibidos.yaml`. Case-insensitive, word-boundary, with `requires_brand_context` strategy for ambiguous canonicals. | Reject article with `error_code: forbidden_competitor_mentioned`, severity `high`. Route to `final_repair`. Max 2 retries. After that: `status=failed`, human escalation. |
| Post-publication audit | Scheduled query over `content_items` with `status='published'`. | Generate `content_generation_alerts` with `alert_type='forbidden_competitor_mentioned'`, severity `high`. |

---

## Exception process

Mentions of a competitor are allowed only via written authorization from Producto, registered in the `exceptions:` section of `competidores-prohibidos.yaml`. Without a registered entry there is no exception. The exception entry must specify: emitting brand, competitor, scope (URL or topic), start date, end date, authorizing person.

---

## Per-brand specifics

- `cassino-bet`: inherits `industries.igaming_pt_br`. No additions, no exclusions.
- `vera-bet`: inherits `industries.igaming_pt_br`. No additions, no exclusions.
- `vozy-ai`: 15 brands listed above. See `competidores-prohibidos.yaml` for aliases.
- Other brands (`armor-corp`, `doug-construction`, `educa-college-prep`, `floty`, `holisteek`, `leasy`): pending — to be defined per brand. Until defined, the global rule applies but with empty industry list.

---

## Versioning

Any modification requires:

1. Update this file in `Agents_Automations` (source of truth).
2. Sync update in the machine-readable `competidores-prohibidos.yaml`.
3. Entry in `automations/seo-content-swarm-engine/README.md` bitácora.
4. Coordinate with `brand-context-loader` to reload the bundle.
