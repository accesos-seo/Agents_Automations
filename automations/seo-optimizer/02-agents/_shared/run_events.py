"""Helper for emitting run_events.

Every agent emits structured events to `seo_optimizer.run_events` for full
traceability. This module is the only place that writes to that table.
"""
from __future__ import annotations

import structlog
from typing import Literal

from _shared.supabase_client import sb


log = structlog.get_logger()


EventType = Literal[
    "run_started", "run_completed", "run_failed",
    "agent_started", "agent_completed", "agent_failed",
    "opportunity_detected", "opportunity_dispatched",
    "approval_received", "rewrite_generated", "implementation_marked",
    "reeval_completed", "warning",
]


def emit(
    *,
    run_id: str,
    event_source: str,
    event_type: EventType,
    client_id: str | None = None,
    payload: dict | None = None,
    error_message: str | None = None,
) -> None:
    """Append an event to seo_optimizer.run_events.

    Failure here is non-fatal — we log to stdout (Railway captures it) and
    move on. We never want event emission to break the main pipeline.
    """
    row = {
        "run_id": run_id,
        "client_id": client_id,
        "event_source": event_source,
        "event_type": event_type,
        "payload": payload or {},
        "error_message": error_message,
    }
    try:
        sb.schema("seo_optimizer").table("run_events").insert(row).execute()
    except Exception as exc:  # noqa: BLE001
        log.warning(
            "run_event_emit_failed",
            run_id=run_id, event_type=event_type, error=str(exc),
        )

    # Always mirror to stdout for Railway log searchability
    log.info(
        "run_event",
        run_id=run_id,
        client_id=client_id,
        event_source=event_source,
        event_type=event_type,
        payload=payload,
        error_message=error_message,
    )
