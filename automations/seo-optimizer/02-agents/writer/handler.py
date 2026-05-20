"""Writer handler — generates HTML rewrites for approved opportunities.

Triggered by DB trigger `opportunities_approved_dispatch` (POST from net.http_post).

Flow:
  1. Load opportunity + article snapshot + content_item
  2. Set opportunity.status='writing' (so trigger doesn't loop if /writer is retried)
  3. Pick prompt: low_ctr → rewrite_meta.txt; everything else → rewrite_body.txt
  4. Call LLM with system prompt (cached) + user payload
  5. Parse JSON output
  6. Build diff_html using diff-match-patch
  7. INSERT opportunity_rewrites (status='draft')
  8. UPDATE opportunity.status='ready_for_writer'
  9. POST to dispatcher (in-process) to notify the redactor
"""
from __future__ import annotations

import json
from pathlib import Path

import structlog
from diff_match_patch import diff_match_patch  # type: ignore[import-untyped]
from fastapi import Header
from pydantic import BaseModel

from _shared import llm_client, run_events
from _shared.secret import verify
from _shared.supabase_client import sb


log = structlog.get_logger()

PROMPTS_DIR = Path(__file__).parent / "prompts"
MAX_OUTPUT_TOKENS = 8000


class WriterPayload(BaseModel):
    opportunity_id: str
    regenerate: bool = False    # if True, overwrites an existing draft


# ---------------------------------------------------------------------------
# Internal core
# ---------------------------------------------------------------------------
def run(*, opportunity_id: str, regenerate: bool = False) -> dict:
    # 1. Load opportunity
    opp_resp = (
        sb.schema("seo_optimizer")
        .table("opportunities")
        .select("*")
        .eq("id", opportunity_id)
        .single()
        .execute()
    )
    opp = opp_resp.data
    if not opp:
        return {"status": "failed", "reason": "opportunity_not_found"}

    if opp["status"] not in ("approved", "writing") and not regenerate:
        return {"status": "skipped", "reason": f"status is {opp['status']}, not approved"}

    run_id = opp["run_id"]
    client_id = opp["client_id"]

    # 2. Mark as writing
    sb.schema("seo_optimizer").table("opportunities").update({
        "status": "writing"
    }).eq("id", opportunity_id).eq("status", "approved").execute()

    run_events.emit(run_id=run_id, client_id=client_id, event_source="writer",
                    event_type="agent_started", payload={"opportunity_id": opportunity_id})

    # 3. Load article snapshot
    snap_resp = (
        sb.schema("seo_optimizer")
        .table("article_snapshots")
        .select("url, html, title_tag, meta_description, h1")
        .eq("run_id", run_id)
        .eq("client_id", client_id)
        .eq("url", opp["article_url"])
        .limit(1)
        .execute()
    )
    snap = (snap_resp.data or [None])[0]
    if not snap or not snap.get("html"):
        run_events.emit(run_id=run_id, client_id=client_id, event_source="writer",
                        event_type="agent_failed",
                        error_message="no article snapshot HTML available")
        # Revert status so SEO can re-approve or investigate
        sb.schema("seo_optimizer").table("opportunities").update({
            "status": "approved"
        }).eq("id", opportunity_id).execute()
        return {"status": "failed", "reason": "no_snapshot_html"}

    # 4. Pick prompt
    category = opp["category"]
    is_meta_only = category == "low_ctr"
    prompt_file = "rewrite_meta.txt" if is_meta_only else "rewrite_body.txt"
    system_prompt = (PROMPTS_DIR / prompt_file).read_text(encoding="utf-8")
    language_name = _language_name(opp.get("article_language"))
    system_prompt = system_prompt.replace("{language}", language_name)

    # 5. Build user payload
    user_payload = {
        "article_url": opp["article_url"],
        "article_title": opp.get("article_title"),
        "article_language": opp.get("article_language"),
        "category": category,
        "current_title_tag": snap.get("title_tag"),
        "current_meta_description": snap.get("meta_description"),
        "current_h1": snap.get("h1"),
        "current_html": snap.get("html"),
        "evidence": opp.get("evidence"),
        "recommendation_summary": opp.get("recommendation_summary"),
        "recommendation_details": opp.get("recommendation_details"),
    }

    # 6. Call LLM
    try:
        raw_text, usage = llm_client.call_with_usage(
            system=system_prompt,
            user=json.dumps(user_payload, ensure_ascii=False, indent=2),
            max_tokens=MAX_OUTPUT_TOKENS,
            temperature=0.3,
            cache_system=True,
        )
    except Exception as exc:  # noqa: BLE001
        log.error("writer_llm_failed", error=str(exc))
        run_events.emit(run_id=run_id, client_id=client_id, event_source="writer",
                        event_type="agent_failed", error_message=f"LLM call: {exc}")
        sb.schema("seo_optimizer").table("opportunities").update({
            "status": "approved"
        }).eq("id", opportunity_id).execute()
        return {"status": "failed", "reason": "llm_error", "error": str(exc)}

    # 7. Parse JSON
    try:
        parsed = _parse_llm_json(raw_text)
    except Exception as exc:  # noqa: BLE001
        log.error("writer_parse_failed", error=str(exc), raw=raw_text[:500])
        run_events.emit(run_id=run_id, client_id=client_id, event_source="writer",
                        event_type="agent_failed",
                        error_message=f"could not parse LLM output as JSON: {exc}")
        sb.schema("seo_optimizer").table("opportunities").update({
            "status": "approved"
        }).eq("id", opportunity_id).execute()
        return {"status": "failed", "reason": "parse_error"}

    proposed_html = parsed.get("proposed_html") or ""
    proposed_title = parsed.get("proposed_title_tag")
    proposed_meta = parsed.get("proposed_meta_description")
    proposed_h1 = parsed.get("proposed_h1")
    change_summary = parsed.get("change_summary") or "(sin resumen)"

    # 8. Build diff HTML
    diff_html = _build_diff_html(
        original_html=snap.get("html") or "",
        proposed_html=proposed_html or snap.get("html") or "",
    )

    # 9. INSERT opportunity_rewrites
    rewrite_row = {
        "opportunity_id": opportunity_id,
        "original_html": snap.get("html"),
        "proposed_html": proposed_html or snap.get("html"),
        "proposed_title_tag": proposed_title,
        "proposed_meta_description": proposed_meta,
        "proposed_h1": proposed_h1,
        "diff_html": diff_html,
        "change_summary": change_summary,
        "generated_by_model": llm_client._model(),  # noqa: SLF001
        "tokens_input": usage.get("input_tokens"),
        "tokens_output": usage.get("output_tokens"),
        "status": "draft",
    }
    try:
        ins = (
            sb.schema("seo_optimizer")
            .table("opportunity_rewrites")
            .insert(rewrite_row)
            .execute()
        )
        rewrite_id = ins.data[0]["id"]
    except Exception as exc:  # noqa: BLE001
        log.error("rewrite_insert_failed", error=str(exc))
        run_events.emit(run_id=run_id, client_id=client_id, event_source="writer",
                        event_type="agent_failed", error_message=f"insert: {exc}")
        sb.schema("seo_optimizer").table("opportunities").update({
            "status": "approved"
        }).eq("id", opportunity_id).execute()
        return {"status": "failed", "reason": "insert_error"}

    # 10. Update opportunity → ready_for_writer
    sb.schema("seo_optimizer").table("opportunities").update({
        "status": "ready_for_writer"
    }).eq("id", opportunity_id).execute()

    # 11. Notify redactor via dispatcher
    try:
        from dispatcher import handler as dispatcher_handler
        dispatcher_handler.run(opportunity_id=opportunity_id, recipient="redactor")
    except Exception as exc:  # noqa: BLE001
        log.warning("redactor_notification_failed", error=str(exc))
        run_events.emit(run_id=run_id, client_id=client_id, event_source="writer",
                        event_type="warning",
                        error_message=f"dispatcher to redactor failed: {exc}")

    result = {
        "status": "ok",
        "rewrite_id": rewrite_id,
        "tokens_used": usage,
        "category": category,
    }
    run_events.emit(run_id=run_id, client_id=client_id, event_source="writer",
                    event_type="rewrite_generated",
                    payload={"opportunity_id": opportunity_id, "rewrite_id": rewrite_id, "usage": usage})
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _language_name(lang_code: str | None) -> str:
    if not lang_code:
        return "Spanish"
    l = lang_code.lower()
    if l.startswith("pt"):
        return "Brazilian Portuguese"
    if l.startswith("en"):
        return "English"
    return "Spanish"


