"""GSC ingestor — pulls Google Search Console data for one client and run.

Called by the orchestrator (in-process via run()) or directly via HTTP for
manual runs / testing.

Pulls TWO date ranges:
  - Current: [period_start, period_end]  (last 90 days by default)
  - YoY:     same length, 365 days earlier  (baseline for decay detection)

Then UPSERTs into seo_optimizer.gsc_url_query_metrics with the YoY columns
merged into the current-period rows by (url, query, country, device).
"""
from __future__ import annotations

from datetime import date, timedelta

import structlog
from fastapi import Header
from pydantic import BaseModel

from _shared import gsc_api, orbit, run_events
from _shared.secret import verify
from _shared.supabase_client import sb


log = structlog.get_logger()


class GscIngestorPayload(BaseModel):
    run_id: str
    client_id: str
    period_start: str | None = None   # ISO date; if missing, computed from period_days
    period_end: str | None = None
    period_days: int = 90


# ---------------------------------------------------------------------------
# Internal core (called by orchestrator in-process)
# ---------------------------------------------------------------------------
def run(
    *,
    run_id: str,
    client_id: str,
    period_start: date,
    period_end: date,
) -> dict:
    """Execute the GSC ingestion for one client. Returns a result dict."""
    client = orbit.get_client(client_id)
    if not client:
        msg = f"client {client_id} not found in public.clientes"
        run_events.emit(run_id=run_id, client_id=client_id, event_source="gsc_ingestor",
                        event_type="agent_failed", error_message=msg)
        return {"status": "failed", "reason": "client_not_found"}

    if not client.gsc_property_url:
        msg = f"client {client.name} has no gsc_property_url configured"
        run_events.emit(run_id=run_id, client_id=client_id, event_source="gsc_ingestor",
                        event_type="agent_failed", error_message=msg)
        return {"status": "skipped", "reason": "no_gsc_property"}

    run_events.emit(run_id=run_id, client_id=client_id, event_source="gsc_ingestor",
                    event_type="agent_started",
                    payload={"site": client.gsc_property_url,
                             "period": [period_start.isoformat(), period_end.isoformat()]})

    period_len = (period_end - period_start).days + 1
    prev_end = period_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=365 + period_len)  # 1 year before, same length
    prev_start = prev_start + timedelta(days=period_len)       # adjust to make length equal
    # Re-derive cleanly:
    prev_end = period_end - timedelta(days=365)
    prev_start = period_start - timedelta(days=365)

    # 1. Current period
    try:
        cur_rows = gsc_api.query_search_analytics(
            site_url=client.gsc_property_url,
            start_date=period_start,
            end_date=period_end,
            dimensions=["page", "query"],
        )
    except Exception as exc:  # noqa: BLE001
        run_events.emit(run_id=run_id, client_id=client_id, event_source="gsc_ingestor",
                        event_type="agent_failed", error_message=f"current period: {exc}")
        return {"status": "failed", "reason": "gsc_current_failed", "error": str(exc)}

    # 2. YoY period (best-effort — if it fails we still write current data)
    prev_index: dict[tuple, gsc_api.GscRow] = {}
    try:
        prev_rows = gsc_api.query_search_analytics(
            site_url=client.gsc_property_url,
            start_date=prev_start,
            end_date=prev_end,
            dimensions=["page", "query"],
        )
        for r in prev_rows:
            prev_index[(r.url, r.query, r.country or "", r.device or "")] = r
    except Exception as exc:  # noqa: BLE001
        run_events.emit(run_id=run_id, client_id=client_id, event_source="gsc_ingestor",
                        event_type="warning",
                        error_message=f"YoY pull failed (continuing without it): {exc}")

    # 3. UPSERT
    rows_to_upsert: list[dict] = []
    for r in cur_rows:
        key = (r.url, r.query, r.country or "", r.device or "")
        prev = prev_index.get(key)
        rows_to_upsert.append({
            "run_id": run_id,
            "client_id": client_id,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "url": r.url,
            "query": r.query,
            "country": r.country,
            "device": r.device,
            "clicks": r.clicks,
            "impressions": r.impressions,
            "ctr": round(r.ctr, 4),
            "position": round(r.position, 2),
            "clicks_prev": prev.clicks if prev else None,
            "impressions_prev": prev.impressions if prev else None,
            "ctr_prev": round(prev.ctr, 4) if prev else None,
            "position_prev": round(prev.position, 2) if prev else None,
        })

    # Insert in batches of 1000
    BATCH = 1000
    total_inserted = 0
    for i in range(0, len(rows_to_upsert), BATCH):
        chunk = rows_to_upsert[i : i + BATCH]
        try:
            sb.schema("seo_optimizer").table("gsc_url_query_metrics").upsert(
                chunk,
                on_conflict="run_id,client_id,url,query,country,device",
            ).execute()
            total_inserted += len(chunk)
        except Exception as exc:  # noqa: BLE001
            run_events.emit(run_id=run_id, client_id=client_id, event_source="gsc_ingestor",
                            event_type="warning",
                            error_message=f"batch upsert failed (chunk {i}): {exc}")

    result = {
        "status": "ok",
        "rows_inserted": total_inserted,
        "rows_current": len(cur_rows),
        "rows_prev": len(prev_index),
    }
    run_events.emit(run_id=run_id, client_id=client_id, event_source="gsc_ingestor",
                    event_type="agent_completed", payload=result)
    return result


# ---------------------------------------------------------------------------
# FastAPI handler (external entry)
# ---------------------------------------------------------------------------
async def handle(
    payload: GscIngestorPayload,
    x_internal_secret: str | None = Header(default=None),
) -> dict:
    verify(x_internal_secret)

    period_end = date.fromisoformat(payload.period_end) if payload.period_end else date.today() - timedelta(days=3)
    period_start = (
        date.fromisoformat(payload.period_start)
        if payload.period_start
        else period_end - timedelta(days=payload.period_days)
    )

    return run(
        run_id=payload.run_id,
        client_id=payload.client_id,
        period_start=period_start,
        period_end=period_end,
    )
