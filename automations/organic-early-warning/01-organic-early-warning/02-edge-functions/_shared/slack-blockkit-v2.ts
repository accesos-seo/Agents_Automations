import type { Severity } from "./types.ts";

const NA = "N/A";

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function severityHeader(severity: Severity): { emoji: string; label: string } {
  if (severity === "RED") return { emoji: "🚨", label: "ALERTA ROJA" };
  if (severity === "YELLOW") return { emoji: "⚠️", label: "ALERTA AMARILLA" };
  return { emoji: "👁️", label: "WATCH" };
}

export interface IncidentAlertSignalRef {
  code: string;
  name: string;
}

export interface IncidentAlertTopUrl {
  url: string;
  clicks_drop: number;
}

export interface IncidentAlertInput {
  severity: Severity;
  brand_name: string;
  executive_summary: string;
  thematic_cluster: string;
  signals: IncidentAlertSignalRef[];
  top_urls: IncidentAlertTopUrl[];
  incident_id: string;
  team_lead_user_id?: string | null;
}

export interface BlockKitOutput {
  blocks: unknown[];
  text: string;
}

export function buildIncidentAlertBlocks(input: IncidentAlertInput): BlockKitOutput {
  const { emoji, label } = severityHeader(input.severity);
  const headerText = `${emoji} ${label} — ${input.brand_name}`;

  const signalsList = input.signals.length === 0
    ? NA
    : input.signals.map((s) => `\`${s.code}\` ${s.name}`).join(" · ");

  const urlsList = input.top_urls.length === 0
    ? NA
    : input.top_urls
        .slice(0, 5)
        .map((u) => `• ${truncate(u.url, 80)} — clicks Δ ${u.clicks_drop > 0 ? "+" : ""}${u.clicks_drop.toFixed(1)}%`)
        .join("\n");

  const mention = input.team_lead_user_id ? `<@${input.team_lead_user_id}> ` : "";

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: truncate(headerText, 150), emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Clúster temático:*\n${truncate(input.thematic_cluster || NA, 200)}` },
        { type: "mrkdwn", text: `*Señales:*\n${truncate(signalsList, 300)}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `${mention}*Resumen:* ${truncate(input.executive_summary, 1200)}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Top URLs afectadas:*\n${urlsList}` },
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Incidente: \`${input.incident_id}\` · ${new Date().toISOString()}`,
        },
      ],
    },
  ];

  const fallback = truncate(`${emoji} ${label} — ${input.brand_name}: ${input.thematic_cluster}`, 140);
  return { blocks, text: fallback };
}

export interface DigestSignalSummary {
  signal_code: string;
  count: number;
  samples: string[];
}

export interface DigestInput {
  iso_week: string;
  brand_name: string;
  watch_items: DigestSignalSummary[];
}

export function buildDigestBlocks(input: DigestInput): BlockKitOutput {
  const headerText = `👁️ Digest WATCH ${input.iso_week} — ${input.brand_name}`;

  const lines = input.watch_items.length === 0
    ? "Sin señales WATCH esta semana."
    : input.watch_items
        .map((it) => {
          const samples = it.samples.slice(0, 3).map((s) => truncate(s, 60)).join(", ");
          return `• *${it.signal_code}* — ${it.count} señal(es)${samples ? ` (ej: ${samples})` : ""}`;
        })
        .join("\n");

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: truncate(headerText, 150), emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: lines },
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Digest semanal · sin alertas inmediatas · ${new Date().toISOString()}`,
        },
      ],
    },
  ];

  const fallback = truncate(`Digest WATCH ${input.iso_week} — ${input.brand_name}`, 140);
  return { blocks, text: fallback };
}
