"""Category D: Semantic Coverage — queries that drive impressions but aren't
present in the article's "key SEO real estate" (title, meta, H1-H6, first
paragraph, alt-text).

Detect rule:
  - For each URL with a snapshot, examine queries with impressions >= 100
  - Lemmatize/stem and check whether the query appears in the article's
    key text (uses html_utils.find_missing_queries with language)
  - If 3+ queries are missing → emit opportunity

Score = sum(impressions for missing queries) × position_factor.
Confidence: medium-high.  Effort: medium (edit body).
"""
from __future__ import annotations

from collections import defaultdict

from _shared.html_utils import find_missing_queries
from analyst.types import ClientAnalysisContext, OpportunityCandidate


MIN_IMPRESSIONS_PER_QUERY = 100
MIN_MISSING_TO_EMIT = 3


def detect(ctx: ClientAnalysisContext) -> list[OpportunityCandidate]:
    # Group queries per URL
    queries_by_url: dict[str, list] = defaultdict(list)
    for r in ctx.gsc_rows:
        if r.impressions >= MIN_IMPRESSIONS_PER_QUERY:
            queries_by_url[r.url].append(r)

    out: list[OpportunityCandidate] = []
    for url, rows in queries_by_url.items():
        snap = ctx.snapshots_by_url.get(url)
        if not snap or snap.source == "fallback_failed":
            # Can't analyze coverage without article text
            continue
        ci = ctx.content_item_by_url.get(url)
        language = (ci.language if ci else None) or "es"

        unique_queries = list({r.query: r for r in rows}.values())
        query_strings = [r.query for r in unique_queries]

        missing = find_missing_queries(query_strings, snap.parsed, language=language)
        if len(missing) < MIN_MISSING_TO_EMIT:
            continue

        # Build detailed evidence for missing ones
        missing_set = set(missing)
        missing_details = []
        for r in unique_queries:
            if r.query in missing_set:
                position_factor = max(0.5, (16 - min(r.position, 15.0)) / 15.0)
                missing_details.append({
                    "query": r.query,
                    "impressions": r.impressions,
                    "clicks": r.clicks,
                    "position": round(r.position, 2),
                    "position_factor": round(position_factor, 2),
                })
        missing_details.sort(key=lambda q: -q["impressions"])

        total_potential = sum(
            q["impressions"] * q["position_factor"] * 0.05  # 5% CTR baseline as proxy
            for q in missing_details
        )

        out.append(OpportunityCandidate(
            category="semantic_coverage",
            article_url=url,
            article_title=ci.title if ci else "",
            article_language=language,
            content_item_id=ci.content_item_id if ci else None,
            evidence={
                "total_missing_queries": len(missing_details),
                "missing_queries": missing_details[:10],
                "article_word_count": snap.parsed.word_count,
                "headings_count": len(snap.parsed.headings),
            },
            recommendation_summary=(
                f"{len(missing_details)} queries con tráfico potencial no están cubiertas "
                f"en headings/title/meta. Top: \"{missing_details[0]['query']}\"."
            ),
            recommendation_details={
                "action": "expand_semantic_coverage",
                "missing_queries": [q["query"] for q in missing_details[:10]],
                "tactics": [
                    "Agregar un H2 que mencione las queries top sin cobertura",
                    "Si la query es una pregunta natural, agregar FAQ section",
                    "Reescribir alt-text de imágenes con keywords relacionadas",
                    "Ampliar el primer párrafo para tocar las queries semánticamente",
                ],
            },
            traffic_potential=float(total_potential),
            confidence="medium",
            effort_level="medium",
            dedupe_signature=f"{url}:cov:{','.join(sorted(missing_details[0:5] and [q['query'] for q in missing_details[:5]]))}",
        ))

    return out
