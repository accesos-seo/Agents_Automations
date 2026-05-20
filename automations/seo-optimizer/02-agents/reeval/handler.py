"""Re-evaluation handler — measures impact 45 days after implementation.

Two endpoints:
  - /reeval         → single opportunity_id evaluation
  - /reeval/batch   → finds all opportunities reeval_due_at <= today and processes them

Flow for each:
  1. Load opportunity + the GSC URL of the article.
  2. Pull GSC data for that URL for two 30-day windows:
       - 'before':  30 days ending 1 day before implemented_at
       - 'after':   last 30 days (ending today - 3 days for GSC lag)
  3. Compute deltas: clicks, position, impressions.
  4. Classify outcome: improved / unchanged / worsened / inconclusive.
  5. INSERT seo_optimizer.reeval_results.
  6. UPDATE opportunity.status:
       - improved → closed
       - unchanged or worsened → observing (keep watching)
       - inconclusive → observing
  7. If worsened, enqueue alert to SEO via outbox.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import structlog
from fastapi import Header
from pydantic import BaseModel

from _shared import gsc_api, orbit, run_events, slack_blockkit
from _shared.secret import verify
from _shared.supabase_client import sb


log = structlog.get_logger()


MIN_CLICKS_FOR_VERDICT = 100   # if total < this, outcome='inconclusive'
IMPROVED_CLICKS_THRESHOLD = 0.20   # +20%
IMPROVED_POSITION_THRESHOLD = -2.0  # 2 positions better
WORSENED_CLICKS_THRESHOLD = -0.20
WORSENED_POSITION_THRESHOLD = 2.0


class ReevalPayload(BaseModel):
    opportunity_id: str


class ReevalBatchPayload(BaseModel):
    max_per_batch: int = 50


# ---------------------------------------------------------------------------
# Single reeval
# ---------------------------------------------------------------------------
def run(*, opportunity_id: str) -> dict:
    opp = (
        sb.schema("seo_optimizer")
        .table("opportunities")
        .select("id, run_id, client_id, content_item_id, article_url, article_title, "
                "implemented_at, reeval_due_at, status, evidence")
        .eq("id", opportunity_id)
        .single()
        .execute()
        .data
    )
    if not opp:
        return {"status": "failed", "reason": "opportunity_not_found"}
    if opp["status"] not in ("implemented", "observing"):
        return {"status": "skipped", "reason": f"status is {opp['status']}"}
    if not opp.get("implemented_at"):
        return {"status": "skipped", "reason": "no implemented_at"}

    client = orbit.get_client(opp["client_id"])
    if not client or not client.gsc_property_url:
        run_events.emit(run_id=opp["run_id"], client_id=opp["client_id"], event_source="reeval",
                        event_type="warning",
                        error_message="client has no gsc_property_url; cannot reeval")
        sb.schema("seo_optimizer").table("opportunities").update({
            "reeval_outcome": "inconclusive",
            "reeval_completed_at": datetime.now(timezone.utc).isoformat(),
            "status": "observing",
        }).eq("id", opportunity_id).execute()
        return {"status": "ok", "outcome": "inconclusive", "reason": "no_gsc_property"}

    # Compute windows
    implemented_at = datetime.fromisoformat(opp["implemented_at"].replace("Z", "+00:00")).date()
    today = date.today()
    after_end = today - timedelta(days=3)              # GSC lag
    after_start = after_end - timedelta(days=29)       # 30-day window inclusive
    before_end = implemented_at - timedelta(days=1)
    before_start = before_end - timedelta(days=29)

    # Pull GSC for the URL, two windows
    try:
        before_rows = gsc_api.query_url_metrics(
            site_url=client.gsc_property_url, url_filter=opp["article_url"],
            start_date=before_start, end_date=before_end,
        )
        after_rows = gsc_api.query_url_metrics(
            site_url=client.gsc_property_url, url_filter=opp["article_url"],
            start_date=after_start, end_date=after_end,
        )
    except Exception as exc:  # noqa: BLE001
        log.error("reeval_gsc_failed", error=str(exc))
        run_events.emit(run_id=opp["run_id"], client_id=opp["client_id"], event_source="reeval",
                        event_type="agent_failed", error_message=str(exc))
        return {"status": "failed", "reason": "gsc_error", "error": str(exc)}

    before = _aggregate(before_rows)
    after = _aggregate(after_rows)

    total_clicks = (before["clicks"] or 0) + (after["clicks"] or 0)
    if total_clicks < MIN_CLICKS_FOR_VERDICT:
        outcome = "inconclusive"
        confidence = "low"
    else:
        outcome, confidence = _classify_outcome(before=before, after=after)

    clicks_delta_pct = _pct_change(before["clicks"], after["clicks"])
    impressions_delta_pct = _pct_change(before["impressions"], after["impressions"])
    position_delta = (
        round(after["position"] - before["position"], 2)
        if (before["position"] is not None and after["position"] is not None)
        else None
    )

    result_row = {
        "opportunity_id": opportunity_id,
        "clicks_before": before["clicks"],
        "clicks_after": after["clicks"],
        "clicks_delta_pct": clicks_delta_pct,
        "position_before": before["position"],
        "position_after": after["position"],
        "position_delta": position_delta,
        "impressions_before": before["impressions"],
        "impressions_after": after["impressions"],
        "impressions_delta_pct": impressions_delta_pct,
        "outcome": outcome,
        "confidence_in_outcome": confidence,
        "notes": None,    # Could call LLM here for narrative; v2.
    }
    sb.schema("seo_optimizer").table("reeval_results").insert(result_row).execute()

    # Update opportunity status
    new_status = "closed" if outcome == "improved" else "observing"
    sb.schema("seo_optimizer").table("opportunities").update({
        "reeval_outcome": outcome,
        "reeval_completed_at": datetime.now(timezone.utc).isoformat(),
        "status": new_status,
    }).eq("id", opportunity_id).execute()

    # If worsened, enqueue alert
    if outcome == "worsened":
        _enqueue_worsened_alert(opp=opp, metrics=result_row, client_name=client.name)

    run_events.emit(run_id=opp["run_id"], client_id=opp["client_id"], event_source="reeval",
                    event_type="reeval_completed",
                    payload={"opportunity_id": opportunity_id, "outcome": outcome,
                             "confidence": confidence})
    return {
        "status": "ok",
        "outcome": outcome,
        "confidence": confidence,
        "metrics": result_row,
    }


def run_batch(*, max_per_batch: int = 50) -> dict:
    """Process all opportunities with reeval_due_at <= today and status='implemented'."""
    today = date.today().isoformat()
    resp = (
        sb.schema("seo_optimizer")
        .table("opportunities")
        .select("id")
        .eq("status", "implemented")
        .lte("reeval_due_at", today)
        .limit(max_per_batch)
        .execute()
    )
    opp_ids = [r["id"] for r in (resp.data or [])]
    if not opp_ids:
        return {"status": "ok", "processed": 0}

    processed = 0
    outcomes: dict[str, int] = {}
    for oid in opp_ids:
        try:
            r = run(opportunity_id=oid)
            if r.get("status") == "ok":
                processed += 1
                outcomes[r.get("outcome", "?")] = outcomes.get(r.get("outcome", "?"), 0) + 1
        except Exception as exc:  # noqa: BLE001
            log.error("reeval_batch_item_failed", opportunity_id=oid, error=str(exc))
    return {"status": "ok", "processed": processed, "outcomes": outcomes}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _aggregate(rows: list[gsc_api.GscRow]) -> dict:
    if not rows:
        return {"clicks": 0, "impressions": 0, "ctr": None, "position": None}
    clicks = sum(r.clicks for r in rows)
    impressions = sum(r.impressions for r in rows)
    # Weighted average position by impressions
    weighted_pos = (
        sum(r.position * r.impressions for r in rows) / impressions
        if impressions > 0
        else sum(r.position for r in rows) / len(rows)
    )
    return {
        "clicks": clicks,
        "impressions": impressions,
        "ctr": (clicks / impressions) if impressions > 0 else 0.0,
        "position": round(weighted_pos, 2),
    }


def _pct_change(before: int | None, after: int | None) -> float | None:
    if not before:
        return None
    return round(((after or 0) - before) / before * 100, 2)


def _classify_outcome(*, before: dict, after: dict) -> tuple[str, str]:
    """Return (outcome, confidence)."""
    clicks_change = _pct_change(before["clicks"], after["clicks"]) or 0.0
    position_change = (
        (after["position"] or 0) - (before["position"] or 0)
        if (before["position"] is not None and after["position"] is not None)
        else 0.0
    )

    improved_signals = 0
    worsened_signals = 0
    if clicks_change >= IMPROVED_CLICKS_THRESHOLD * 100:
        improved_signals += 1
    if clicks_change <= WORSENED_CLICKS_THRESHOLD * 100:
        worsened_signals += 1
    if position_change <= IMPROVED_POSITION_THRESHOLD:
        improved_signals += 1
    if position_change >= WORSENED_POSITION_THRESHOLD:
        worsened_signals += 1

    if improved_signals >= 1 and worsened_signals == 0:
        return "improved", "high" if improved_signals == 2 else "medium"
    if worsened_signals >= 1 and improved_signals == 0:
        return "worsened", "high" if worsened_signals == 2 else "medium"
    if improved_signals == 1 and worsened_signals == 1:
        return "inconclusive", "low"
    return "unchanged", "medium"


def _enqueue_worsened_alert(*, opp: dict, metrics: dict, client_name: str) -> None:
    import os
    fallback = os.environ.get("SLACK_FALLBACK_CHANNEL", "")
    if not fallback:
        return
    payload = slack_blockkit.build_reeval_outcome_alert(
        client_name=client_name,
        article_title=opp.get("article_title") or "(sin título)",
        article_url=opp["article_url"],
        outcome="worsened",
        metrics=metrics,
    )
    dedupe = f"seo_optimizer:reeval_worsened:{opp['id']}:v1"
    try:
        sb.table("notifications_outbox").upsert({
            "source": "seo_optimizer",
            "target_type": "slack_channel",
            "channel_id": fallback,
            "payload": payload,
            "dedupe_key": dedupe,
            "status": "pending",
        }, on_conflict="dedupe_key").execute()
    except Exception as exc:  # noqa: BLE001
        log.warning("worsened_alert_enqueue_failed", error=str(exc))


# ---------------------------------------------------------------------------
# FastAPI handlers
# ---------------------------------------------------------------------------
async def handle(
    payload: ReevalPayload,
    x_internal_secret: str | None = Header(default=None),
) -> dict:
    verify(x_internal_secret)
    return run(opportunity_id=payload.opportunity_id)


async def handle_batch(
    payload: ReevalBatchPayload | None = None,
    x_internal_secret: str | None = Header(default=None),
) -> dict:
    verify(x_internal_secret)
    max_per_batch = payload.max_per_batch if payload else 50
    return run_batch(max_per_batch=max_per_batch)
