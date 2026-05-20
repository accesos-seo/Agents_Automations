import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { verifyInternalSecret } from "../_shared/secret.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { CrawlLoaderRequest } from "../_shared/types.ts";

const MAX_BASE64_DECODED_BYTES = 50 * 1024 * 1024;
const CRAWL_BATCH = 500;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

interface CrawlRow {
  brand_id: string;
  crawl_date: string;
  url: string;
  status_code: number | null;
  content_type: string | null;
  meta_robots: string | null;
  canonical_url: string | null;
  is_indexable: boolean | null;
  internal_links_in: number | null;
  internal_links_out: number | null;
  is_orphan: boolean | null;
  redirect_chain_depth: number | null;
  h1_count: number | null;
  title: string | null;
  meta_description: string | null;
}

function asInt(v: string | undefined): number | null {
  if (v === undefined || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function asBool(v: string | undefined): boolean | null {
  if (v === undefined || v === "") return null;
  const s = v.toLowerCase().trim();
  if (s === "true" || s === "yes" || s === "1" || s === "indexable") return true;
  if (s === "false" || s === "no" || s === "0" || s === "non-indexable") return false;
  return null;
}

function asStr(v: string | undefined): string | null {
  if (v === undefined || v === "") return null;
  return v;
}

function parseCsv(content: string, brandId: string, crawlDate: string): CrawlRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const urlIdx = idx("url") !== -1 ? idx("url") : idx("address");
  const statusIdx = idx("status_code") !== -1 ? idx("status_code") : idx("status code");
  const contentTypeIdx = idx("content_type") !== -1 ? idx("content_type") : idx("content type");
  const metaRobotsIdx = idx("meta_robots") !== -1 ? idx("meta_robots") : idx("meta robots 1");
  const canonicalIdx = idx("canonical_url") !== -1 ? idx("canonical_url") : idx("canonical link element 1");
  const indexableIdx = idx("indexable") !== -1 ? idx("indexable") : idx("indexability");
  const inlinksIdx = idx("internal_inlinks") !== -1 ? idx("internal_inlinks") : idx("inlinks");
  const outlinksIdx = idx("internal_outlinks") !== -1 ? idx("internal_outlinks") : idx("outlinks");
  const orphanIdx = idx("is_orphan") !== -1 ? idx("is_orphan") : idx("orphan");
  const redirectIdx = idx("redirect_chain_depth") !== -1 ? idx("redirect_chain_depth") : idx("redirect chain depth");
  const h1CountIdx = idx("h1_count") !== -1 ? idx("h1_count") : idx("h1-1 length");
  const titleIdx = idx("title") !== -1 ? idx("title") : idx("title 1");
  const metaDescIdx = idx("meta_description") !== -1 ? idx("meta_description") : idx("meta description 1");

  if (urlIdx === -1) throw new Error("parse_failed: csv missing url column");

  const rows: CrawlRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const url = cells[urlIdx];
    if (!url) continue;
    rows.push({
      brand_id: brandId,
      crawl_date: crawlDate,
      url,
      status_code: statusIdx !== -1 ? asInt(cells[statusIdx]) : null,
      content_type: contentTypeIdx !== -1 ? asStr(cells[contentTypeIdx]) : null,
      meta_robots: metaRobotsIdx !== -1 ? asStr(cells[metaRobotsIdx]) : null,
      canonical_url: canonicalIdx !== -1 ? asStr(cells[canonicalIdx]) : null,
      is_indexable: indexableIdx !== -1 ? asBool(cells[indexableIdx]) : null,
      internal_links_in: inlinksIdx !== -1 ? asInt(cells[inlinksIdx]) : null,
      internal_links_out: outlinksIdx !== -1 ? asInt(cells[outlinksIdx]) : null,
      is_orphan: orphanIdx !== -1 ? asBool(cells[orphanIdx]) : null,
      redirect_chain_depth: redirectIdx !== -1 ? asInt(cells[redirectIdx]) : null,
      h1_count: h1CountIdx !== -1 ? asInt(cells[h1CountIdx]) : null,
      title: titleIdx !== -1 ? asStr(cells[titleIdx]) : null,
      meta_description: metaDescIdx !== -1 ? asStr(cells[metaDescIdx]) : null,
    });
  }
  return rows;
}

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  return m[1].trim().replace(/<!\[CDATA\[(.*?)\]\]>/s, "$1");
}

function parseXmlSitemap(content: string, brandId: string, crawlDate: string): CrawlRow[] {
  const rows: CrawlRow[] = [];
  const urlMatches = content.match(/<url>[\s\S]*?<\/url>/gi) ?? [];
  for (const block of urlMatches) {
    const loc = extractTag(block, "loc");
    if (!loc) continue;
    rows.push({
      brand_id: brandId,
      crawl_date: crawlDate,
      url: loc,
      status_code: null,
      content_type: null,
      meta_robots: null,
      canonical_url: null,
      is_indexable: null,
      internal_links_in: null,
      internal_links_out: null,
      is_orphan: null,
      redirect_chain_depth: null,
      h1_count: null,
      title: null,
      meta_description: null,
    });
  }
  return rows;
}

