"""Category E: Cannibalization — multiple URLs of same client competing for one query.

Detect rule:
  - For each query, find URLs (same client) ranking in top 30
  - If >= 2 URLs AND the position gap between top 2 is < 10 → cannibalization

Score = combined_clicks × 0.7 (medium weight, uncertain fix).
Confidence: medium.  Effort: high (strategic decision).
"""
from __future__ import annotations

from collections import defaultdict

from analyst.types import ClientAnalysisContext, OpportunityCandidate


MAX_RANKING_POSITION = 30.0
MAX_POSITION_GAP_TO_FLAG = 10.0
MIN_COMBINED_CLICKS = 10


def detect(ctx: ClientAnalysisContext) -> list[OpportunityCandidate]:
    # Build: query -> list of (url, position, clicks, impressions)
    per_query: dict[str, list] = defaultdict(list)
    for r in ctx.gsc_rows:
        if r.position <= MAX_RANKING_POSITION:
            per_query[r.query].append({
                "url": r.url,
                "position": r.position,
                "clicks": r.clicks,
                "impressions": r.impressions,
            })

    # Per primary URL, accumulate cannibalization evidence
    # We emit ONE opportunity per (primary_url, query group) pair.
    cannibal_groups: dict[str, dict] = {}    # key = "primary_url"

    for query, entries in per_query.items():
        if len(entries) < 2:
            continue
        entries.sort(key=lambda e: e["position"])
        top_two = entries[:2]
        if top_two[1]["position"] - top_two[0]["position"] > MAX_POSITION_GAP_TO_FLAG:
            continue
        combined_clicks = sum(e["clicks"] for e in entries)
        if combined_clicks < MIN_COMBINED_CLICKS:
            continue

        primary_url = top_two[0]["url"]
        if primary_url not in cannibal_groups:
            cannibal_groups[primary_url] = {
                "competing_urls": set(),
                "queries": [],
                "total_clicks": 0,
            }
        g = cannibal_groups[primary_url]
        for e in entries:
            g["competing_urls"].add(e["url"])
        g["queries"].append({
            "query": query,
            "urls": [{"url": e["url"], "position": round(e["position"], 2), "clicks": e["clicks"]} for e in entries],
            "combined_clicks": combined_clicks,
        })
        g["total_clicks"] += combined_clicks

    out: list[OpportunityCandidate] = []
    for primary_url, g in cannibal_groups.items():
        if len(g["competing_urls"]) < 2:
            continue
        ci = ctx.content_item_by_url.get(primary_url)
        competing = sorted(g["competing_urls"])

        out.append(OpportunityCandidate(
            category="cannibalization",
            article_url=primary_url,
            article_title=ci.title if ci else "",
            article_language=ci.language if ci else None,
            content_item_id=ci.content_item_id if ci else None,
            evidence={
                "competing_urls": competing,
                "queries_affected": g["queries"][:8],
                "total_combined_clicks": g["total_clicks"],
            },
            recommendation_summary=(
                f"{len(competing)} URLs del cliente compiten entre sí por "
                f"{len(g['queries'])} queries (combined: {g['total_clicks']} clicks). "
                "Consolidar o diferenciar intención."
            ),
            recommendation_details={
                "action": "resolve_cannibalization",
                "competing_urls": competing,
                "options": [
                    "Consolidar: redirect 301 del más débil al más fuerte (sumar autoridad)",
                    "Diferenciar: re-enfocar cada URL a una intención distinta (informacional vs comercial)",
                    "Internal linking: hacer que el más débil enlace al más fuerte con anchor relevante",
                ],
            },
            traffic_potential=float(g["total_clicks"]) * 0.7,
            confidence="medium",
            effort_level="high",
            dedupe_signature=":".join(sorted(competing)),
        ))

    return out
