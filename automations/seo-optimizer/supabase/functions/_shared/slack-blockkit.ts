// _shared/slack-blockkit.ts
// Builders de Slack Block Kit. Solo construyen el JSON; el envío lo hace outbox-worker.

export interface SeoNotificationArgs {
  clientName: string;
  runId: string;
  opportunitiesCount: number;
  byCategory: Record<string, number>;
  reviewUrl: string;
}

export function buildSeoNotification(a: SeoNotificationArgs): Record<string, unknown> {
  const catSummary = Object.entries(a.byCategory)
    .map(([cat, n]) => `${cat}: ${n}`)
    .join(" · ");
  return {
    text: `🎯 ${a.opportunitiesCount} oportunidades SEO para ${a.clientName}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `🎯 ${a.opportunitiesCount} oportunidades SEO — ${a.clientName}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Por categoría:* ${catSummary}` },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Revisar en Orbit" },
            url: a.reviewUrl,
            style: "primary",
          },
        ],
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Run \`${a.runId}\` · seo-optimizer` }],
      },
    ],
  };
}

export interface WriterNotificationArgs {
  clientName: string;
  articleTitle: string;
  articleUrl: string;
  category: string;
  changeSummary: string;
  inboxUrl: string;
}

export function buildWriterNotification(a: WriterNotificationArgs): Record<string, unknown> {
  return {
    text: `✍️ Reescritura lista — ${a.articleTitle}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `✍️ Reescritura lista — ${a.clientName}` },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Artículo:* <${a.articleUrl}|${a.articleTitle}>\n` +
            `*Categoría:* \`${a.category}\`\n` +
            `*Resumen del cambio:*\n${a.changeSummary}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Abrir en Orbit" },
            url: a.inboxUrl,
            style: "primary",
          },
        ],
      },
    ],
  };
}

export interface AdminAlertArgs {
  severity: "RED" | "YELLOW";
  title: string;
  body: string;
  details?: Record<string, string | number>;
}

export function buildAdminAlert(a: AdminAlertArgs): Record<string, unknown> {
  const emoji = a.severity === "RED" ? "🔴" : "🟡";
  const fields: Array<{ type: string; text: string }> = [];
  if (a.details) {
    for (const [k, v] of Object.entries(a.details)) {
      fields.push({ type: "mrkdwn", text: `*${k}:* \`${v}\`` });
    }
  }
  const blocks: Array<Record<string, unknown>> = [
    { type: "header", text: { type: "plain_text", text: `${emoji} ${a.title}` } },
    { type: "section", text: { type: "mrkdwn", text: a.body } },
  ];
  if (fields.length > 0) {
    blocks.push({ type: "section", fields: fields.slice(0, 10) });
  }
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "seo-optimizer · watchdog" }],
  });
  return { text: `${emoji} ${a.title}`, blocks };
}

export interface ReevalOutcomeAlertArgs {
  clientName: string;
  articleTitle: string;
  articleUrl: string;
  outcome: "improved" | "worsened" | "unchanged" | "inconclusive";
  metrics: {
    clicks_before?: number; clicks_after?: number; clicks_delta_pct?: number;
    position_before?: number; position_after?: number; position_delta?: number;
  };
}

export function buildReevalOutcomeAlert(a: ReevalOutcomeAlertArgs): Record<string, unknown> {
  const emojiMap: Record<string, string> = { improved: "✅", worsened: "⚠️", unchanged: "➖", inconclusive: "❓" };
  const emoji = emojiMap[a.outcome] ?? "❓";
  const m = a.metrics;
  return {
    text: `${emoji} Re-evaluación: ${a.articleTitle}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${emoji} Re-evaluación a 45 días — ${a.clientName}` } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*Artículo:* <${a.articleUrl}|${a.articleTitle}>\n` +
            `*Resultado:* \`${a.outcome}\`\n` +
            `*Clicks:* ${m.clicks_before ?? 0} → ${m.clicks_after ?? 0} ` +
            `(Δ ${(m.clicks_delta_pct ?? 0).toFixed(1)}%)\n` +
            `*Posición:* ${(m.position_before ?? 0).toFixed(1)} → ${(m.position_after ?? 0).toFixed(1)} ` +
            `(Δ ${(m.position_delta ?? 0).toFixed(1)})`,
        },
      },
    ],
  };
}
