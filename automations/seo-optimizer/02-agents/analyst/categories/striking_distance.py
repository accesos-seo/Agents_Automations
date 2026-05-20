"""Category B: Striking Distance — queries in positions 5-15 with high impressions.

Move from position 8 to 3 → CTR jumps ~5x. This is the highest-ROI category.

Detect rule:
  - position in [5, 15] inclusive
  - impressions >= 500/month

Score = projected_clicks_gained_if_top3 × 2.0 (high weight).
Confidence: high.  Effort: low-medium.
"""
from __future__ import annotations

from collections import defaultdict

from _shared.scoring import traffic_potential_clicks
from analyst.types import ClientAnalysisContext, OpportunityCandidate


MIN_POSITION = 5.0
MAX_POSITION = 15.0
MIN_IMPRESSIONS = 500
TARGET_POSITION = 3.0


def detect(ctx: ClientAnalysisContext) -> list[OpportunityCandidate]:
    # Group queries by URL, filter to striking-distance
    by_url: dict[str, list] = defaultdict(list)
    for r in ctx.gsc_rows:
        if MIN_POSITION <= r.position <= MAX_POSITION and r.impressions >= MIN_IMPRESSIONS:
            by_url[r.url].append(r)

    out: list[OpportunityCandidate] = []
    for url, rows in by_url.items():
        # Sort by potential descending
        scored = sorted(
            (
                (r, traffic_potential_clicks(
                    impressions_monthly=r.impressions,
                    current_position=r.position,
                    target_position=TARGET_POSITION,
                ))
                for r in rows
            ),
            key=lambda x: -x[1],
        )
        if not scored:
            continue

        top_queries = [
            {
                "query": r.query,
                "position": round(r.position, 2),
                "impressions": r.impressions,
                "clicks": r.clicks,
                "ctr": round(r.ctr, 4),
                "projected_clicks_top3": round(potential, 1),
            }
            for r, potential in scored[:5]
        ]
        total_potential = sum(p for _, p in scored)
        primary_query = top_queries[0]["query"]

        ci = ctx.content_item_by_url.get(url)
        out.append(OpportunityCandidate(
            category="striking_distance",
            article_url=url,
            article_title=ci.title if ci else "",
            article_language=ci.language if ci else None,
            content_item_id=ci.content_item_id if ci else None,
            evidence={
                "queries_in_striking_distance": len(scored),
                "top_queries": top_queries,
                "total_projected_clicks_top3": round(total_potential, 1),
            },
            recommendation_summary=(
                f"{len(scored)} queries en posiciones {MIN_POSITION:.0f}-{MAX_POSITION:.0f} "
                f"con potencial de +{total_potential:.0f} clicks/mes. "
                f"Reforzar cobertura de: \"{primary_query}\"."
            ),
            recommendation_details={
                "action": "strengthen_coverage",
                "focus_queries": [q["query"] for q in top_queries],
                "tactics": [
                    "Mencionar la query en un H2 si no aparece",
                    "Expandir la sección que la cubre con ejemplos o FAQ",
                    "Internal linking desde artículos relacionados con anchor text relevante",
                ],
            },
            traffic_potential=float(total_potential),
            confidence="high",
            effort_level="low",
            dedupe_signature=f"{url}:{primary_query}",
        ))

    return out
