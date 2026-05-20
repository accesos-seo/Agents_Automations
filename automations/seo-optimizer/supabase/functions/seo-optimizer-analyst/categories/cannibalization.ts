// Category E: Cannibalization — múltiples URLs del cliente compitiendo por la misma query.

import type { ClientAnalysisContext, OpportunityCandidate } from "../types.ts";

const MAX_RANKING_POSITION = 30;
const MAX_POSITION_GAP_TO_FLAG = 10;
const MIN_COMBINED_CLICKS = 10;

interface UrlEntry { url: string; position: number; clicks: number; impressions: number; }

export function detect(ctx: ClientAnalysisContext): OpportunityCandidate[] {
  const perQuery = new Map<string, UrlEntry[]>();
  for (const r of ctx.gscRows) {
    if (r.position <= MAX_RANKING_POSITION) {
      if (!perQuery.has(r.query)) perQuery.set(r.query, []);
      perQuery.get(r.query)!.push({
        url: r.url, position: r.position, clicks: r.clicks, impressions: r.impressions,
      });
    }
  }

  const groups = new Map<string, { competingUrls: Set<string>; queries: unknown[]; totalClicks: number }>();
  for (const [query, entries] of perQuery) {
    if (entries.length < 2) continue;
    entries.sort((a, b) => a.position - b.position);
    const [top0, top1] = entries;
    if (top1.position - top0.position > MAX_POSITION_GAP_TO_FLAG) continue;
    const combinedClicks = entries.reduce((acc, e) => acc + e.clicks, 0);
    if (combinedClicks < MIN_COMBINED_CLICKS) continue;

    const primaryUrl = top0.url;
    if (!groups.has(primaryUrl)) {
      groups.set(primaryUrl, { competingUrls: new Set(), queries: [], totalClicks: 0 });
    }
    const g = groups.get(primaryUrl)!;
    for (const e of entries) g.competingUrls.add(e.url);
    g.queries.push({
      query,
      urls: entries.map(e => ({ url: e.url, position: Number(e.position.toFixed(2)), clicks: e.clicks })),
      combined_clicks: combinedClicks,
    });
    g.totalClicks += combinedClicks;
  }

  const out: OpportunityCandidate[] = [];
  for (const [primaryUrl, g] of groups) {
    if (g.competingUrls.size < 2) continue;
    const ci = ctx.contentItemByUrl.get(primaryUrl);
    const competing = Array.from(g.competingUrls).sort();

    out.push({
      category: "cannibalization",
      articleUrl: primaryUrl,
      articleTitle: ci?.title ?? "",
      articleLanguage: ci?.language ?? null,
      contentItemId: ci?.contentItemId ?? null,
      evidence: {
        competing_urls: competing,
        queries_affected: g.queries.slice(0, 8),
        total_combined_clicks: g.totalClicks,
      },
      recommendationSummary:
        `${competing.length} URLs del cliente compiten entre sí por ${g.queries.length} queries ` +
        `(combined: ${g.totalClicks} clicks). Consolidar o diferenciar intención.`,
      recommendationDetails: {
        action: "resolve_cannibalization",
        competing_urls: competing,
        options: [
          "Consolidar: redirect 301 del más débil al más fuerte (sumar autoridad)",
          "Diferenciar: re-enfocar cada URL a una intención distinta (informacional vs comercial)",
          "Internal linking: hacer que el más débil enlace al más fuerte con anchor relevante",
        ],
      },
      trafficPotential: g.totalClicks * 0.7,
      confidence: "medium",
      effortLevel: "high",
      dedupeSignature: competing.join(":"),
    });
  }
  return out;
}
