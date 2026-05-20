"""Orchestrator — entry point of the monthly pipeline.

Triggered by pg_cron `seo-optimizer-monthly` or manually for testing.

Flow:
  1. Create a row in seo_optimizer.runs (status='running').
  2. List active clients in public.clientes (or use payload.client_ids).
  3. For each client (bounded concurrency):
        - gsc_ingestor.run(...)
        - article_ingestor.run(...)
  4. analyst.run(run_id=...)         — applies 6 categories, produces opportunities
  5. dispatcher.run(run_id=...)       — enqueues Slack notifications to SEO
  6. Update runs(status='completed'|'partial'|'failed', completed_at).
"""
from __future__ import annotations

import asyncio
from datetime import date, timedelta

import structlog
from fastapi import Header
from pydantic import BaseModel

from _shared import orbit, run_events
from _shared.secret import verify
from _shared.supabase_client import sb


log = structlog.get_logger()


MAX_CONCURRENT_CLIENTS = 3   # respects GSC rate limits


class OrchestratorPayload(BaseModel):
    trigger: str = "manual"        # 'cron' | 'manual'
    client_ids: list[str] | None = None
    period_days: int = 90


# ---------------------------------------------------------------------------
# FastAPI handler (and main entry — orchestrator is the top of the chain)
# ---------------------------------------------------------------------------
async def handle(
    payload: OrchestratorPayload,
    x_internal_secret: str | None = Header(default=None),
) -> dict:
    verify(x_internal_secret)

    # Compute the analysis window
    period_end = date.today() - timedelta(days=3)   # GSC data lags 2-3 days
    period_start = period_end - timedelta(days=payload.period_days)
    period_prev_end = period_end - timedelta(days=365)
    period_prev_start = period_start - timedelta(days=365)

    # 1. Create run row
    run_resp = (
        sb.schema("seo_optimizer")
        .table("runs")
        .insert({
            "trigger_source": payload.trigger if payload.trigger in ("cron", "manual", "watchdog_retry") else "manual",
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "period_prev_start": period_prev_start.isoformat(),
            "period_prev_end": period_prev_end.isoformat(),
            "status": "running",
        })
        .execute()
    )
    run_id = run_resp.data[0]["id"]
    log.info("run_created", run_id=run_id, period=[period_start.isoformat(), period_end.isoformat()])
    run_events.emit(run_id=run_id, event_source="orchestrator", event_type="run_started",
                    payload={"trigger": payload.trigger,
                             "period": [period_start.isoformat(), period_end.isoformat()]})

    # 2. List clients
    clients = orbit.list_active_clients(payload.client_ids)
    if not clients:
        sb.schema("seo_optimizer").table("runs").update({
            "status": "failed", "error_message": "no active clients", "completed_at": "now()",
        }).eq("id", run_id).execute()
        run_events.emit(run_id=run_id, event_source="orchestrator", event_type="run_failed",
                        error_message="no active clients found")
        return {"run_id": run_id, "status": "failed", "reason": "no_active_clients"}

    sb.schema("seo_optimizer").table("runs").update({
        "clients_total": len(clients),
    }).eq("id", run_id).execute()

    # 3. Fan-out: ingest per client with bounded concurrency
    processed = 0
    failed = 0
    sem = asyncio.Semaphore(MAX_CONCURRENT_CLIENTS)

    async def _ingest_one(client: orbit.OrbitClient) -> bool:
        async with sem:
            # Run synchronous code in a thread to not block event loop
            try:
                gsc_result = await asyncio.to_thread(
                    _import_run, "gsc_ingestor",
                    run_id=run_id, client_id=client.id,
                    period_start=period_start, period_end=period_end,
                )
                if gsc_result.get("status") not in ("ok", "skipped"):
                    return False

                if gsc_result.get("status") == "ok":
                    await asyncio.to_thread(
                        _import_run, "article_ingestor",
                        run_id=run_id, client_id=client.id, max_urls=200,
                    )
                return True
            except Exception as exc:  # noqa: BLE001
                log.error("client_ingest_failed", client_id=client.id, error=str(exc))
                run_events.emit(run_id=run_id, client_id=client.id, event_source="orchestrator",
                                event_type="agent_failed", error_message=str(exc))
                return False

    results = await asyncio.gather(*(_ingest_one(c) for c in clients), return_exceptions=False)
    processed = sum(1 for ok in results if ok)
    failed = len(clients) - processed

    sb.schema("seo_optimizer").table("runs").update({
        "clients_processed": processed,
        "clients_failed": failed,
    }).eq("id", run_id).execute()

    # 4. Analyst
    try:
        from analyst import handler as analyst_handler
        analyst_result = await asyncio.to_thread(analyst_handler.run, run_id=run_id)
    except Exception as exc:  # noqa: BLE001
        log.error("analyst_failed", error=str(exc))
        run_events.emit(run_id=run_id, event_source="orchestrator", event_type="agent_failed",
                        error_message=f"analyst: {exc}")
        analyst_result = {"status": "failed", "error": str(exc)}

    # 5. Dispatcher
    try:
        from dispatcher import handler as dispatcher_handler
        dispatch_result = await asyncio.to_thread(dispatcher_handler.run, run_id=run_id)
    except Exception as exc:  # noqa: BLE001
        log.error("dispatcher_failed", error=str(exc))
        run_events.emit(run_id=run_id, event_source="orchestrator", event_type="agent_failed",
                        error_message=f"dispatcher: {exc}")
        dispatch_result = {"status": "failed", "error": str(exc)}

    # 6. Final status
    if failed == 0 and analyst_result.get("status") == "ok":
        final_status = "completed"
    elif processed > 0:
        final_status = "partial"
    else:
        final_status = "failed"

    sb.schema("seo_optimizer").table("runs").update({
        "status": final_status,
        "completed_at": "now()",
    }).eq("id", run_id).execute()

    run_events.emit(run_id=run_id, event_source="orchestrator",
                    event_type="run_completed" if final_status == "completed" else "run_failed",
                    payload={
                        "final_status": final_status,
                        "clients_total": len(clients),
                        "clients_processed": processed,
                        "clients_failed": failed,
                        "analyst": analyst_result,
                        "dispatch": dispatch_result,
                    })

    return {
        "run_id": run_id,
        "status": final_status,
        "clients_total": len(clients),
        "clients_processed": processed,
        "clients_failed": failed,
        "analyst": analyst_result,
        "dispatch": dispatch_result,
    }


# Helper to dynamically import a handler's run() without circular imports at top level
def _import_run(module_name: str, **kwargs):
    if module_name == "gsc_ingestor":
        from gsc_ingestor import handler as h
    elif module_name == "article_ingestor":
        from article_ingestor import handler as h
    else:
        raise ValueError(f"unknown module {module_name}")
    return h.run(**kwargs)
