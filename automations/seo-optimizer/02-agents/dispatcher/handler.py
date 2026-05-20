"""Dispatcher — enqueues Slack notifications to notifications_outbox.

Two modes:
  - run(run_id=...)              → end-of-run summary for SEO specialist (per client)
  - run(opportunity_id=..., recipient='redactor') → notify redactor of ready rewrite

Notifications go to public.notifications_outbox with source='seo_optimizer'.
The outbox_worker picks them up and POSTs to Slack.

TBD (resolve when frontend lives at a known URL):
  - ORBIT_FRONTEND_URL env var
  - Per-client SEO specialist mapping (currently uses SLACK_FALLBACK_CHANNEL)
"""
from __future__ import annotations

import os
from collections import Counter

import structlog
from fastapi import Header
from pydantic import BaseModel

from _shared import orbit, run_events, slack_blockkit
from _shared.secret import verify
from _shared.supabase_client import sb


log = structlog.get_logger()


class DispatcherPayload(BaseModel):
    run_id: str | None = None
    opportunity_id: str | None = None
    recipient: str = "seo"   # 'seo' | 'redactor'


# ---------------------------------------------------------------------------
# Internal core
# ---------------------------------------------------------------------------
def run(
    *,
    run_id: str | None = None,
    opportunity_id: str | None = None,
    recipient: str = "seo",
) -> dict:
    if opportunity_id:
        return _dispatch_redactor(opportunity_id)
    if run_id:
        return _dispatch_seo_summary(run_id)
    return {"status": "noop", "reason": "no run_id or opportunity_id provided"}


def _dispatch_seo_summary(run_id: str) -> dict:
    """Per client with ≥1 opportunity in this run, enqueue a Slack notification."""

    # 1. Group opportunities by client
    resp = (
        sb.schema("seo_optimizer")
        .table("opportunities")
        .select("client_id, category")
        .eq("run_id", run_id)
        .eq("status", "pending")
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return {"status": "ok", "enqueued": 0, "reason": "no_opportunities"}

    per_client: dict[str, Counter] = {}
    for r in rows:
        c = per_client.setdefault(r["client_id"], Counter())
        c[r["category"]] += 1

    frontend_url = os.environ.get("ORBIT_FRONTEND_URL", "https://orbit.example.com")
    fallback_channel = os.environ.get("SLACK_FALLBACK_CHANNEL", "")

    enqueued = 0
    skipped = 0
    for client_id, by_cat in per_client.items():
        client = orbit.get_client(client_id)
        client_name = client.name if client else f"(cliente {client_id[:8]})"
        total = sum(by_cat.values())
        review_url = f"{frontend_url.rstrip('/')}/seo-optimizer/run/{run_id}?client={client_id}"

        payload = slack_blockkit.build_seo_notification(
            client_name=client_name,
            run_id=run_id,
            opportunities_count=total,
            by_category=dict(by_cat),
            review_url=review_url,
        )

        target_channel = _resolve_seo_channel(client_id) or fallback_channel
        if not target_channel:
            skipped += 1
            run_events.emit(run_id=run_id, client_id=client_id, event_source="dispatcher",
                            event_type="warning",
                            error_message="no Slack channel resolved and no fallback configured")
            continue

        dedupe = f"seo_optimizer:{run_id}:{client_id}:seo_summary:v1"
        try:
            sb.table("notifications_outbox").upsert({
                "source": "seo_optimizer",
                "target_type": "slack_channel",
                "channel_id": target_channel,
                "payload": payload,
                "dedupe_key": dedupe,
                "status": "pending",
            }, on_conflict="dedupe_key").execute()
            enqueued += 1
        except Exception as exc:  # noqa: BLE001
            log.error("outbox_enqueue_failed", error=str(exc), client_id=client_id)
            run_events.emit(run_id=run_id, client_id=client_id, event_source="dispatcher",
                            event_type="warning",
                            error_message=f"outbox upsert failed: {exc}")

    run_events.emit(run_id=run_id, event_source="dispatcher",
                    event_type="opportunity_dispatched",
                    payload={"enqueued": enqueued, "skipped": skipped,
                             "clients_notified": list(per_client.keys())})
    return {"status": "ok", "enqueued": enqueued, "skipped": skipped}


def _dispatch_redactor(opportunity_id: str) -> dict:
    """Notify the redactor that a rewrite is ready for them."""
    # Load opportunity + rewrite
    opp = (
        sb.schema("seo_optimizer")
        .table("opportunities")
        .select("id, run_id, client_id, article_url, article_title, category")
        .eq("id", opportunity_id)
        .single()
        .execute()
        .data
    )
    if not opp:
        return {"status": "failed", "reason": "opportunity_not_found"}

    rewrite = (
        sb.schema("seo_optimizer")
        .table("opportunity_rewrites")
        .select("id, change_summary")
        .eq("opportunity_id", opportunity_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if not rewrite:
        return {"status": "failed", "reason": "no_rewrite_exists"}
    rewrite = rewrite[0]

    client = orbit.get_client(opp["client_id"])
    client_name = client.name if client else "(cliente)"
    frontend_url = os.environ.get("ORBIT_FRONTEND_URL", "https://orbit.example.com")
    inbox_url = f"{frontend_url.rstrip('/')}/seo-optimizer/inbox/{opportunity_id}"

    payload = slack_blockkit.build_writer_notification(
        client_name=client_name,
        article_title=opp.get("article_title") or "(sin título)",
        article_url=opp["article_url"],
        category=opp["category"],
        change_summary=rewrite["change_summary"],
        inbox_url=inbox_url,
    )

    target_channel = _resolve_redactor_channel(opp["client_id"]) or os.environ.get("SLACK_FALLBACK_CHANNEL", "")
    if not target_channel:
        return {"status": "skipped", "reason": "no_channel"}

    dedupe = f"seo_optimizer:redactor:{opportunity_id}:v1"
    try:
        sb.table("notifications_outbox").upsert({
            "source": "seo_optimizer",
            "target_type": "slack_channel",
            "channel_id": target_channel,
            "payload": payload,
            "dedupe_key": dedupe,
            "status": "pending",
        }, on_conflict="dedupe_key").execute()
    except Exception as exc:  # noqa: BLE001
        log.error("redactor_outbox_failed", error=str(exc))
        return {"status": "failed", "reason": "outbox_error", "error": str(exc)}

    run_events.emit(run_id=opp["run_id"], client_id=opp["client_id"], event_source="dispatcher",
                    event_type="opportunity_dispatched",
                    payload={"opportunity_id": opportunity_id, "recipient": "redactor"})
    return {"status": "ok"}


def _resolve_seo_channel(client_id: str) -> str | None:
    """Per-client SEO specialist Slack channel.

    TBD: when Orbit has a "client_seo_assignments" or "brand_team_routing"-like
    table for seo_optimizer, query it here. For now, returns None → fallback.
    """
    return None


def _resolve_redactor_channel(client_id: str) -> str | None:
    """Per-client redactor channel. TBD same as above."""
    return None


# ---------------------------------------------------------------------------
# FastAPI handler
# ---------------------------------------------------------------------------
async def handle(
    payload: DispatcherPayload,
    x_internal_secret: str | None = Header(default=None),
) -> dict:
    verify(x_internal_secret)
    return run(
        run_id=payload.run_id,
        opportunity_id=payload.opportunity_id,
        recipient=payload.recipient,
    )
