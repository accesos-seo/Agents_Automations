"""Category C: Low CTR — top-10 position but CTR < 50% of benchmark.

This is a TITLE / META problem, not content. Cheapest fix in SEO.

Detect rule:
  - position in [1, 10]
  - impressions >= 1000/month
  - ctr_actual < ctr_expected × 0.5

Score = clicks_left_on_table × 2.5 (super high: low effort + clear ROI).
Confidence: high.  Effort: low.
"""
from __future__ import annotations

from collections import defaultdict

from _shared.scoring import ctr_benchmark_for_position, traffic_potential_from_low_ctr
from analyst.types import ClientAnalysisContext, OpportunityCandidate


MIN_POSITION = 1.0
MAX_POSITION = 10.0
MIN_IMPRESSIONS = 1000
CTR_GAP_THRESHOLD = 0.5  # actual < benchmark × this triggers detection


def detect(ctx: ClientAnalysisContext) -> list[OpportunityCandidate]:
    by_url: dict[str, list] = defaultdict(list)
    for r in ctx.gsc_rows:
        if not (MIN_POSITION <= r.position <= MAX_POSITION):
            continue
        if r.impressions < MIN_IMPRESSIONS:
            continue
        expected = ctr_benchmark_for_position(r.position)
        if expected <= 0:
            continue
        if r.ctr < expected * CTR_GAP_THRESHOLD:
            by_url[r.url].append(r)

    out: list[OpportunityCandidate] = []
    for url, rows in by_url.items():
        # Aggregate across queries: total clicks_left_on_table
        underperforming = []
        total_potential = 0.0
        for r in rows:
            expected = ctr_benchmark_for_position(r.position)
            potential = traffic_potential_from_low_ctr(
                impressions_monthly=r.impressions, actual_ctr=r.ctr, position=r.position,
            )
            total_potential += potential
            underperforming.append({
                "query": r.query,
                "position": round(r.position, 2),
                "impressions": r.impressions,
                "ctr_actual": round(r.ctr, 4),
                "ctr_expected": round(expected, 4),
                "ctr_gap": round(expected - r.ctr, 4),
                "potential_clicks_at_benchmark": round(potential, 1),
            })

        underperforming.sort(key=lambda q: -q["potential_clicks_at_benchmark"])
        primary_query = underperforming[0]["query"] if underperforming else ""

        ci = ctx.content_item_by_url.get(url)
        out.append(OpportunityCandidate(
            category="low_ctr",
            article_url=url,
            article_title=ci.title if ci else "",
            article_language=ci.language if ci else None,
            content_item_id=ci.content_item_id if ci else None,
            evidence={
                "underperforming_queries": underperforming[:8],
                "total_potential_clicks_monthly": round(total_potential, 1),
            },
            recommendation_summary=(
                f"CTR muy bajo para la posición. {len(underperforming)} queries pierden "
                f"~{total_potential:.0f} clicks/mes. Reescribir title tag y meta description."
            ),
            recommendation_details={
                "action": "rewrite_title_and_meta",
                "current_title": ci.title if ci else None,
                "current_meta": ci.meta_description if ci else None,
                "focus_queries": [q["query"] for q in underperforming[:5]],
                "tactics": [
                    "Incluir la query principal al inicio del title",
                    "Usar números, year actual, o paréntesis para destacar",
                    "Meta description en primera persona del lector, con beneficio claro y CTA",
                    "Evitar truncamiento (50-60 chars title, 150-160 meta)",
                ],
            },
            traffic_potential=float(total_potential),
            confidence="high",
            effort_level="low",
            dedupe_signature=f"{url}:meta:{primary_query}",
        ))

    return out
