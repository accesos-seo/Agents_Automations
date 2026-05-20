// _shared/slack-blockkit.ts
// Builder de Block Kit para alertas de seo_sentinel.
// Centraliza el layout exacto definido en Docs/reglas/02-insight-structure.md
// para que dispatcher y eventuales reenvios produzcan payloads identicos.

export type AnomalyKind = "clicks_drop" | "position_drop";
export type Severity = "RED" | "YELLOW";

export interface AlertInput {
  brand_name: string;
  anomaly_kind: AnomalyKind;
  severity: Severity;
  metric_value: number;
  top_url?: string;
  top_keyword?: string;
  thematic_cluster?: string;
  executive_summary: string;
  incident_id: string;
  team_lead_user_id?: string;
}

export interface AlertBlocksOutput {
  blocks: unknown[];
  text: string;
}

const NA = "N/A";

function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return input.slice(0, max - 1) + "…";
}

function fallbackText(input: AlertInput): string {
  const emoji = input.severity === "RED" ? "🚨" : "⚠️";
  const label = input.severity === "RED" ? "RED" : "YELLOW";
  const base =
    input.anomaly_kind === "clicks_drop"
      ? `${emoji} ${label} — ${input.brand_name}: caída ${Math.abs(Math.round(input.metric_value))}%`
      : `${emoji} ${label} — ${input.brand_name}: keyword cayó ${Math.abs(Math.round(input.metric_value))} posiciones`;
  return truncate(base, 100);
}

export function buildAlertBlocks(input: AlertInput): AlertBlocksOutput {
  const emoji = input.severity === "RED" ? "🚨" : "⚠️";
  const label = input.severity === "RED" ? "ALERTA ROJA" : "ALERTA AMARILLA";
  const headerText = `${emoji} ${label} — ${input.brand_name}`;

  const url = input.top_url ?? NA;
  const keyword = input.top_keyword ?? NA;
  const cluster = input.thematic_cluster ?? NA;

  const fields =
    input.anomaly_kind === "clicks_drop"
      ? [
          { type: "mrkdwn", text: `*Caída WoW:*\n${Math.abs(input.metric_value).toFixed(1)}%` },
          { type: "mrkdwn", text: `*URL más afectada:*\n${url}` },
          { type: "mrkdwn", text: `*Keyword principal:*\n${keyword}` },
          { type: "mrkdwn", text: `*Clúster:*\n${cluster}` },
        ]
      : [
          { type: "mrkdwn", text: `*Posiciones perdidas:*\n${Math.abs(input.metric_value).toFixed(1)}` },
          { type: "mrkdwn", text: `*URL:*\n${url}` },
          { type: "mrkdwn", text: `*Keyword:*\n${keyword}` },
          { type: "mrkdwn", text: `*Clúster:*\n${cluster}` },
        ];

  const mention = input.team_lead_user_id ? `<@${input.team_lead_user_id}> ` : "";

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: truncate(headerText, 150), emoji: true },
    },
    {
      type: "section",
      fields,
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `${mention}*Resumen:* ${input.executive_summary}` },
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Incidente: \`${input.incident_id}\` | ${new Date().toISOString()}`,
        },
      ],
    },
  ];

  return { blocks, text: fallbackText(input) };
}
