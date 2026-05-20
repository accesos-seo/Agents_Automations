"""Analyst handler — runs the 6 categories per client and writes opportunities.

Called by orchestrator (in-process via run()) or by HTTP for a re-run.
"""
from __future__ import annotations

from collections import defaultdict

import structlog
from fastapi import Header
from pydantic import BaseModel

from _shared import orbit, run_events
from _shared.gsc_api import GscRow
from _shared.html_utils import parse_html
from _shared.secret import verify
from _shared.supabase_client import sb
from analyst import topn_selector
from analyst.categories import ALL_CATEGORIES
from analyst.types import ArticleSnapshot, ClientAnalysisContext, OpportunityCandidate


log = structlog.get_logger()


class AnalystPayload(BaseModel):
    run_id: str
    client_ids: list[str] | None = None     # if None, all clients with data in this run


# ---------------------------------------------------------------------------
# Internal core
# ---------------------------------------------------------------------------
def run(*, run_id: str, client_ids: list[str] | None = None) -> dict:
    run_events.emit(run_id=run_id, event_source="analyst", event_type="agent_started",
                    payload={"client_ids": client_ids or "all"})

    # Discover client_ids present in this run if not specified
    if not client_ids:
        client_ids = _list_clients_in_run(run_id)
    if not client_ids:
        run_events.emit(run_id=run_id, event_source="analyst", event_type="warning",
                        error_message="no client data found in run")
        return {"status": "ok", "opportunities_inserted": 0, "clients_analyzed": 0}

    total_inserted = 0
    by_category_total: dict[str, int] = defaultdict(int)

    for cid in client_ids:
        try:
            inserted, by_cat = _analyze_client(run_id=run_id, client_id=cid)
            total_inserted += inserted
            for k, v in by_cat.items():
                by_category_total[k] += v
        except Exception as exc:  # noqa: BLE001
            log.error("analyst_client_failed", run_id=run_id, client_id=cid, error=str(exc))
            run_events.emit(run_id=run_id, client_id=cid, event_source="analyst",
                            event_type="agent_failed", error_message=str(exc))

    result = {
        "status": "ok",
        "clients_analyzed": len(client_ids),
        "opportunities_inserted": total_inserted,
        "by_category": dict(by_category_total),
    }
    run_events.emit(run_id=run_id, event_source="analyst",
                    event_type="agent_completed", payload=result)
    return result


def _analyze_client(*, run_id: str, client_id: str) -> tuple[int, dict[str, int]]:
    """Analyze one client; return (count_inserted, by_category_dict)."""
    client = orbit.get_client(client_id)
    if not client:
        return 0, {}

    # 1. Load GSC rows from DB (with YoY columns)
    gsc_rows = _load_gsc_rows(run_id, client_id)
    if not gsc_rows:
        run_events.emit(run_id=run_id, client_id=client_id, event_source="analyst",
                        event_type="warning", error_message="no gsc_rows for client")
        return 0, {}

    # 2. Load snapshots
    snapshots_by_url = _load_snapshots(run_id, client_id)

    # 3. Load content items + analysis index
    content_items = orbit.list_published_articles_for_client(client_id)

    ctx = ClientAnalysisContext(
        run_id=run_id,
        client_id=client_id,
        client_name=client.name,
        gsc_rows=gsc_rows,
        snapshots_by_url=snapshots_by_url,
        content_items=content_items,
    )

    # 4. Run all 6 categories
    all_candidates: list[OpportunityCandidate] = []
    by_cat: dict[str, int] = defaultdict(int)
    for cat_module in ALL_CATEGORIES:
        try:
            candidates = cat_module.detect(ctx)
            all_candidates.extend(candidates)
            by_cat[cat_module.__name__.rsplit(".", 1)[-1]] += len(candidates)
        except Exception as exc:  # noqa: BLE001
            log.error("category_failed", category=cat_module.__name__, error=str(exc))
            run_events.emit(run_id=run_id, client_id=client_id, event_source="analyst",
                            event_type="warning",
                            error_message=f"{cat_module.__name__}: {exc}")

    log.info("analyst_candidates", client_id=client_id, total=len(all_candidates), by=by_cat)

    # 5. Top-N selection
    selected = topn_selector.select_topn(client_id=client_id, candidates=all_candidates)

    # 6. INSERT into opportunities
    rows = []
    for rank, c in enumerate(selected, start=1):
        rows.append({
            "run_id": run_id,
            "client_id": client_id,
            "content_item_id": c.content_item_id,
            "article_url": c.article_url,
            "article_title": c.article_title or None,
            "article_language": c.article_language,
            "category": c.category,
            "score": round(c.score, 2),
            "rank_within_client": rank,
            "traffic_potential_estimate": round(c.traffic_potential, 2),
            "effort_level": c.effort_level,
            "confidence": c.confidence,
            "evidence": c.evidence,
            "recommendation_summary": c.recommendation_summary,
            "recommendation_details": c.recommendation_details,
            "status": "pending",
            "dedupe_key": c.dedupe_key,
        })

    inserted = 0
    if rows:
        try:
            resp = (
                sb.schema("seo_optimizer")
                .table("opportunities")
                .upsert(rows, on_conflict="dedupe_key")
                .execute()
            )
            inserted = len(resp.data or rows)
        except Exception as exc:  # noqa: BLE001
            log.error("opportunities_insert_failed", error=str(exc))
            run_events.emit(run_id=run_id, client_id=client_id, event_source="analyst",
                            event_type="agent_failed",
                            error_message=f"opportunities insert: {exc}")
            return 0, {}

    # Selected by category
    sel_by_cat: dict[str, int] = defaultdict(int)
    for c in selected:
        sel_by_cat[c.category] += 1

    run_events.emit(run_id=run_id, client_id=client_id, event_source="analyst",
                    event_type="opportunity_detected",
                    payload={"selected": len(selected), "by_category": dict(sel_by_cat)})
    return inserted, dict(sel_by_cat)


