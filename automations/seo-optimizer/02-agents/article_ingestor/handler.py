"""Article ingestor — fetches HTML of URLs that GSC says are receiving traffic.

For each URL with non-trivial impressions:
  1. Try to fetch live HTML (timeout 10s, realistic User-Agent).
  2. If fetch fails or content is too small, fallback to public.content_items.article_content.
  3. Parse with html_utils.parse_html.
  4. INSERT into seo_optimizer.article_snapshots.

Returns a summary: {snapshots_inserted, live, fallback, failed}.
"""
from __future__ import annotations

import structlog
import httpx
from fastapi import Header
from pydantic import BaseModel

from _shared import html_utils, orbit, run_events
from _shared.secret import verify
from _shared.supabase_client import sb


log = structlog.get_logger()


USER_AGENT = (
    "Mozilla/5.0 (compatible; SeoOptimizerBot/1.0; +https://orbit.example.com/bot)"
)
FETCH_TIMEOUT_S = 10.0
MIN_HTML_LEN = 500     # below this we consider the live fetch failed
MIN_IMPRESSIONS = 50   # ignore URLs with very low traffic — not worth snapshotting


class ArticleIngestorPayload(BaseModel):
    run_id: str
    client_id: str
    max_urls: int = 200    # safety cap per client


# ---------------------------------------------------------------------------
# Internal core
# ---------------------------------------------------------------------------
def run(*, run_id: str, client_id: str, max_urls: int = 200) -> dict:
    """For each URL discovered by gsc_ingestor (this run, this client), snapshot it."""

    # 1. Discover URLs with meaningful impressions
    resp = (
        sb.schema("seo_optimizer")
        .table("gsc_url_query_metrics")
        .select("url, impressions")
        .eq("run_id", run_id)
        .eq("client_id", client_id)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        run_events.emit(run_id=run_id, client_id=client_id, event_source="article_ingestor",
                        event_type="warning", error_message="no gsc metrics found for this run+client")
        return {"status": "ok", "snapshots_inserted": 0, "live": 0, "fallback": 0, "failed": 0}

    # Aggregate impressions per URL
    by_url: dict[str, int] = {}
    for r in rows:
        u = r["url"]
        by_url[u] = by_url.get(u, 0) + int(r["impressions"] or 0)

    # Filter low-traffic URLs and cap
    candidates = sorted(
        ((u, imps) for u, imps in by_url.items() if imps >= MIN_IMPRESSIONS),
        key=lambda x: -x[1],
    )[:max_urls]

    run_events.emit(run_id=run_id, client_id=client_id, event_source="article_ingestor",
                    event_type="agent_started",
                    payload={"urls_to_snapshot": len(candidates), "min_impressions": MIN_IMPRESSIONS})

    live = 0
    fallback = 0
    failed = 0
    snapshots: list[dict] = []

    with httpx.Client(timeout=FETCH_TIMEOUT_S, follow_redirects=True,
                      headers={"User-Agent": USER_AGENT}) as http:
        for url, _imps in candidates:
            source, html, error = _fetch_or_fallback(http, client_id=client_id, url=url)
            if source == "live":
                live += 1
            elif source == "content_items":
                fallback += 1
            else:
                failed += 1

            content_item = orbit.get_content_item_by_url(client_id, url) if source != "live" else None
            # If live succeeded, also try to enrich with content_item_id (so we can FK)
            if source == "live":
                content_item = orbit.get_content_item_by_url(client_id, url)

            parsed = html_utils.parse_html(html or "")

            snapshots.append({
                "run_id": run_id,
                "client_id": client_id,
                "content_item_id": content_item.content_item_id if content_item else None,
                "content_item_version": content_item.version if content_item else None,
                "url": url,
                "source": source,
                "html": html,
                "title_tag": parsed.title_tag,
                "meta_description": parsed.meta_description,
                "h1": parsed.h1,
                "headings": parsed.headings,
                "word_count": parsed.word_count,
                "error_message": error,
            })

    # Upsert snapshots
    try:
        sb.schema("seo_optimizer").table("article_snapshots").upsert(
            snapshots, on_conflict="run_id,client_id,url",
        ).execute()
        inserted = len(snapshots)
    except Exception as exc:  # noqa: BLE001
        run_events.emit(run_id=run_id, client_id=client_id, event_source="article_ingestor",
                        event_type="agent_failed",
                        error_message=f"snapshot upsert failed: {exc}")
        return {"status": "failed", "reason": "upsert_failed", "error": str(exc)}

    result = {"status": "ok", "snapshots_inserted": inserted,
              "live": live, "fallback": fallback, "failed": failed}
    run_events.emit(run_id=run_id, client_id=client_id, event_source="article_ingestor",
                    event_type="agent_completed", payload=result)
    return result


def _fetch_or_fallback(http: httpx.Client, *, client_id: str, url: str) -> tuple[str, str | None, str | None]:
    """Try live fetch; if that fails, fallback to content_items.article_content.

    Returns (source, html_or_none, error_or_none).
    source ∈ {'live', 'content_items', 'fallback_failed'}.
    """
    try:
        r = http.get(url)
        if r.status_code == 200 and len(r.text) >= MIN_HTML_LEN:
            return "live", r.text, None
        live_error = f"http {r.status_code} or short body ({len(r.text)} chars)"
    except Exception as exc:  # noqa: BLE001
        live_error = f"fetch exception: {exc}"

    # Fallback
    ci = orbit.get_content_item_by_url(client_id, url)
    if ci and ci.article_content:
        return "content_items", ci.article_content, f"live failed: {live_error}"

    return "fallback_failed", None, f"live failed: {live_error}; content_items has no body"


# ---------------------------------------------------------------------------
# FastAPI handler
# ---------------------------------------------------------------------------
async def handle(
    payload: ArticleIngestorPayload,
    x_internal_secret: str | None = Header(default=None),
) -> dict:
    verify(x_internal_secret)
    return run(run_id=payload.run_id, client_id=payload.client_id, max_urls=payload.max_urls)
