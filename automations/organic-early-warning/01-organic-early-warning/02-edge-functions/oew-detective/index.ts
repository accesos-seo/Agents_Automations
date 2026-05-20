// oew-detective
// Enriquece un incident con análisis LLM: thematic_cluster (<=60 tokens),
// executive_summary (<=200 tokens) y recommended_actions. Idempotente:
// skip si ya existe incident_diagnostics; force:true para regenerar.
// Fallback degradado: si OpenRouter falla 3 veces, persiste plantilla y
// emite warning, devuelve 200 con degraded:true (el dispatcher continúa).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getOewClient, getHubClient, getVaultSecret } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { callOpenRouter } from "../_shared/openrouter.ts";

const EVENT_SOURCE = "detective";
const TOP_URLS = 10;
const TOP_KEYWORDS = 15;
const LLM_MAX_TOKENS = 600;
const LLM_RETRIES = 3;
const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

type Severity = "WATCH" | "YELLOW" | "RED";

interface DetectiveRequest {
  incident_id?: string;
  force?: boolean;
}

interface IncidentRow {
  id: string;
  run_id: string;
  brand_id: string;
  severity: Severity;
  signal_event_ids: string[];
  signal_count: number;
  status: "open" | "resolved";
  window_start: string | null;
  window_end: string | null;
  payload: Record<string, unknown> | null;
}

interface BrandRow {
  id: string;
  name: string | null;
  domain: string | null;
  vertical: string | null;
  country_iso: string | null;
}

interface SignalEventCtx {
  signal_id: string;
  signal_name: string | null;
  signal_kind: string | null;
  segment_hash: string;
  metric_actual: number | null;
  metric_expected: number | null;
  deviation_sigma: number | null;
  severity_hint: Severity | null;
  payload: Record<string, unknown> | null;
}

interface LlmOutput {
  thematic_cluster: string;
  executive_summary: string;
  recommended_actions: string;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parseLlmJson(raw: string): LlmOutput | null {
  if (!raw) return null;
  const tryParse = (s: string): LlmOutput | null => {
    try {
      const obj = JSON.parse(s);
      if (typeof obj !== "object" || obj === null) return null;
      const tc = (obj as Record<string, unknown>).thematic_cluster;
      const es = (obj as Record<string, unknown>).executive_summary;
      const ra = (obj as Record<string, unknown>).recommended_actions;
      if (typeof tc !== "string" || typeof es !== "string") return null;
      return {
        thematic_cluster: tc.trim(),
        executive_summary: es.trim(),
        recommended_actions: typeof ra === "string" ? ra.trim() : "",
      };
    } catch (_) {
      return null;
    }
  };

  const direct = tryParse(raw);
  if (direct) return direct;

  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const fromFence = tryParse(fence[1].trim());
    if (fromFence) return fromFence;
  }

  const braceStart = raw.indexOf("{");
  const braceEnd = raw.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    const slice = raw.slice(braceStart, braceEnd + 1);
    return tryParse(slice);
  }
  return null;
}

interface UrlAgg {
  url: string;
  clicks_drop: number;
  signal_count: number;
}

interface KeywordAgg {
  keyword: string;
  clicks_drop: number;
  signal_count: number;
}

function aggregateUrlsAndKeywords(events: SignalEventCtx[]): { urls: UrlAgg[]; keywords: KeywordAgg[] } {
  const urlMap = new Map<string, UrlAgg>();
  const kwMap = new Map<string, KeywordAgg>();

  for (const ev of events) {
    const p = ev.payload ?? {};
    const urls = asStringArray(p.affected_urls);
    const keywords = asStringArray(p.affected_keywords);
    const clicksDrop = toNumber(p.clicks_drop);

    for (const u of urls) {
      const cur = urlMap.get(u) ?? { url: u, clicks_drop: 0, signal_count: 0 };
      cur.clicks_drop += clicksDrop;
      cur.signal_count += 1;
      urlMap.set(u, cur);
    }
    for (const k of keywords) {
      const cur = kwMap.get(k) ?? { keyword: k, clicks_drop: 0, signal_count: 0 };
      cur.clicks_drop += clicksDrop;
      cur.signal_count += 1;
      kwMap.set(k, cur);
    }
  }

  const urls = Array.from(urlMap.values())
    .sort((a, b) => b.clicks_drop - a.clicks_drop || b.signal_count - a.signal_count)
    .slice(0, TOP_URLS);
  const keywords = Array.from(kwMap.values())
    .sort((a, b) => b.clicks_drop - a.clicks_drop || b.signal_count - a.signal_count)
    .slice(0, TOP_KEYWORDS);

  return { urls, keywords };
}