def _parse_llm_json(text: str) -> dict:
    """Robust JSON parser for LLM output (strips code fences, finds first {...})."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(lines[1:-1]) if len(lines) >= 2 else cleaned
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        import re
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not m:
            raise
        return json.loads(m.group(0))


def _build_diff_html(*, original_html: str, proposed_html: str) -> str:
    """Build a side-by-side word-diff HTML for human review.

    Uses diff-match-patch (Google) for sentence-level diff, then renders as
    inline <ins>/<del> tags wrapped in a styled container.
    """
    dmp = diff_match_patch()
    diffs = dmp.diff_main(original_html or "", proposed_html or "")
    dmp.diff_cleanupSemantic(diffs)

    parts: list[str] = []
    for op, text in diffs:
        # HTML-escape user text minimally
        safe = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
        if op == 0:    # equal
            parts.append(safe)
        elif op == -1:  # deletion
            parts.append(f'<del style="background:#fee;color:#900;text-decoration:line-through;">{safe}</del>')
        elif op == 1:   # insertion
            parts.append(f'<ins style="background:#efe;color:#070;text-decoration:none;">{safe}</ins>')

    body = "".join(parts)
    return f'''<div class="seo-optimizer-diff" style="font-family:monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;">{body}</div>'''


# ---------------------------------------------------------------------------
# FastAPI handler
# ---------------------------------------------------------------------------
async def handle(
    payload: WriterPayload,
    x_internal_secret: str | None = Header(default=None),
) -> dict:
    verify(x_internal_secret)
    return run(opportunity_id=payload.opportunity_id, regenerate=payload.regenerate)
