"""Outbox worker — drains notifications_outbox rows and POSTs to Slack.

Triggered by pg_cron `seo-optimizer-outbox-worker` every 30s.

Each invocation:
  1. Claim up to BATCH_SIZE rows: UPDATE ... SET locked_at, locked_by where status='pending'
     using SELECT ... FOR UPDATE SKIP LOCKED semantics via the supabase-py RPC pattern.
     (We use a workaround: UPDATE ... RETURNING with WHERE on locked_at IS NULL.)
  2. For each: POST to Slack chat.postMessage with the payload's blocks.
  3. status='sent' or retry with exponential backoff.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import structlog
from fastapi import Header
from pydantic import BaseModel

from _shared.secret import verify
from _shared.supabase_client import sb


log = structlog.get_logger()


BATCH_SIZE = 10
MAX_RETRIES = 3
SLACK_API = "https://slack.com/api/chat.postMessage"


class OutboxWorkerPayload(BaseModel):
    pass


# ---------------------------------------------------------------------------
# Internal core
# ---------------------------------------------------------------------------
def run() -> dict:
    bot_token = os.environ.get("SLACK_BOT_TOKEN")
    if not bot_token:
        log.warning("outbox_worker_no_slack_token")
        return {"status": "skipped", "reason": "no_slack_token"}

    worker_id = f"railway-{os.environ.get('RAILWAY_REPLICA_ID', uuid.uuid4().hex[:8])}"
    now = datetime.now(timezone.utc)

    # 1. Claim rows: set locked_at and locked_by on up to BATCH_SIZE pending rows
    #    that aren't locked or whose lock is stale (>10 min).
    try:
        claim_resp = (
            sb.table("notifications_outbox")
            .update({
                "locked_at": now.isoformat(),
                "locked_by": worker_id,
            })
            .eq("source", "seo_optimizer")
            .eq("status", "pending")
            .or_("locked_at.is.null,locked_at.lt." + (now - timedelta(minutes=10)).isoformat())
            .lte("next_retry_at", now.isoformat())   # respects backoff
            .execute()
        )
    except Exception:
        # Fallback if the OR filter isn't supported: only claim NULL-locked rows
        claim_resp = (
            sb.table("notifications_outbox")
            .update({
                "locked_at": now.isoformat(),
                "locked_by": worker_id,
            })
            .eq("source", "seo_optimizer")
            .eq("status", "pending")
            .is_("locked_at", "null")
            .execute()
        )

    claimed = claim_resp.data or []
    if not claimed:
        return {"status": "ok", "processed": 0, "sent": 0, "failed": 0}

    # Limit to BATCH_SIZE (in case the UPDATE matched many)
    claimed = claimed[:BATCH_SIZE]

    sent = 0
    failed = 0

    with httpx.Client(timeout=10.0) as http:
        for row in claimed:
            ok, error = _send_slack(http, bot_token=bot_token, row=row)
            if ok:
                sb.table("notifications_outbox").update({
                    "status": "sent",
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                    "locked_at": None,
                    "locked_by": None,
                    "error_message": None,
                }).eq("id", row["id"]).execute()
                sent += 1
            else:
                new_retry_count = (row.get("retry_count") or 0) + 1
                if new_retry_count >= MAX_RETRIES:
                    sb.table("notifications_outbox").update({
                        "status": "failed",
                        "retry_count": new_retry_count,
                        "error_message": error,
                        "locked_at": None,
                        "locked_by": None,
                    }).eq("id", row["id"]).execute()
                    failed += 1
                else:
                    backoff_min = 2 ** new_retry_count
                    next_retry = datetime.now(timezone.utc) + timedelta(minutes=backoff_min)
                    sb.table("notifications_outbox").update({
                        "status": "pending",
                        "retry_count": new_retry_count,
                        "next_retry_at": next_retry.isoformat(),
                        "error_message": error,
                        "locked_at": None,
                        "locked_by": None,
                    }).eq("id", row["id"]).execute()

    return {"status": "ok", "processed": len(claimed), "sent": sent, "failed": failed}


def _send_slack(http: httpx.Client, *, bot_token: str, row: dict) -> tuple[bool, str | None]:
    """Send a single outbox row to Slack. Returns (ok, error_or_none)."""
    payload = row.get("payload") or {}
    body = {
        "channel": row["channel_id"],
        "text": payload.get("text", ""),     # required fallback for accessibility
        "blocks": payload.get("blocks", []),
    }
    try:
        r = http.post(
            SLACK_API,
            json=body,
            headers={
                "Authorization": f"Bearer {bot_token}",
                "Content-Type": "application/json; charset=utf-8",
            },
        )
        if r.status_code != 200:
            return False, f"http {r.status_code}: {r.text[:200]}"
        data = r.json()
        if not data.get("ok"):
            return False, f"slack error: {data.get('error', 'unknown')}"
        return True, None
    except Exception as exc:  # noqa: BLE001
        return False, f"exception: {exc}"


# ---------------------------------------------------------------------------
# FastAPI handler
# ---------------------------------------------------------------------------
async def handle(
    payload: OutboxWorkerPayload | None = None,
    x_internal_secret: str | None = Header(default=None),
) -> dict:
    verify(x_internal_secret)
    return run()
