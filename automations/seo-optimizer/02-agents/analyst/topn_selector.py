"""Top-N selector — applies dedupe + filters + scoring to pick the final opportunities.

Pipeline:
    All candidates (from 6 categories)
        ↓
    Compute final score + dedupe_key per candidate
        ↓
    Filter: exclude active rejections (rejection_log where reopened=false)
        ↓
    Filter: exclude content_items implemented in last 45 days (still observing)
        ↓
    Sort by score desc, take top N applying max-2-per-article rule
        ↓
    Assign rank_within_client
"""
from __future__ import annotations

from collections import defaultdict

import structlog

from _shared.scoring import final_score, make_dedupe_key
from _shared.supabase_client import sb
from analyst.types import OpportunityCandidate


log = structlog.get_logger()


TOP_N_PER_CLIENT = 10
MAX_OPPS_PER_ARTICLE = 2
OBSERVATION_WINDOW_DAYS = 45


def select_topn(
    *,
    client_id: str,
    candidates: list[OpportunityCandidate],
    top_n: int = TOP_N_PER_CLIENT,
) -> list[OpportunityCandidate]:
    """Filter + score + pick top-N for one client."""

    # 1. Compute score + dedupe_key for each candidate
    for c in candidates:
        c.dedupe_key = make_dedupe_key(
            client_id=client_id,
            content_item_id=c.content_item_id,
            category=c.category,
            evidence_signature=c.dedupe_signature,
        )
        c.score = final_score(
            traffic_potential=c.traffic_potential,
            confidence=c.confidence,
            effort=c.effort_level,
        )

    # 2. Fetch active rejection keys for this client
    rejected_keys = _fetch_active_rejection_keys(client_id)
    if rejected_keys:
        candidates = [c for c in candidates if c.dedupe_key not in rejected_keys]

    # 3. Fetch content_item_ids implemented in last 45 days
    in_window = _fetch_recently_implemented_content_items(client_id, days=OBSERVATION_WINDOW_DAYS)
    if in_window:
        candidates = [c for c in candidates if not c.content_item_id or c.content_item_id not in in_window]

    # 4. Sort + select with max-2-per-article rule
    candidates.sort(key=lambda c: -c.score)
    per_article: dict[str | None, int] = defaultdict(int)
    selected: list[OpportunityCandidate] = []
    for c in candidates:
        if len(selected) >= top_n:
            break
        if c.content_item_id and per_article[c.content_item_id] >= MAX_OPPS_PER_ARTICLE:
            continue
        selected.append(c)
        per_article[c.content_item_id] = per_article.get(c.content_item_id, 0) + 1

    log.info(
        "topn_selected",
        client_id=client_id,
        total_candidates=len(candidates),
        selected=len(selected),
        rejected_filtered=len(rejected_keys),
        observation_window_filtered=len(in_window),
    )
    return selected


def _fetch_active_rejection_keys(client_id: str) -> set[str]:
    try:
        resp = (
            sb.schema("seo_optimizer")
            .table("rejection_log")
            .select("dedupe_key")
            .eq("client_id", client_id)
            .eq("reopened", False)
            .execute()
        )
        return {r["dedupe_key"] for r in (resp.data or [])}
    except Exception as exc:  # noqa: BLE001
        log.warning("rejection_log_fetch_failed", error=str(exc))
        return set()


def _fetch_recently_implemented_content_items(client_id: str, *, days: int) -> set[str]:
    """content_item_ids whose latest implementation is within the observation window."""
    try:
        resp = (
            sb.schema("seo_optimizer")
            .table("opportunities")
            .select("content_item_id, implemented_at, status")
            .eq("client_id", client_id)
            .in_("status", ["implemented", "observing"])
            .execute()
        )
        from datetime import datetime, timedelta, timezone
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        out: set[str] = set()
        for r in (resp.data or []):
            if not r.get("content_item_id") or not r.get("implemented_at"):
                continue
            try:
                impl = datetime.fromisoformat(r["implemented_at"].replace("Z", "+00:00"))
            except (TypeError, ValueError):
                continue
            if impl >= cutoff:
                out.add(r["content_item_id"])
        return out
    except Exception as exc:  # noqa: BLE001
        log.warning("recently_implemented_fetch_failed", error=str(exc))
        return set()