serve(async (req: Request) => {
  const denied = verifyInternalSecret(req);
  if (denied) return denied;
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body: CrawlLoaderRequest;
  try {
    body = await req.json() as CrawlLoaderRequest;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body.brand_id || !body.crawl_date || !body.format || !body.export_url_or_base64) {
    return jsonResponse({ ok: false, error: "missing_fields" }, 400);
  }
  if (body.format !== "csv" && body.format !== "xml") {
    return jsonResponse({ ok: false, error: "invalid_format" }, 400);
  }
  if (!DATE_REGEX.test(body.crawl_date)) {
    return jsonResponse({ ok: false, error: "invalid_crawl_date" }, 400);
  }

  const supa = getServiceClient();

  const { data: brandRow, error: brandErr } = await supa
    .from("brands_registry")
    .select("id")
    .eq("id", body.brand_id)
    .maybeSingle();
  if (brandErr) {
    return jsonResponse({ ok: false, error: "brand_query_failed", detail: brandErr.message }, 500);
  }
  if (!brandRow) {
    return jsonResponse({ ok: false, error: "brand_not_found" }, 404);
  }

  const { data: runRow, error: runErr } = await supa
    .from("ingestion_runs")
    .insert({
      source: "crawl",
      brand_id: body.brand_id,
      period_start: body.crawl_date,
      period_end: body.crawl_date,
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    return jsonResponse({ ok: false, error: "upsert_failed", detail: runErr?.message }, 500);
  }
  const ingestionRunId = runRow.id as string;

  await emitEvent({
    client: supa,
    run_id: ingestionRunId,
    brand_id: body.brand_id,
    event_source: "hub-crawl-loader",
    event_type: "run_started",
    payload: { format: body.format, crawl_date: body.crawl_date },
  });

  try {
    let content: string;
    const source = body.export_url_or_base64;
    if (source.startsWith("base64:")) {
      const b64 = source.substring("base64:".length);
      let raw: Uint8Array;
      try {
        raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      } catch {
        throw new Error("parse_failed: base64 decode failed");
      }
      if (raw.byteLength > MAX_BASE64_DECODED_BYTES) {
        throw new Error("payload_too_large");
      }
      content = new TextDecoder().decode(raw);
    } else if (source.startsWith("https://") || source.startsWith("http://")) {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`fetch_failed: ${res.status}`);
      content = await res.text();
    } else {
      throw new Error("parse_failed: unrecognized export source");
    }

    let rows: CrawlRow[];
    try {
      rows = body.format === "csv"
        ? parseCsv(content, body.brand_id, body.crawl_date)
        : parseXmlSitemap(content, body.brand_id, body.crawl_date);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`parse_failed: ${msg}`);
    }
    if (rows.length === 0) throw new Error("parse_failed: zero rows extracted");

    let rowsInserted = 0;
    for (let i = 0; i < rows.length; i += CRAWL_BATCH) {
      const batch = rows.slice(i, i + CRAWL_BATCH);
      const { error } = await supa
        .from("crawl_snapshots")
        .upsert(batch, { onConflict: "brand_id,crawl_date,url" });
      if (error) throw new Error(`upsert_failed: ${error.message}`);
      rowsInserted += batch.length;
    }

    await supa.from("ingestion_runs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        rows_inserted: rowsInserted,
        payload: { urls_parsed: rows.length, format: body.format },
      })
      .eq("id", ingestionRunId);

    await emitEvent({
      client: supa,
      run_id: ingestionRunId,
      brand_id: body.brand_id,
      event_source: "hub-crawl-loader",
      event_type: "run_completed",
      payload: { urls_parsed: rows.length },
    });

    return jsonResponse({
      ok: true,
      snapshot_id: ingestionRunId,
      brand_id: body.brand_id,
      crawl_date: body.crawl_date,
      urls_parsed: rows.length,
      rows_inserted: rowsInserted,
      rows_updated: 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await supa.from("ingestion_runs")
      .update({ status: "failed", completed_at: new Date().toISOString(), error_message: msg })
      .eq("id", ingestionRunId);
    await emitEvent({
      client: supa,
      run_id: ingestionRunId,
      brand_id: body.brand_id,
      event_source: "hub-crawl-loader",
      event_type: "run_failed",
      error_message: msg,
    });
    let code = "upsert_failed";
    let status = 500;
    if (msg.startsWith("parse_failed")) { code = "parse_failed"; status = 422; }
    else if (msg.startsWith("payload_too_large")) { code = "payload_too_large"; status = 400; }
    else if (msg.startsWith("fetch_failed")) { code = "fetch_failed"; status = 500; }
    return jsonResponse({ ok: false, error: code, detail: msg }, status);
  }
});
