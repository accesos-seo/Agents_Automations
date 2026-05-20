// Category F: Intent Mismatch — declared intent vs dominant query intent.

import type { ClientAnalysisContext, OpportunityCandidate } from "../types.ts";

const MIN_QUERY_IMPRESSIONS = 50;
const MIN_TOTAL_MISALIGNED_IMPRESSIONS = 500;
const MISALIGNMENT_THRESHOLD = 0.7;
const TOP_N_QUERIES = 15;

type Intent = "transactional" | "informational" | "commercial" | "unknown";

const PATTERNS: Record<Exclude<Intent, "unknown">, Record<string, RegExp[]>> = {
  transactional: {
    es: [/\bcomprar\b/, /\bprecio\b/, /\bcu[áa]nto cuesta\b/, /\boferta\b/, /\bdescuento\b/, /\bbarato\b/, /\bcot[ií]za/, /\benv[ií]o\b/, /\btienda\b/, /\bonline\b/],
    en: [/\bbuy\b/, /\bprice\b/, /\bcheap\b/, /\bdiscount\b/, /\bdeal\b/, /\bfor sale\b/, /\bshop\b/, /\border\b/, /\bcoupon\b/],
    pt: [/\bcomprar\b/, /\bpre[çc]o\b/, /\bquanto custa\b/, /\boferta\b/, /\bdesconto\b/, /\bbarato\b/, /\bloja\b/],
  },
  informational: {
    es: [/\bqu[éë] es\b/, /\bc[óo]mo\b/, /\bpor qu[éë]\b/, /\bgu[íi]a\b/, /\btutorial\b/, /\bdefinici[óo]n\b/, /\bsignifica\b/, /\bejemplos?\b/],
    en: [/\bwhat is\b/, /\bhow to\b/, /\bwhy\b/, /\bguide\b/, /\btutorial\b/, /\bexamples?\b/, /\bmeaning\b/],
    pt: [/\bo que [eé]\b/, /\bcomo\b/, /\bpor que\b/, /\bguia\b/, /\btutorial\b/, /\bsignifica\b/, /\bexemplos?\b/],
  },
  commercial: {
    es: [/\bmejor(es)?\b/, /\s+vs\s+/, /\bcomparar?\b/, /\brese[ñn]a\b/, /\bopiniones?\b/, /\branking\b/, /\btop\s+\d+\b/],
    en: [/\bbest\b/, /\s+vs\s+/, /\bcomparison\b/, /\breview\b/, /\branking\b/, /\btop\s+\d+\b/],
    pt: [/\bmelhor(es)?\b/, /\s+vs\s+/, /\bcompara[çc][ãa]o\b/, /\bavalia[çc][ãa]o\b/, /\btop\s+\d+\b/],
  },
};

function normalizeLang(lang: string | null | undefined): string {
  if (!lang) return "es";
  const l = lang.toLowerCase();
  if (l.startsWith("pt")) return "pt";
  if (l.startsWith("en")) return "en";
  return "es";
}

function classifyQuery(query: string, language: string): Intent {
  const q = query.toLowerCase();
  const lang = normalizeLang(language);
  const scores: Partial<Record<Intent, number>> = {};
  for (const intent of ["transactional", "informational", "commercial"] as const) {
    const patterns = PATTERNS[intent][lang] ?? [];
    for (const pat of patterns) {
      if (pat.test(q)) scores[intent] = (scores[intent] ?? 0) + 1;
    }
  }
  const entries = Object.entries(scores) as Array<[Intent, number]>;
  if (entries.length === 0) return "unknown";
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

export function detect(ctx: ClientAnalysisContext): OpportunityCandidate[] {
  const byUrl = new Map<string, typeof ctx.gscRows>();
  for (const r of ctx.gscRows) {
    if (r.impressions >= MIN_QUERY_IMPRESSIONS) {
      if (!byUrl.has(r.url)) byUrl.set(r.url, []);
      byUrl.get(r.url)!.push(r);
    }
  }

  const out: OpportunityCandidate[] = [];
  for (const [url, rows] of byUrl) {
    const ci = ctx.contentItemByUrl.get(url);
    if (!ci || !ci.searchIntent) continue;
    const declared = ci.searchIntent.toLowerCase();
    if (!["transactional", "commercial", "informational", "navigational"].includes(declared)) continue;

    rows.sort((a, b) => b.impressions - a.impressions);
    const top = rows.slice(0, TOP_N_QUERIES);
    const lang = normalizeLang(ci.language);

    const intentImpressions: Record<string, number> = {};
    const classifications: Array<{ r: typeof rows[number]; intent: Intent }> = [];
    for (const r of top) {
      const intent = classifyQuery(r.query, lang);
      classifications.push({ r, intent });
      if (intent !== "unknown") {
        intentImpressions[intent] = (intentImpressions[intent] ?? 0) + r.impressions;
      }
    }

    const totalClassified = Object.values(intentImpressions).reduce((a, b) => a + b, 0);
    if (totalClassified === 0) continue;
    const sorted = Object.entries(intentImpressions).sort((a, b) => b[1] - a[1]);
    const [dominantIntent, dominantImps] = sorted[0];
    const share = dominantImps / totalClassified;

    if (dominantIntent === declared) continue;
    if (share < MISALIGNMENT_THRESHOLD) continue;
    if (dominantImps < MIN_TOTAL_MISALIGNED_IMPRESSIONS) continue;

    const misalignedQueries = classifications
      .filter(c => c.intent === dominantIntent)
      .map(c => ({
        query: c.r.query, impressions: c.r.impressions,
        position: Number(c.r.position.toFixed(2)),
        classified_intent: c.intent,
      }));

    out.push({
      category: "intent_mismatch",
      articleUrl: url,
      articleTitle: ci.title,
      articleLanguage: ci.language,
      contentItemId: ci.contentItemId,
      evidence: {
        declared_intent: declared,
        dominant_query_intent: dominantIntent,
        dominant_share: Number(share.toFixed(3)),
        misaligned_impressions: dominantImps,
        misaligned_queries: misalignedQueries,
      },
      recommendationSummary:
        `Artículo declarado como '${declared}' pero ${(share * 100).toFixed(0)}% de las queries ` +
        `top tienen intención '${dominantIntent}'. Reorientar o crear artículo paralelo.`,
      recommendationDetails: {
        action: "realign_intent",
        from_intent: declared,
        to_intent: dominantIntent,
        options: [
          `Reescribir el artículo para alinear con intención '${dominantIntent}'`,
          `Crear un artículo paralelo enfocado a '${dominantIntent}', dejar este para '${declared}'`,
          "Re-clasificar el artículo en article_analysis_index si la clasificación original era incorrecta",
        ],
      },
      trafficPotential: dominantImps * 0.7,
      confidence: "low",
      effortLevel: "high",
      dedupeSignature: `${url}:intent:${declared}->${dominantIntent}`,
    });
  }
  return out;
}
