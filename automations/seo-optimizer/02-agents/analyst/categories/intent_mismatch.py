"""Category F: Intent Mismatch — article's declared intent doesn't match the
dominant intent of the queries it ranks for.

Uses public.article_analysis_index.search_intent (already LLM-classified by Orbit).
For query intent, uses fast regex heuristics (per language). LLM fallback only
for cases regex can't decide and the volume is high enough to matter.

Detect rule:
  - Article has declared search_intent in analysis_index
  - >= 70% of top queries (by impressions) have intent != declared
  - Total impressions for misaligned queries >= 500

Score = total_impressions × 0.7.
Confidence: low-medium.  Effort: high.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict

from analyst.types import ClientAnalysisContext, OpportunityCandidate


MIN_QUERY_IMPRESSIONS = 50
MIN_TOTAL_MISALIGNED_IMPRESSIONS = 500
MISALIGNMENT_THRESHOLD = 0.7
TOP_N_QUERIES = 15   # we classify the top N by impressions to keep cost bounded


# Per-language regex heuristics. These are intentionally conservative —
# better to mark "unknown" than mis-classify.

_PATTERNS = {
    "transactional": {
        "es": [r"\bcomprar\b", r"\bprecio\b", r"\bcu[áa]nto cuesta\b", r"\boferta\b", r"\bdescuento\b",
               r"\bbarato\b", r"\bcot[ií]za", r"\benv[ií]o\b", r"\btienda\b", r"\bonline\b"],
        "en": [r"\bbuy\b", r"\bprice\b", r"\bcheap\b", r"\bdiscount\b", r"\bdeal\b",
               r"\bfor sale\b", r"\bshop\b", r"\border\b", r"\bcoupon\b"],
        "pt": [r"\bcomprar\b", r"\bpre[çc]o\b", r"\bquanto custa\b", r"\boferta\b",
               r"\bdesconto\b", r"\bbarato\b", r"\bloja\b"],
    },
    "informational": {
        "es": [r"\bqu[éë] es\b", r"\bc[óo]mo\b", r"\bpor qu[éë]\b", r"\bgu[íi]a\b",
               r"\btutorial\b", r"\bdefinici[óo]n\b", r"\bsignifica\b", r"\bejemplos?\b"],
        "en": [r"\bwhat is\b", r"\bhow to\b", r"\bwhy\b", r"\bguide\b", r"\btutorial\b",
               r"\bexamples?\b", r"\bmeaning\b"],
        "pt": [r"\bo que [eé]\b", r"\bcomo\b", r"\bpor que\b", r"\bguia\b",
               r"\btutorial\b", r"\bsignifica\b", r"\bexemplos?\b"],
    },
    "commercial": {
        "es": [r"\bmejor(es)?\b", r"\b vs \b", r"\bcomparar?\b", r"\brese[ñn]a\b",
               r"\bopiniones?\b", r"\branking\b", r"\btop\s+\d+\b"],
        "en": [r"\bbest\b", r"\b vs \b", r"\bcomparison\b", r"\breview\b",
               r"\branking\b", r"\btop\s+\d+\b"],
        "pt": [r"\bmelhor(es)?\b", r"\b vs \b", r"\bcompara[çc][ãa]o\b", r"\bavalia[çc][ãa]o\b",
               r"\btop\s+\d+\b"],
    },
}


def _normalize_lang(language: str | None) -> str:
    if not language:
        return "es"
    l = language.lower()
    if l.startswith("pt"):
        return "pt"
    if l.startswith("en"):
        return "en"
    return "es"


def classify_query(query: str, language: str) -> str:
    """Returns one of: 'transactional', 'commercial', 'informational', 'unknown'."""
    q = query.lower()
    lang = _normalize_lang(language)
    scores = Counter()
    for intent, langs in _PATTERNS.items():
        patterns = langs.get(lang, [])
        for pat in patterns:
            if re.search(pat, q):
                scores[intent] += 1
    if not scores:
        return "unknown"
    return scores.most_common(1)[0][0]


def detect(ctx: ClientAnalysisContext) -> list[OpportunityCandidate]:
    by_url: dict[str, list] = defaultdict(list)
    for r in ctx.gsc_rows:
        if r.impressions >= MIN_QUERY_IMPRESSIONS:
            by_url[r.url].append(r)

    out: list[OpportunityCandidate] = []
    for url, rows in by_url.items():
        ci = ctx.content_item_by_url.get(url)
        if not ci or not ci.search_intent:
            continue   # no declared intent → can't compare

        declared = ci.search_intent.lower()
        # Normalize declared values to our 4 buckets
        if declared not in ("transactional", "commercial", "informational", "navigational"):
            continue

        # Take top N queries by impressions, classify
        rows.sort(key=lambda r: -r.impressions)
        top = rows[:TOP_N_QUERIES]
        language = _normalize_lang(ci.language)

        classifications: list[tuple] = []
        for r in top:
            intent = classify_query(r.query, language)
            classifications.append((r, intent))

        # Count dominant intent (excluding 'unknown')
        intent_impressions: Counter = Counter()
        for r, intent in classifications:
            if intent != "unknown":
                intent_impressions[intent] += r.impressions

        total_classified = sum(intent_impressions.values())
        if total_classified == 0:
            continue

        dominant_intent, dominant_imps = intent_impressions.most_common(1)[0]
        share = dominant_imps / total_classified
        if dominant_intent == declared:
            continue
        if share < MISALIGNMENT_THRESHOLD:
            continue
        if dominant_imps < MIN_TOTAL_MISALIGNED_IMPRESSIONS:
            continue

        misaligned_queries = [
            {"query": r.query, "impressions": r.impressions, "position": round(r.position, 2),
             "classified_intent": intent}
            for r, intent in classifications
            if intent == dominant_intent
        ]

        out.append(OpportunityCandidate(
            category="intent_mismatch",
            article_url=url,
            article_title=ci.title,
            article_language=ci.language,
            content_item_id=ci.content_item_id,
            evidence={
                "declared_intent": declared,
                "dominant_query_intent": dominant_intent,
                "dominant_share": round(share, 3),
                "misaligned_impressions": dominant_imps,
                "misaligned_queries": misaligned_queries,
            },
            recommendation_summary=(
                f"Artículo declarado como '{declared}' pero {share:.0%} de las queries "
                f"top tienen intención '{dominant_intent}'. Reorientar o crear artículo paralelo."
            ),
            recommendation_details={
                "action": "realign_intent",
                "from_intent": declared,
                "to_intent": dominant_intent,
                "options": [
                    f"Reescribir el artículo para alinear con intención '{dominant_intent}'",
                    f"Crear un artículo paralelo enfocado a '{dominant_intent}', dejar este para '{declared}'",
                    "Re-clasificar el artículo en article_analysis_index si la clasificación original era incorrecta",
                ],
            },
            traffic_potential=float(dominant_imps) * 0.7,
            confidence="low",
            effort_level="high",
            dedupe_signature=f"{url}:intent:{declared}->{dominant_intent}",
        ))

    return out
