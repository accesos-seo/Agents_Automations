// Category D: Semantic Coverage — queries con impresiones no presentes en headings/intro.

import { findMissingQueries } from "../../_shared/html-utils.ts";
import type { ClientAnalysisContext, OpportunityCandidate } from "../types.ts";

const MIN_IMPRESSIONS_PER_QUERY = 100;
const MIN_MISSING_TO_EMIT = 3;

export function detect(ctx: ClientAnalysisContext): OpportunityCandidate[] {
  const queriesByUrl = new Map<string, typeof ctx.gscRows>();
  for (const r of ctx.gscRows) {
    if (r.impressions >= MIN_IMPRESSIONS_PER_QUERY) {
      if (!queriesByUrl.has(r.url)) queriesByUrl.set(r.url, []);
      queriesByUrl.get(r.url)!.push(r);
    }
  }

  const out: OpportunityCandidate[] = [];
  for (const [url, rows] of queriesByUrl) {
    const snap = ctx.snapshotsByUrl.get(url);
    if (!snap || snap.source === "fallback_failed") continue;

    // Dedupe by query, keep highest impressions
    const uniq = new Map<string, typeof rows[number]>();
    for (const r of rows) {
      const existing = uniq.get(r.query);
      if (!existing || r.impressions > existing.impressions) uniq.set(r.query, r);
    }
    const uniqQueries = Array.from(uniq.values());
    const queryStrings = uniqQueries.map(r => r.query);

    const missing = findMissingQueries(queryStrings, snap.parsed);
    if (missing.length < MIN_MISSING_TO_EMIT) continue;

    const missingSet = new Set(missing);
    const missingDetails = uniqQueries
      .filter(r => missingSet.has(r.query))
      .map(r => {
        const positionFactor = Math.max(0.5, (16 - Math.min(r.position, 15)) / 15);
        return {
          query: r.query,
          impressions: r.impressions,
          clicks: r.clicks,
          position: Number(r.position.toFixed(2)),
          position_factor: Number(positionFactor.toFixed(2)),
        };
      })
      .sort((a, b) => b.impressions - a.impressions);

    const totalPotential = missingDetails.reduce(
      (acc, q) => acc + q.impressions * q.position_factor * 0.05,
      0,
    );

    const ci = ctx.contentItemByUrl.get(url);
    const topFive = missingDetails.slice(0, 5).map(q => q.query).sort().join(",");

    out.push({
      category: "semantic_coverage",
      articleUrl: url,
      articleTitle: ci?.title ?? "",
      articleLanguage: ci?.language ?? null,
      contentItemId: ci?.contentItemId ?? null,
      evidence: {
        total_missing_queries: missingDetails.length,
        missing_queries: missingDetails.slice(0, 10),
        article_word_count: snap.parsed.wordCount,
        headings_count: snap.parsed.headings.length,
      },
      recommendationSummary:
        `${missingDetails.length} queries con tráfico potencial no están cubiertas ` +
        `en headings/title/meta. Top: "${missingDetails[0].query}".`,
      recommendationDetails: {
        action: "expand_semantic_coverage",
        missing_queries: missingDetails.slice(0, 10).map(q => q.query),
        tactics: [
          "Agregar un H2 que mencione las queries top sin cobertura",
          "Si la query es una pregunta natural, agregar FAQ section",
          "Reescribir alt-text de imágenes con keywords relacionadas",
          "Ampliar el primer párrafo para tocar las queries semánticamente",
        ],
      },
      trafficPotential: totalPotential,
      confidence: "medium",
      effortLevel: "medium",
      dedupeSignature: `${url}:cov:${topFive}`,
    });
  }
  return out;
}
