// Category A: Decay — YoY click drops on previously-performing URLs.

import type { ClientAnalysisContext, OpportunityCandidate } from "../types.ts";

const MIN_BASELINE_CLICKS = 50;
const MIN_DROP_PCT = 0.20;

interface UrlAgg {
  clicks: number;
  clicks_prev: number;
  impressions: number;
  impressions_prev: number;
  queries: Map<string, { clicks: number; clicks_prev: number; pos: number; pos_prev: number; n: number }>;
}

export function detect(ctx: ClientAnalysisContext): OpportunityCandidate[] {
  const byUrl = new Map<string, UrlAgg>();
  for (const r of ctx.gscRows) {
    if (!byUrl.has(r.url)) {
      byUrl.set(r.url, { clicks: 0, clicks_prev: 0, impressions: 0, impressions_prev: 0, queries: new Map() });
    }
    const slot = byUrl.get(r.url)!;
    slot.clicks += r.clicks;
    slot.impressions += r.impressions;
    slot.clicks_prev += r.clicks_prev ?? 0;
    slot.impressions_prev += r.impressions_prev ?? 0;
    if (!slot.queries.has(r.query)) {
      slot.queries.set(r.query, { clicks: 0, clicks_prev: 0, pos: 0, pos_prev: 0, n: 0 });
    }
    const q = slot.queries.get(r.query)!;
    q.clicks += r.clicks;
    q.clicks_prev += r.clicks_prev ?? 0;
    q.pos += r.position;
    q.pos_prev += r.position_prev ?? 0;
    q.n += 1;
  }

  const out: OpportunityCandidate[] = [];
  for (const [url, slot] of byUrl) {
    if (slot.clicks_prev < MIN_BASELINE_CLICKS) continue;
    const drop = slot.clicks_prev - slot.clicks;
    if (drop <= 0) continue;
    const dropPct = drop / slot.clicks_prev;
    if (dropPct < MIN_DROP_PCT) continue;

    const topLost = Array.from(slot.queries.entries())
      .filter(([, v]) => v.clicks_prev > v.clicks)
      .map(([q, v]) => ({
        query: q,
        clicks: v.clicks,
        clicks_prev: v.clicks_prev,
        clicks_delta: v.clicks - v.clicks_prev,
        position: Number((v.pos / Math.max(v.n, 1)).toFixed(2)),
        position_prev: Number((v.pos_prev / Math.max(v.n, 1)).toFixed(2)),
      }))
      .sort((a, b) => a.clicks_delta - b.clicks_delta)
      .slice(0, 5);

    const ci = ctx.contentItemByUrl.get(url);
    out.push({
      category: "decay",
      articleUrl: url,
      articleTitle: ci?.title ?? "",
      articleLanguage: ci?.language ?? null,
      contentItemId: ci?.contentItemId ?? null,
      evidence: {
        clicks_current: slot.clicks,
        clicks_yoy: slot.clicks_prev,
        drop_clicks: drop,
        drop_pct: Number(dropPct.toFixed(3)),
        top_queries_lost: topLost,
      },
      recommendationSummary:
        `Artículo en caída — perdió ${drop} clicks YoY (${(dropPct * 100).toFixed(0)}%). ` +
        `Refrescar secciones que cubrían: ${topLost.slice(0, 3).map(q => q.query).join(", ")}.`,
      recommendationDetails: {
        action: "refresh_content",
        focus_queries: topLost.map(q => q.query),
        rationale: "Queries con caída YoY indican que el contenido perdió relevancia o frescura.",
      },
      trafficPotential: drop * 1.5,
      confidence: "high",
      effortLevel: "medium",
      dedupeSignature: url,
    });
  }
  return out;
}
