// Category C: Low CTR — top-10 con CTR muy bajo (problema de title/meta).

import { ctrBenchmarkForPosition, trafficPotentialFromLowCtr } from "../../_shared/scoring.ts";
import type { ClientAnalysisContext, OpportunityCandidate } from "../types.ts";

const MIN_POSITION = 1;
const MAX_POSITION = 10;
const MIN_IMPRESSIONS = 1000;
const CTR_GAP_THRESHOLD = 0.5;

export function detect(ctx: ClientAnalysisContext): OpportunityCandidate[] {
  const byUrl = new Map<string, typeof ctx.gscRows>();
  for (const r of ctx.gscRows) {
    if (r.position < MIN_POSITION || r.position > MAX_POSITION) continue;
    if (r.impressions < MIN_IMPRESSIONS) continue;
    const expected = ctrBenchmarkForPosition(r.position);
    if (expected <= 0) continue;
    if (r.ctr < expected * CTR_GAP_THRESHOLD) {
      if (!byUrl.has(r.url)) byUrl.set(r.url, []);
      byUrl.get(r.url)!.push(r);
    }
  }

  const out: OpportunityCandidate[] = [];
  for (const [url, rows] of byUrl) {
    let totalPotential = 0;
    const underperforming = rows.map(r => {
      const expected = ctrBenchmarkForPosition(r.position);
      const potential = trafficPotentialFromLowCtr({
        impressionsMonthly: r.impressions, actualCtr: r.ctr, position: r.position,
      });
      totalPotential += potential;
      return {
        query: r.query,
        position: Number(r.position.toFixed(2)),
        impressions: r.impressions,
        ctr_actual: Number(r.ctr.toFixed(4)),
        ctr_expected: Number(expected.toFixed(4)),
        ctr_gap: Number((expected - r.ctr).toFixed(4)),
        potential_clicks_at_benchmark: Number(potential.toFixed(1)),
      };
    }).sort((a, b) => b.potential_clicks_at_benchmark - a.potential_clicks_at_benchmark);

    if (underperforming.length === 0) continue;
    const primaryQuery = underperforming[0].query;
    const ci = ctx.contentItemByUrl.get(url);

    out.push({
      category: "low_ctr",
      articleUrl: url,
      articleTitle: ci?.title ?? "",
      articleLanguage: ci?.language ?? null,
      contentItemId: ci?.contentItemId ?? null,
      evidence: {
        underperforming_queries: underperforming.slice(0, 8),
        total_potential_clicks_monthly: Number(totalPotential.toFixed(1)),
      },
      recommendationSummary:
        `CTR muy bajo para la posición. ${underperforming.length} queries pierden ` +
        `~${totalPotential.toFixed(0)} clicks/mes. Reescribir title tag y meta description.`,
      recommendationDetails: {
        action: "rewrite_title_and_meta",
        current_title: ci?.title ?? null,
        current_meta: ci?.metaDescription ?? null,
        focus_queries: underperforming.slice(0, 5).map(q => q.query),
        tactics: [
          "Incluir la query principal al inicio del title",
          "Usar números, year actual, o paréntesis para destacar",
          "Meta description en primera persona del lector, con beneficio claro y CTA",
          "Evitar truncamiento (50-60 chars title, 150-160 meta)",
        ],
      },
      trafficPotential: totalPotential,
      confidence: "high",
      effortLevel: "low",
      dedupeSignature: `${url}:meta:${primaryQuery}`,
    });
  }
  return out;
}
