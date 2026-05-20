// Category B: Striking Distance — posiciones 5-15 con alto volumen.

import { trafficPotentialClicks } from "../../_shared/scoring.ts";
import type { ClientAnalysisContext, OpportunityCandidate } from "../types.ts";

const MIN_POSITION = 5;
const MAX_POSITION = 15;
const MIN_IMPRESSIONS = 500;
const TARGET_POSITION = 3;

export function detect(ctx: ClientAnalysisContext): OpportunityCandidate[] {
  const byUrl = new Map<string, typeof ctx.gscRows>();
  for (const r of ctx.gscRows) {
    if (r.position >= MIN_POSITION && r.position <= MAX_POSITION && r.impressions >= MIN_IMPRESSIONS) {
      if (!byUrl.has(r.url)) byUrl.set(r.url, []);
      byUrl.get(r.url)!.push(r);
    }
  }

  const out: OpportunityCandidate[] = [];
  for (const [url, rows] of byUrl) {
    const scored = rows.map(r => ({
      r,
      potential: trafficPotentialClicks({
        impressionsMonthly: r.impressions,
        currentPosition: r.position,
        targetPosition: TARGET_POSITION,
      }),
    })).sort((a, b) => b.potential - a.potential);

    if (scored.length === 0) continue;
    const topQueries = scored.slice(0, 5).map(s => ({
      query: s.r.query,
      position: Number(s.r.position.toFixed(2)),
      impressions: s.r.impressions,
      clicks: s.r.clicks,
      ctr: Number(s.r.ctr.toFixed(4)),
      projected_clicks_top3: Number(s.potential.toFixed(1)),
    }));
    const totalPotential = scored.reduce((a, s) => a + s.potential, 0);
    const primaryQuery = topQueries[0].query;
    const ci = ctx.contentItemByUrl.get(url);

    out.push({
      category: "striking_distance",
      articleUrl: url,
      articleTitle: ci?.title ?? "",
      articleLanguage: ci?.language ?? null,
      contentItemId: ci?.contentItemId ?? null,
      evidence: {
        queries_in_striking_distance: scored.length,
        top_queries: topQueries,
        total_projected_clicks_top3: Number(totalPotential.toFixed(1)),
      },
      recommendationSummary:
        `${scored.length} queries en posiciones ${MIN_POSITION}-${MAX_POSITION} con ` +
        `potencial de +${totalPotential.toFixed(0)} clicks/mes. Reforzar cobertura de: "${primaryQuery}".`,
      recommendationDetails: {
        action: "strengthen_coverage",
        focus_queries: topQueries.map(q => q.query),
        tactics: [
          "Mencionar la query en un H2 si no aparece",
          "Expandir la sección que la cubre con ejemplos o FAQ",
          "Internal linking desde artículos relacionados con anchor text relevante",
        ],
      },
      trafficPotential: totalPotential,
      confidence: "high",
      effortLevel: "low",
      dedupeSignature: `${url}:${primaryQuery}`,
    });
  }
  return out;
}
