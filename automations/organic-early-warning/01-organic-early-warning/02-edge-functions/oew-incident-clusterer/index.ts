// oew-incident-clusterer
// Agrupa signal_events del run actual + signal_events de los últimos 14 días
// que ya tienen incident_id (para mergear con incidents abiertos). Heurística:
// mismo brand_id + ventana 14 días + solape >=50% en payload.affected_urls
// (con fallback a payload.affected_keywords). Cierra incidents stale (>14d sin
// signal_events nuevos) y aplica escalado de severidad por correlación.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getOewClient } from "../_shared/supabase.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { emitEvent } from "../_shared/run-events.ts";

const EVENT_SOURCE = "incident-clusterer";
const WINDOW_DAYS = 14;
const OVERLAP_THRESHOLD = 0.5;

type Severity = "WATCH" | "YELLOW" | "RED";

interface ClustererRequest {
  run_id?: string;
}

interface SignalEventRow {
  id: string;
  run_id: string;
  brand_id: string;
  signal_id: string;
  segment_hash: string;
  period_start: string | null;
  period_end: string | null;
  severity_hint: Severity | null;
  incident_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

interface IncidentRow {
  id: string;
  run_id: string;
  brand_id: string;
  severity: Severity;
  signal_event_ids: string[];
  status: "open" | "resolved";
  dispatch_status: string;
  window_start: string | null;
  window_end: string | null;
  last_updated_at: string;
  payload: Record<string, unknown> | null;
}

interface Cluster {
  brand_id: string;
  signal_event_ids: string[];
  urls: Set<string>;
  keywords: Set<string>;
  severity_hints: Severity[];
  has_top_traffic_s1: boolean;
  signal_ids: Set<string>;
  period_start: string | null;
  period_end: string | null;
  existing_incident_id: string | null;
  all_watch: boolean;
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

function extractUrlsKeywords(payload: Record<string, unknown> | null): { urls: string[]; keywords: string[] } {
  if (!payload) return { urls: [], keywords: [] };
  return {
    urls: asStringArray(payload.affected_urls),
    keywords: asStringArray(payload.affected_keywords),
  };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function maxSeverity(hints: Array<Severity | null | undefined>): Severity {
  let best: Severity = "WATCH";
  for (const h of hints) {
    if (h === "RED") return "RED";
    if (h === "YELLOW" && best !== "RED") best = "YELLOW";
  }
  return best;
}

function todayIso(): string {
  return new Date().toISOString();
}

function isoDateMinusDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

serve(async (req: Request) => {
  const authFail = verifyInternalSecret(req);
  if (authFail) return authFail;

  let body: ClustererRequest;
  try {
    body = (await req.json()) as ClustererRequest;
  } catch {
    return jsonResp({ ok: false, error: "invalid_json" }, 400);
  }

  const runId = body?.run_id;
  if (!runId) return jsonResp({ ok: false, error: "missing_run_id" }, 400);

  const oew = getOewClient();

  try {
    const { data: runRow, error: runErr } = await oew
      .from("analysis_runs")
      .select("id, status")
      .eq("id", runId)
      .maybeSingle();
    if (runErr) throw new Error(`run lookup: ${runErr.message}`);
    if (!runRow) return jsonResp({ ok: false, error: "run_not_found" }, 404);

    await emitEvent({
      client: oew,
      run_id: runId,
      event_source: EVENT_SOURCE,
      event_type: "agent_started",
    });

    const windowStartDate = isoDateMinusDays(WINDOW_DAYS);

    const { data: currentEvents, error: curErr } = await oew
      .from("signal_events")
      .select(
        "id, run_id, brand_id, signal_id, segment_hash, period_start, period_end, severity_hint, incident_id, payload, created_at",
      )
      .eq("run_id", runId);
    if (curErr) throw new Error(`signal_events current: ${curErr.message}`);

    const { data: priorEvents, error: priorErr } = await oew
      .from("signal_events")
      .select(
        "id, run_id, brand_id, signal_id, segment_hash, period_start, period_end, severity_hint, incident_id, payload, created_at",
      )
      .gte("created_at", `${windowStartDate}T00:00:00Z`)
      .neq("run_id", runId)
      .not("incident_id", "is", null);
    if (priorErr) throw new Error(`signal_events prior: ${priorErr.message}`);

    const allEvents = [
      ...((currentEvents ?? []) as SignalEventRow[]),
      ...((priorEvents ?? []) as SignalEventRow[]),
    ];

    const eligibleCurrent = (currentEvents ?? []).filter((e) => !e.incident_id) as SignalEventRow[];

    const eventsByBrand = new Map<string, SignalEventRow[]>();
    for (const ev of allEvents) {
      const arr = eventsByBrand.get(ev.brand_id) ?? [];
      arr.push(ev);
      eventsByBrand.set(ev.brand_id, arr);
    }

    let incidentsOpened = 0;
    let incidentsUpdated = 0;
    let signalsClustered = 0;
    let signalsOrphaned = 0;
    const clusteredEventIds = new Set<string>();

    for (const [brandId, brandEvents] of eventsByBrand) {
      const eligibleEvents = brandEvents.filter(
        (e) => e.run_id === runId && !clusteredEventIds.has(e.id) && !e.incident_id,
      );
      if (eligibleEvents.length === 0) continue;

      const clusters: Cluster[] = [];

      for (const ev of eligibleEvents) {
        const { urls, keywords } = extractUrlsKeywords(ev.payload);
        const urlSet = new Set(urls);
        const kwSet = new Set(keywords);
        let placed = false;

        for (const c of clusters) {
          const urlOverlap = jaccard(c.urls, urlSet);
          const kwOverlap = jaccard(c.keywords, kwSet);
          const overlap = Math.max(urlOverlap, kwOverlap);
          if (overlap >= OVERLAP_THRESHOLD) {
            c.signal_event_ids.push(ev.id);
            c.severity_hints.push(ev.severity_hint ?? "WATCH");
            c.signal_ids.add(ev.signal_id);
            for (const u of urlSet) c.urls.add(u);
            for (const k of kwSet) c.keywords.add(k);
            if (ev.severity_hint !== "WATCH") c.all_watch = false;
            const isTopTraffic = (ev.payload?.is_top_traffic_url === true);
            if (ev.signal_id === "S1" && isTopTraffic) c.has_top_traffic_s1 = true;
            if (ev.period_start && (!c.period_start || ev.period_start < c.period_start)) {
              c.period_start = ev.period_start;
            }
            if (ev.period_end && (!c.period_end || ev.period_end > c.period_end)) {
              c.period_end = ev.period_end;
            }
            placed = true;
            break;
          }
        }

        if (!placed) {
          clusters.push({
            brand_id: brandId,
            signal_event_ids: [ev.id],
            urls: urlSet,
            keywords: kwSet,
            severity_hints: [ev.severity_hint ?? "WATCH"],
            has_top_traffic_s1:
              ev.signal_id === "S1" && ev.payload?.is_top_traffic_url === true,
            signal_ids: new Set([ev.signal_id]),
            period_start: ev.period_start,
            period_end: ev.period_end,
            existing_incident_id: null,
            all_watch: (ev.severity_hint ?? "WATCH") === "WATCH",
          });
        }
      }

      const { data: openIncidents, error: openErr } = await oew
        .from("incidents")
        .select(
          "id, run_id, brand_id, severity, signal_event_ids, status, dispatch_status, window_start, window_end, last_updated_at, payload",
        )
        .eq("brand_id", brandId)
        .eq("status", "open")
        .gte("last_updated_at", `${windowStartDate}T00:00:00Z`);
      if (openErr) throw new Error(`incidents open lookup: ${openErr.message}`);

      const openRows = (openIncidents ?? []) as IncidentRow[];

      const incidentUrlSets = new Map<string, { urls: Set<string>; keywords: Set<string> }>();
      if (openRows.length > 0) {
        const ids = openRows.map((r) => r.signal_event_ids).flat();
        const uniqIds = Array.from(new Set(ids));
        if (uniqIds.length > 0) {
          const { data: incidentEvents, error: incEvtErr } = await oew
            .from("signal_events")
            .select("id, incident_id, payload")
            .in("id", uniqIds);
          if (incEvtErr) throw new Error(`incident events: ${incEvtErr.message}`);
          for (const inc of openRows) {
            const urls = new Set<string>();
            const keywords = new Set<string>();
            for (const e of (incidentEvents ?? []) as Array<{ id: string; incident_id: string | null; payload: Record<string, unknown> | null }>) {
              if (e.incident_id !== inc.id) continue;
              const ext = extractUrlsKeywords(e.payload);
              for (const u of ext.urls) urls.add(u);
              for (const k of ext.keywords) keywords.add(k);
            }
            incidentUrlSets.set(inc.id, { urls, keywords });
          }
        }
      }

      for (const c of clusters) {
        let bestMatch: { incident: IncidentRow; overlap: number } | null = null;
        for (const inc of openRows) {
          const sets = incidentUrlSets.get(inc.id);
          if (!sets) continue;
          const urlOverlap = jaccard(sets.urls, c.urls);
          const kwOverlap = jaccard(sets.keywords, c.keywords);
          const overlap = Math.max(urlOverlap, kwOverlap);
          if (overlap >= OVERLAP_THRESHOLD) {
            if (!bestMatch || overlap > bestMatch.overlap) {
              bestMatch = { incident: inc, overlap };
            }
          }
        }
        if (bestMatch) c.existing_incident_id = bestMatch.incident.id;
      }

      for (const c of clusters) {
        let severity: Severity = maxSeverity(c.severity_hints);
        if (c.signal_event_ids.length >= 3) severity = "RED";
        if (c.has_top_traffic_s1) severity = "RED";
        if (c.all_watch) severity = "WATCH";

        const dispatchStatus = c.all_watch ? "deferred_to_digest" : "pending";

        const overlapPct = c.urls.size > 0 || c.keywords.size > 0 ? OVERLAP_THRESHOLD : 0;

        const nowIso = todayIso();

        if (c.existing_incident_id) {
          const existing = openRows.find((r) => r.id === c.existing_incident_id);
          if (!existing) continue;
          const mergedIds = Array.from(new Set([...existing.signal_event_ids, ...c.signal_event_ids]));
          const mergedSeverity = severity === "RED" || existing.severity === "RED"
            ? "RED"
            : severity === "YELLOW" || existing.severity === "YELLOW"
              ? "YELLOW"
              : "WATCH";

          const { error: updErr } = await oew
            .from("incidents")
            .update({
              signal_event_ids: mergedIds,
              signal_count: mergedIds.length,
              severity: mergedSeverity,
              dispatch_status: mergedSeverity === "WATCH" ? "deferred_to_digest" : existing.dispatch_status,
              last_updated_at: nowIso,
              window_end: c.period_end ?? existing.window_end,
            })
            .eq("id", existing.id);
          if (updErr) throw new Error(`incident update: ${updErr.message}`);

          const { error: linkErr } = await oew
            .from("signal_events")
            .update({ incident_id: existing.id })
            .in("id", c.signal_event_ids);
          if (linkErr) throw new Error(`signal_events link existing: ${linkErr.message}`);

          for (const id of c.signal_event_ids) clusteredEventIds.add(id);
          signalsClustered += c.signal_event_ids.length;
          incidentsUpdated++;

          await emitEvent({
            client: oew,
            run_id: runId,
            brand_id: brandId,
            event_source: EVENT_SOURCE,
            event_type: "incident_clustered",
            payload: {
              incident_id: existing.id,
              merged: true,
              severity: mergedSeverity,
              signals_added: c.signal_event_ids.length,
            },
          });
        } else {
          const { data: inserted, error: insErr } = await oew
            .from("incidents")
            .insert({
              run_id: runId,
              brand_id: brandId,
              severity,
              signal_count: c.signal_event_ids.length,
              signal_event_ids: c.signal_event_ids,
              window_start: c.period_start,
              window_end: c.period_end,
              url_overlap_pct: overlapPct,
              status: "open",
              dispatch_status: dispatchStatus,
              payload: {
                affected_urls: Array.from(c.urls).slice(0, 50),
                affected_keywords: Array.from(c.keywords).slice(0, 50),
                signal_ids: Array.from(c.signal_ids),
              },
            })
            .select("id")
            .single();
          if (insErr || !inserted) throw new Error(`incident insert: ${insErr?.message ?? "no row"}`);

          const newId = inserted.id as string;
          const { error: linkErr } = await oew
            .from("signal_events")
            .update({ incident_id: newId })
            .in("id", c.signal_event_ids);
          if (linkErr) throw new Error(`signal_events link new: ${linkErr.message}`);

          for (const id of c.signal_event_ids) clusteredEventIds.add(id);
          signalsClustered += c.signal_event_ids.length;
          incidentsOpened++;

          await emitEvent({
            client: oew,
            run_id: runId,
            brand_id: brandId,
            event_source: EVENT_SOURCE,
            event_type: "incident_clustered",
            payload: {
              incident_id: newId,
              merged: false,
              severity,
              signal_count: c.signal_event_ids.length,
            },
          });
        }
      }
    }

    for (const ev of eligibleCurrent) {
      if (!clusteredEventIds.has(ev.id)) signalsOrphaned++;
    }

    const closeCutoffIso = isoDateMinusDays(WINDOW_DAYS);
    const { data: stale, error: staleErr } = await oew
      .from("incidents")
      .select("id, brand_id")
      .eq("status", "open")
      .lt("last_updated_at", `${closeCutoffIso}T00:00:00Z`);
    if (staleErr) throw new Error(`stale incidents lookup: ${staleErr.message}`);

    let incidentsClosed = 0;
    const staleRows = (stale ?? []) as Array<{ id: string; brand_id: string }>;
    if (staleRows.length > 0) {
      const ids = staleRows.map((r) => r.id);
      const { error: closeErr } = await oew
        .from("incidents")
        .update({ status: "resolved", resolved_at: todayIso() })
        .in("id", ids);
      if (closeErr) throw new Error(`close stale: ${closeErr.message}`);
      incidentsClosed = ids.length;
      for (const r of staleRows) {
        await emitEvent({
          client: oew,
          run_id: runId,
          brand_id: r.brand_id,
          event_source: EVENT_SOURCE,
          event_type: "incident_clustered",
          payload: { incident_id: r.id, auto_resolved: true },
        });
      }
    }

    if (signalsOrphaned > 0) {
      await emitEvent({
        client: oew,
        run_id: runId,
        event_source: EVENT_SOURCE,
        event_type: "warning",
        payload: { reason: "signal_events_orphaned", count: signalsOrphaned },
      });
    }

    await emitEvent({
      client: oew,
      run_id: runId,
      event_source: EVENT_SOURCE,
      event_type: "agent_completed",
      payload: {
        incidents_opened: incidentsOpened,
        incidents_updated: incidentsUpdated,
        incidents_closed: incidentsClosed,
        signal_events_clustered: signalsClustered,
        signal_events_orphaned: signalsOrphaned,
      },
    });

    return jsonResp({
      ok: true,
      run_id: runId,
      incidents_opened: incidentsOpened,
      incidents_updated: incidentsUpdated,
      incidents_closed: incidentsClosed,
      signal_events_clustered: signalsClustered,
      signal_events_orphaned: signalsOrphaned,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[oew-incident-clusterer] ${msg}`);
    try {
      await emitEvent({
        client: oew,
        run_id: runId,
        event_source: EVENT_SOURCE,
        event_type: "agent_failed",
        error_message: msg,
      });
    } catch (_) { /* swallow */ }
    return jsonResp({ ok: false, error: "clustering_failed" }, 500);
  }
});