function buildPrompt(
  brand: BrandRow,
  incident: IncidentRow,
  events: SignalEventCtx[],
  urls: UrlAgg[],
  keywords: KeywordAgg[],
): { system: string; user: string } {
  const system =
    "Eres un analista SEO senior. Tu tarea es analizar un incidente detectado por un sistema agéntico y producir un thematic_cluster + executive_summary + recommended_actions. Responde ÚNICAMENTE con JSON válido sin markdown ni explicación. El thematic_cluster debe tener máximo 60 tokens, el executive_summary máximo 200 tokens, y recommended_actions máximo 150 tokens.";

  const userObj = {
    brand: {
      name: brand.name,
      domain: brand.domain,
      vertical: brand.vertical,
      country: brand.country_iso,
    },
    incident: {
      severity: incident.severity,
      signal_count: incident.signal_count,
      window_start: incident.window_start,
      window_end: incident.window_end,
    },
    signals: events.map((e) => ({
      signal_id: e.signal_id,
      name: e.signal_name,
      kind: e.signal_kind,
      severity_hint: e.severity_hint,
      metric_actual: e.metric_actual,
      metric_expected: e.metric_expected,
      deviation_sigma: e.deviation_sigma,
    })),
    top_urls: urls,
    top_keywords: keywords,
    output_schema: {
      thematic_cluster: "string (<=60 tokens, frase tipo 'Caída en URLs de blog odontológico en mobile-MX')",
      executive_summary: "string (<=200 tokens, 2-3 oraciones: qué pasó, qué correlaciona, próxima acción sugerida)",
      recommended_actions: "string (<=150 tokens, lista breve de acciones técnicas)",
    },
  };

  return {
    system,
    user: `Analizá el siguiente incident y respondé en JSON.\n\n${JSON.stringify(userObj, null, 2)}`,
  };
}

