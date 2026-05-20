"""Category A: Decay — YoY click drops on previously-performing URLs.

Detect rule:
  - URL had >= 50 clicks YoY (baseline matters; don't waste effort on tiny URLs)
  - Current period clicks dropped >= 20% vs YoY
  - Compute top queries lost

Score = clicks_lost × 1.5 (high weight: proven URL needs rescue).
Confidence: high.  Effort: medium (refresh sections).
"""
from __future__ import annotations

from collections import defaultdict

from analyst.types import ClientAnalysisContext, OpportunityCandidate


MIN_BASELINE_CLICKS = 50
MIN_DROP_PCT = 0.20


def detect(ctx: ClientAnalysisContext) -> list[OpportunityCandidate]:
    # Aggregate per URL
    by_url: dict[str, dict] = defaultdict(lambda: {
        "clicks": 0, "clicks_prev": 0,
        "impressions": 0, "impressions_prev": 0,
        "queries": [],
    })

    for r in ctx.gsc_rows:
        slot = by_url[r.url]
        slot["clicks"] += r.clicks
        slot["impressions"] += r.impressions
        # If we have prev period data (set by gsc_ingestor in the row)
        # NOTE: GscRow doesn't carry _prev; we need to get them from the DB join.
        # In practice the analyst loads from gsc_url_query_metrics which has _prev
        # columns. For now we rely on a separate aggregation that the handler will
        # pass via ctx. See handler.run() — it builds gsc_rows from the DB rows
        # that already have clicks_prev populated.
        slot["clicks_prev"] += getattr(r, "clicks_prev", 0) or 0
        slot["impressions_prev"] += getattr(r, "impressions_prev", 0) or 0
        slot["queries"].append(r)

    out: list[OpportunityCandidate] = []
    for url, slot in by_url.items():
        clicks = slot["clicks"]
        clicks_prev = slot["clicks_prev"]

        if clicks_prev < MIN_BASELINE_CLICKS:
            continue
        drop = clicks_prev - clicks
        if drop <= 0:
            continue
        drop_pct = drop / clicks_prev
        if drop_pct < MIN_DROP_PCT:
            continue

        # Top queries lost (largest delta in clicks)
        per_query: dict[str, dict] = defaultdict(lambda: {
            "clicks": 0, "clicks_prev": 0,
            "position": 0.0, "position_prev": 0.0,
            "count": 0,
        })
        for r in slot["queries"]:
            q = per_query[r.query]
            q["clicks"] += r.clicks
            q["clicks_prev"] += getattr(r, "clicks_prev", 0) or 0
            q["position"] += r.position
            q["position_prev"] += getattr(r, "position_prev", 0) or 0
            q["count"] += 1

        top_lost = sorted(
            (
                {
                    "query": q,
                    "clicks": v["clicks"],
                    "clicks_prev": v["clicks_prev"],
                    "clicks_delta": v["clicks"] - v["clicks_prev"],
                    "position": round(v["position"] / max(v["count"], 1), 2),
                    "position_prev": round(v["position_prev"] / max(v["count"], 1), 2),
                }
                for q, v in per_query.items()
                if v["clicks_prev"] > v["clicks"]
            ),
            key=lambda x: x["clicks_delta"],
        )[:5]

        ci = ctx.content_item_by_url.get(url)
        out.append(OpportunityCandidate(
            category="decay",
            article_url=url,
            article_title=ci.title if ci else "",
            article_language=ci.language if ci else None,
            content_item_id=ci.content_item_id if ci else None,
            evidence={
                "clicks_current": clicks,
                "clicks_yoy": clicks_prev,
                "drop_clicks": drop,
                "drop_pct": round(drop_pct, 3),
                "top_queries_lost": top_lost,
            },
            recommendation_summary=(
                f"Artículo en caída — perdió {drop} clicks YoY ({drop_pct:.0%}). "
                f"Refrescar secciones que cubrían: {', '.join(q['query'] for q in top_lost[:3])}."
            ),
            recommendation_details={
                "action": "refresh_content",
                "focus_queries": [q["query"] for q in top_lost],
                "rationale": "Queries con caída de clicks YoY indican que el contenido perdió relevancia o frescura.",
            },
            traffic_potential=float(drop) * 1.5,
            confidence="high",
            effort_level="medium",
            dedupe_signature=url,
        ))

    return out
