// oew-digest-weekly
// Cron viernes 23:00 UTC. Agrega signal_events de la iso_week que NO escalaron
// a alerta inmediata (sin incident, incident=WATCH, dispatch deferido o suprimido),
// agrupa por brand x signal_id, construye Block Kit digest y encola en outbox
// (1 row por brand). Sin LLM — es agregación determinística.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getOewClient, getHubClient, getPublicClient } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { buildDigestBlocks } from "../_shared/slack-blockkit-v2.ts";

const EVENT_SOURCE = "digest-weekly";

interface DigestRequest {
  trigger?: "cron" | "manual";
  iso_week?: string;
}

interface SignalEventRow {
  id: string;
  brand_id: string;
  signal_id: string;
  segment_hash: string;
  metric_actual: number | null;
  metric_expected: number | null;
  deviation_sigma: number | null;
  severity_hint: "WATCH" | "YELLOW" | "RED" | null;
  incident_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface IncidentRow {
  id: string;
  severity: "WATCH" | "YELLOW" | "RED";
  dispatch_status: string;
}

interface BrandRoutingRow {
  brand_id: string;
  slack_channel_id: string | null;
}

interface BrandRow {
  id: string;
  name: string | null;
  domain: string | null;
}

interface BrandDigest {
  brand_id: string;
  brand_name: string;
  brand_domain: string | null;
  signals: Array<{
    signal_id: string;
    signal_name: string | null;
    count: number;
    samples: Array<{ url?: string; keyword?: string; metric_actual: number | null }>;
  }>;
  channel_id: string;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isValidIsoWeek(s: string): boolean {
  return /^\d{4}-W\d{2}$/.test(s);
}

function isoWeekToDateRange(isoWeek: string): { start: string; end: string } {
  const m = isoWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error("invalid_iso_week");
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

function currentIsoWeek(): string {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

serve(async (req: Request) => {
  const authFail = verifyInternalSecret(req);
  if (authFail) return authFail;

  let body: DigestRequest;
  try {
    body = (await req.json()) as DigestRequest;
  } catch {
    return jsonResp({ ok: false, error: "invalid_json" }, 400);
  }

  if (!body?.trigger) return jsonResp({ ok: false, error: "missing_trigger" }, 400);
  if (body.iso_week && !isValidIsoWeek(body.iso_week)) {
    return jsonResp({ ok: false, error: "invalid_iso_week" }, 400);
  }

  const isoWeek = body.iso_week ?? currentIsoWeek();
  const { start, end } = isoWeekToDateRange(isoWeek);

  const oew = getOewClient();
  const hub = getHubClient();
  const pub = getPublicClient();

  try {
    const { data: events, error: evtErr } = await oew
      .from("signal_events")
      .select(
        "id, brand_id, signal_id, segment_hash, metric_actual, metric_expected, deviation_sigma, severity_hint, incident_id, payload, created_at",
      )
      .gte("created_at", `${start}T00:00:00Z`)
      .lte("created_at", `${end}T23:59:59Z`);
    if (evtErr) throw new Error(`signal_events: ${evtErr.message}`);

    const allEvents = (events ?? []) as SignalEventRow[];
    if (allEvents.length === 0) {
      return jsonResp({
        ok: true,
        iso_week: isoWeek,
        status: "no_watch_signals",
        brands_in_digest: 0,
        enqueued_count: 0,
      });
    }

    const incidentIds = Array.from(
      new Set(allEvents.map((e) => e.incident_id).filter((v): v is string => Boolean(v))),
    );
    const incidentMap = new Map<string, IncidentRow>();
    if (incidentIds.length > 0) {
      const { data: incs, error: incErr } = await oew
        .from("incidents")
        .select("id, severity, dispatch_status")
        .in("id", incidentIds);
      if (incErr) throw new Error(`incidents: ${incErr.message}`);
      for (const i of (incs ?? []) as IncidentRow[]) incidentMap.set(i.id, i);
    }

    const watchEvents = allEvents.filter((e) => {
      if (!e.incident_id) return true;
      const inc = incidentMap.get(e.incident_id);
      if (!inc) return true;
      if (inc.severity === "WATCH") return true;
      if (inc.dispatch_status === "deferred_to_digest") return true;
      if (inc.dispatch_status === "suppressed") return true;
      return false;
    });

    if (watchEvents.length === 0) {
      return jsonResp({
        ok: true,
        iso_week: isoWeek,
        status: "no_watch_signals",
        brands_in_digest: 0,
        enqueued_count: 0,
      });
    }

    const brandIds = Array.from(new Set(watchEvents.map((e) => e.brand_id)));

    const { data: routings, error: routingErr } = await oew
      .from("brand_routing")
      .select("brand_id, slack_channel_id")
      .in("brand_id", brandIds)
      .eq("active", true);
    if (routingErr) throw new Error(`brand_routing: ${routingErr.message}`);

    const fallbackChannel = Deno.env.get("SLACK_FALLBACK_CHANNEL") ?? null;
    const routingMap = new Map<string, string>();
    for (const r of (routings ?? []) as BrandRoutingRow[]) {
      const ch = r.slack_channel_id ?? fallbackChannel;
      if (ch) routingMap.set(r.brand_id, ch);
    }

    const { data: brands, error: brandsErr } = await hub
      .from("brands_registry")
      .select("id, name, domain")
      .in("id", brandIds);
    if (brandsErr) throw new Error(`brands: ${brandsErr.message}`);
    const brandMap = new Map<string, BrandRow>();
    for (const b of (brands ?? []) as BrandRow[]) brandMap.set(b.id, b);

    const { data: defs, error: defsErr } = await oew
      .from("signal_definitions")
      .select("id, name");
    if (defsErr) throw new Error(`signal_definitions: ${defsErr.message}`);
    const defMap = new Map<string, string | null>();
    for (const d of (defs ?? []) as Array<{ id: string; name: string | null }>) defMap.set(d.id, d.name);

    const byBrand = new Map<string, SignalEventRow[]>();
    for (const ev of watchEvents) {
      const arr = byBrand.get(ev.brand_id) ?? [];
      arr.push(ev);
      byBrand.set(ev.brand_id, arr);
    }

    const digests: BrandDigest[] = [];
    let signalsSummarized = 0;

    for (const [brandId, brandEvents] of byBrand) {
      const channel = routingMap.get(brandId);
      if (!channel) continue;

      const bySignal = new Map<string, SignalEventRow[]>();
      for (const ev of brandEvents) {
        const arr = bySignal.get(ev.signal_id) ?? [];
        arr.push(ev);
        bySignal.set(ev.signal_id, arr);
      }

      const signals: BrandDigest["signals"] = [];
      for (const [signalId, signalEvents] of bySignal) {
        const samples: Array<{ url?: string; keyword?: string; metric_actual: number | null }> = [];
        for (const ev of signalEvents.slice(0, 3)) {
          const urls = asStringArray(ev.payload?.affected_urls);
          const keywords = asStringArray(ev.payload?.affected_keywords);
          samples.push({
            url: urls[0],
            keyword: keywords[0],
            metric_actual: ev.metric_actual,
          });
        }
        signals.push({
          signal_id: signalId,
          signal_name: defMap.get(signalId) ?? null,
          count: signalEvents.length,
          samples,
        });
        signalsSummarized++;
      }

      const brand = brandMap.get(brandId);
      digests.push({
        brand_id: brandId,
        brand_name: brand?.name ?? "Marca desconocida",
        brand_domain: brand?.domain ?? null,
        signals: signals.sort((a, b) => b.count - a.count),
        channel_id: channel,
      });
    }

    if (digests.length === 0) {
      return jsonResp({
        ok: true,
        iso_week: isoWeek,
        status: "no_watch_signals",
        brands_in_digest: 0,
        enqueued_count: 0,
      });
    }

    const enqueueRows: Array<Record<string, unknown>> = digests.map((d) => {
      const { blocks, text } = buildDigestBlocks({
        iso_week: isoWeek,
        brand_name: d.brand_name,
        brand_domain: d.brand_domain ?? undefined,
        signals: d.signals,
      });
      return {
        source: "oew_alert",
        target_type: "channel",
        channel_id: d.channel_id,
        payload: { blocks, text },
        dedupe_key: `oew:digest:${isoWeek}:${d.brand_id}`,
        status: "pending",
      };
    });

    const { error: enqErr } = await pub
      .from("notifications_outbox")
      .upsert(enqueueRows, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (enqErr) throw new Error(`outbox enqueue: ${enqErr.message}`);

    return jsonResp({
      ok: true,
      iso_week: isoWeek,
      brands_in_digest: digests.length,
      signals_summarized: signalsSummarized,
      enqueued_count: enqueueRows.length,
      dedupe_key: `oew:digest:${isoWeek}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[oew-digest-weekly] ${msg}`);
    return jsonResp({ ok: false, error: "outbox_enqueue_failed" }, 500);
  }
});