async function callLlmWithRetry(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<{ output: LlmOutput; tokens_in: number; tokens_out: number; raw: string } | null> {
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= LLM_RETRIES; attempt++) {
    try {
      const resp = await callOpenRouter({
        apiKey,
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: LLM_MAX_TOKENS,
      });
      const parsed = parseLlmJson(resp.content);
      if (parsed && parsed.thematic_cluster) {
        return {
          output: parsed,
          tokens_in: resp.tokens_in,
          tokens_out: resp.tokens_out,
          raw: resp.content,
        };
      }
      lastError = `parse_failed_attempt_${attempt}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  console.error(`[oew-detective] LLM failed after ${LLM_RETRIES} attempts: ${lastError}`);
  return null;
}

serve(async (req: Request) => {
  const authFail = verifyInternalSecret(req);
  if (authFail) return authFail;

  let body: DetectiveRequest;
  try {
    body = (await req.json()) as DetectiveRequest;
  } catch {
    return jsonResp({ ok: false, error: "invalid_json" }, 400);
  }

  const incidentId = body?.incident_id;
  const force = body?.force === true;
  if (!incidentId) return jsonResp({ ok: false, error: "missing_incident_id" }, 400);

  const oew = getOewClient();
  const hub = getHubClient();
  let runId: string | null = null;
  let brandId: string | null = null;

  try {
    const { data: incident, error: incErr } = await oew
      .from("incidents")
      .select(
        "id, run_id, brand_id, severity, signal_event_ids, signal_count, status, window_start, window_end, payload",
      )
      .eq("id", incidentId)
      .maybeSingle<IncidentRow>();
    if (incErr) throw new Error(`incident lookup: ${incErr.message}`);
    if (!incident) return jsonResp({ ok: false, error: "incident_not_found" }, 404);

    runId = incident.run_id;
    brandId = incident.brand_id;

    if (incident.status === "resolved" && !force) {
      return jsonResp({ ok: false, error: "incident_status_invalid" }, 409);
    }

    const { data: existing, error: existErr } = await oew
      .from("incident_diagnostics")
      .select("id, thematic_cluster")
      .eq("incident_id", incidentId)
      .maybeSingle();
    if (existErr) throw new Error(`diagnostics lookup: ${existErr.message}`);

    if (existing && !force) {
      return jsonResp({
        ok: true,
        incident_id: incidentId,
        status: "already_diagnosed",
        thematic_cluster: existing.thematic_cluster ?? "",
      });
    }

    await emitEvent({
      client: oew,
      run_id: runId,
      brand_id: brandId,
      event_source: EVENT_SOURCE,
      event_type: "agent_started",
      payload: { incident_id: incidentId, force },
    });

    const { data: brandRow, error: brandErr } = await hub
      .from("brands_registry")
      .select("id, name, domain, vertical, country_iso")
      .eq("id", brandId)
      .maybeSingle<BrandRow>();
    if (brandErr) throw new Error(`brand lookup: ${brandErr.message}`);
    const brand: BrandRow = brandRow ?? {
      id: brandId,
      name: null,
      domain: null,
      vertical: null,
      country_iso: null,
    };

    const eventIds = incident.signal_event_ids ?? [];
    if (eventIds.length === 0) {
      throw new Error("incident has no signal_event_ids");
    }

    const { data: rawEvents, error: evtErr } = await oew
      .from("signal_events")
      .select(
        "id, signal_id, segment_hash, metric_actual, metric_expected, deviation_sigma, severity_hint, payload",
      )
      .in("id", eventIds);
    if (evtErr) throw new Error(`signal_events fetch: ${evtErr.message}`);

    const { data: defs, error: defsErr } = await oew
      .from("signal_definitions")
      .select("id, name, kind");
    if (defsErr) throw new Error(`signal_definitions fetch: ${defsErr.message}`);

    const defMap = new Map<string, { name: string | null; kind: string | null }>();
    for (const d of (defs ?? []) as Array<{ id: string; name: string | null; kind: string | null }>) {
      defMap.set(d.id, { name: d.name, kind: d.kind });
    }

    const events: SignalEventCtx[] = (rawEvents ?? []).map((e) => {
      const row = e as Record<string, unknown>;
      const def = defMap.get(row.signal_id as string);
      return {
        signal_id: row.signal_id as string,
        signal_name: def?.name ?? null,
        signal_kind: def?.kind ?? null,
        segment_hash: row.segment_hash as string,
        metric_actual: row.metric_actual === null ? null : toNumber(row.metric_actual),
        metric_expected: row.metric_expected === null ? null : toNumber(row.metric_expected),
        deviation_sigma: row.deviation_sigma === null ? null : toNumber(row.deviation_sigma),
        severity_hint: (row.severity_hint as Severity | null) ?? null,
        payload: (row.payload as Record<string, unknown> | null) ?? null,
      };
    });

    const { urls: topUrls, keywords: topKeywords } = aggregateUrlsAndKeywords(events);

    const apiKey = await getVaultSecret("OPENROUTER_API_KEY");
    if (!apiKey) throw new Error("OPENROUTER_API_KEY missing in vault");
    const model = Deno.env.get("OEW_MODEL") ?? DEFAULT_MODEL;

    const { system, user } = buildPrompt(brand, incident, events, topUrls, topKeywords);
    const llmResult = await callLlmWithRetry(apiKey, model, system, user);

    let thematicCluster: string;
    let executiveSummary: string;
    let recommendedActions: string;
    let tokensIn = 0;
    let tokensOut = 0;
    let degraded = false;

    if (llmResult) {
      thematicCluster = llmResult.output.thematic_cluster;
      executiveSummary = llmResult.output.executive_summary;
      recommendedActions = llmResult.output.recommended_actions;
      tokensIn = llmResult.tokens_in;
      tokensOut = llmResult.tokens_out;
    } else {
      degraded = true;
      thematicCluster = "unknown_llm_failed";
      executiveSummary = "LLM unavailable; revisar payload del incident para detalle de signals y URLs afectadas.";
      recommendedActions = "Revisar manualmente las top URLs y keywords del incident en Supabase.";
      await emitEvent({
        client: oew,
        run_id: runId,
        brand_id: brandId,
        event_source: EVENT_SOURCE,
        event_type: "warning",
        payload: { reason: "llm_unavailable", incident_id: incidentId, model },
      });
    }

    const upsertRow = {
      incident_id: incidentId,
      run_id: runId,
      thematic_cluster: thematicCluster,
      executive_summary: executiveSummary,
      recommended_actions: recommendedActions,
      top_urls: topUrls,
      top_keywords: topKeywords,
      llm_model: model,
      llm_tokens_in: tokensIn,
      llm_tokens_out: tokensOut,
      degraded,
      diagnosis_saved: true,
    };

    const { error: upErr } = await oew
      .from("incident_diagnostics")
      .upsert(upsertRow, { onConflict: "incident_id" });
    if (upErr) throw new Error(`incident_diagnostics upsert: ${upErr.message}`);

    await emitEvent({
      client: oew,
      run_id: runId,
      brand_id: brandId,
      event_source: EVENT_SOURCE,
      event_type: "diagnosis_saved",
      payload: {
        incident_id: incidentId,
        thematic_cluster: thematicCluster,
        degraded,
        llm_model: model,
        llm_tokens_in: tokensIn,
        llm_tokens_out: tokensOut,
      },
    });

    await emitEvent({
      client: oew,
      run_id: runId,
      brand_id: brandId,
      event_source: EVENT_SOURCE,
      event_type: "agent_completed",
      payload: { incident_id: incidentId, degraded },
    });

    return jsonResp({
      ok: true,
      incident_id: incidentId,
      diagnosis_saved: true,
      thematic_cluster: thematicCluster,
      executive_summary_chars: executiveSummary.length,
      top_urls_count: topUrls.length,
      top_keywords_count: topKeywords.length,
      llm_model: model,
      llm_tokens_in: tokensIn,
      llm_tokens_out: tokensOut,
      degraded,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[oew-detective] ${msg}`);
    if (runId) {
      try {
        await emitEvent({
          client: oew,
          run_id: runId,
          brand_id: brandId ?? undefined,
          event_source: EVENT_SOURCE,
          event_type: "agent_failed",
          payload: { incident_id: incidentId },
          error_message: msg,
        });
      } catch (_) { /* swallow */ }
    }
    return jsonResp({ ok: false, error: "incident_diagnostics_insert_failed" }, 500);
  }
});
