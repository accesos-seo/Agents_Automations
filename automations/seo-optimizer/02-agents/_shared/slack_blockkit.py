"""Slack Block Kit message builders.

The outbox stores Slack payloads as JSON in `notifications_outbox.payload`.
This module builds those payloads. Workers read them and POST to Slack.

We build two types of messages:
  - SEO notification: "Run completed — N opportunities for review"
  - Writer notification: "Article rewrite ready for [Client] / [Article title]"
  - Admin alert: pipeline failures, stuck states (from watchdog)
"""
from __future__ import annotations


def build_seo_notification(
    *,
    client_name: str,
    run_id: str,
    opportunities_count: int,
    by_category: dict[str, int],
    review_url: str,
) -> dict:
    """Notification to SEO specialist when a new run completes."""
    cat_summary = " · ".join(f"{cat}: {n}" for cat, n in by_category.items())
    return {
        "text": f"🎯 {opportunities_count} oportunidades SEO para {client_name}",
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"🎯 {opportunities_count} oportunidades SEO — {client_name}"},
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"*Por categoría:* {cat_summary}"},
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Revisar en Orbit"},
                        "url": review_url,
                        "style": "primary",
                    },
                ],
            },
            {
                "type": "context",
                "elements": [
                    {"type": "mrkdwn", "text": f"Run `{run_id}` · seo-optimizer"},
                ],
            },
        ],
    }


def build_writer_notification(
    *,
    client_name: str,
    article_title: str,
    article_url: str,
    category: str,
    change_summary: str,
    inbox_url: str,
) -> dict:
    """Notification to redactor when a rewrite is ready."""
    return {
        "text": f"✍️ Reescritura lista — {article_title}",
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"✍️ Reescritura lista — {client_name}"},
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        f"*Artículo:* <{article_url}|{article_title}>\n"
                        f"*Categoría:* `{category}`\n"
                        f"*Resumen del cambio:*\n{change_summary}"
                    ),
                },
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Abrir en Orbit"},
                        "url": inbox_url,
                        "style": "primary",
                    },
                ],
            },
        ],
    }


def build_admin_alert(
    *,
    severity: str,        # 'RED' | 'YELLOW'
    title: str,
    body: str,
    details: dict | None = None,
) -> dict:
    """Watchdog / failure alert to admin channel."""
    emoji = "🔴" if severity == "RED" else "🟡"
    fields = []
    if details:
        for k, v in details.items():
            fields.append({"type": "mrkdwn", "text": f"*{k}:* `{v}`"})
    blocks: list[dict] = [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"{emoji} {title}"},
        },
        {
            "type": "section",
            "text": {"type": "mrkdwn", "text": body},
        },
    ]
    if fields:
        blocks.append({"type": "section", "fields": fields[:10]})  # Slack max 10
    blocks.append({
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": "seo-optimizer · watchdog"}],
    })
    return {"text": f"{emoji} {title}", "blocks": blocks}


def build_reeval_outcome_alert(
    *,
    client_name: str,
    article_title: str,
    article_url: str,
    outcome: str,         # 'improved' | 'worsened' | 'unchanged' | 'inconclusive'
    metrics: dict,
) -> dict:
    """Alert to SEO when a re-eval lands — especially important for 'worsened'."""
    emoji = {
        "improved": "✅",
        "worsened": "⚠️",
        "unchanged": "➖",
        "inconclusive": "❓",
    }.get(outcome, "❓")
    return {
        "text": f"{emoji} Re-evaluación: {article_title}",
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"{emoji} Re-evaluación a 45 días — {client_name}"},
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        f"*Artículo:* <{article_url}|{article_title}>\n"
                        f"*Resultado:* `{outcome}`\n"
                        f"*Clicks:* {metrics.get('clicks_before',0)} → {metrics.get('clicks_after',0)} "
                        f"(Δ {metrics.get('clicks_delta_pct',0):+.1f}%)\n"
                        f"*Posición:* {metrics.get('position_before',0):.1f} → {metrics.get('position_after',0):.1f} "
                        f"(Δ {metrics.get('position_delta',0):+.1f})"
                    ),
                },
            },
        ],
    }