def _list_clients_in_run(run_id: str) -> list[str]:
    """Distinct client_ids that have gsc data in this run."""
    resp = (
        sb.schema("seo_optimizer")
        .table("gsc_url_query_metrics")
        .select("client_id")
        .eq("run_id", run_id)
        .execute()
    )
    return list({r["client_id"] for r in (resp.data or [])})


def _load_gsc_rows(run_id: str, client_id: str) -> list[GscRow]:
    """Load gsc_url_query_metrics rows and convert to GscRow (with _prev attached)."""
    resp = (
        sb.schema("seo_optimizer")
        .table("gsc_url_query_metrics")
        .select("url, query, country, device, clicks, impressions, ctr, position, "
                "clicks_prev, impressions_prev, ctr_prev, position_prev")
        .eq("run_id", run_id)
        .eq("client_id", client_id)
        .execute()
    )
    out: list[GscRow] = []
    for r in (resp.data or []):
        row = GscRow(
            url=r["url"], query=r["query"],
            country=r.get("country"), device=r.get("device"),
            clicks=int(r.get("clicks") or 0), impressions=int(r.get("impressions") or 0),
            ctr=float(r.get("ctr") or 0), position=float(r.get("position") or 0),
        )
        # Attach prev columns as dynamic attributes (categories read them via getattr)
        row.clicks_prev = int(r["clicks_prev"]) if r.get("clicks_prev") is not None else 0  # type: ignore[attr-defined]
        row.impressions_prev = int(r["impressions_prev"]) if r.get("impressions_prev") is not None else 0  # type: ignore[attr-defined]
        row.ctr_prev = float(r["ctr_prev"]) if r.get("ctr_prev") is not None else 0.0  # type: ignore[attr-defined]
        row.position_prev = float(r["position_prev"]) if r.get("position_prev") is not None else 0.0  # type: ignore[attr-defined]
        out.append(row)
    return out


def _load_snapshots(run_id: str, client_id: str) -> dict[str, ArticleSnapshot]:
    resp = (
        sb.schema("seo_optimizer")
        .table("article_snapshots")
        .select("url, content_item_id, source, html, title_tag, meta_description, h1, headings, word_count")
        .eq("run_id", run_id)
        .eq("client_id", client_id)
        .execute()
    )
    out: dict[str, ArticleSnapshot] = {}
    for r in (resp.data or []):
        parsed = parse_html(r.get("html") or "")
        out[r["url"]] = ArticleSnapshot(
            url=r["url"],
            content_item_id=r.get("content_item_id"),
            source=r["source"],
            parsed=parsed,
        )
    return out


# ---------------------------------------------------------------------------
# FastAPI handler
# ---------------------------------------------------------------------------
async def handle(
    payload: AnalystPayload,
    x_internal_secret: str | None = Header(default=None),
) -> dict:
    verify(x_internal_secret)
    return run(run_id=payload.run_id, client_ids=payload.client_ids)
