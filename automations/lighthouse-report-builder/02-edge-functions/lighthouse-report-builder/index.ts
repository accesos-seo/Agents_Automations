/**
 * lighthouse-report-builder (agent_6) — v1
 *
 * Cierra el último gap del pipeline Ahrefs Lighthouse: convierte los datos
 * ingestados + diagnóstico + recovery plan en un informe estructurado de 6
 * secciones que el frontend `/seo/analisis/<id>/informe` consume.
 *
 * Disparadores:
 *   1. Invocación HTTP desde `ahrefs-total-orchestrator` (modo síncrono, al
 *      finalizar la fase de recovery_plan).
 *   2. Invocación manual con `x-internal-secret` para reprocesar runs viejos.
 *
 * Input esperado:
 *   POST con JSON { orchestration_id: uuid, force?: boolean }
 *   - force=true permite regenerar aun si ya existe un report (incrementa version).
 *
 * Output:
 *   { ok: true, report_id, sections_created, generated_at }
 *
 * Secretos requeridos (Supabase Functions):
 *   SUPABASE_URL                            (auto)
 *   SUPABASE_SERVICE_ROLE_KEY               (auto)
 *   OPENROUTER_API_KEY
 *   LIGHTHOUSE_REPORT_INTERNAL_SECRET       (header x-internal-secret)
 *   LIGHTHOUSE_REPORT_MODEL                 (opcional, default "anthropic/claude-sonnet-4")
 *
 * Despliegue:
 *   supabase functions deploy lighthouse-report-builder --no-verify-jwt
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = (Deno.env.get("OPENROUTER_API_KEY") || "").trim();
const INTERNAL_SECRET = (Deno.env.get("LIGHTHOUSE_REPORT_INTERNAL_SECRET") || "").trim();
const LLM_MODEL = (Deno.env.get("LIGHTHOUSE_REPORT_MODEL") || "anthropic/claude-sonnet-4").trim();

const SCHEMA = "ahrefs_web_analysis";
const REPORT_TYPE = "traffic_loss_analysis";
const REPORT_AGENT = "agent_6";

type Orchestration = {
  id: string;
  domain: string;
  target_url: string;
  client_name: string | null;
  country: string | null;
  snapshot_date: string;
  diagnostic_result: Record<string, unknown> | null;
  recovery_plan_result: Record<string, unknown> | null;
  comparison_result: Record<string, unknown> | null;
};

type ReportContext = {
  client_id: string;
  client_name: string;
  domain: string;
  target_url: string;
  country: string;
  snapshot_date: string;
  orchestration: Orchestration;
  last_run_id: string;
  metrics: SiteMetrics;
  top_keywords: KeywordRow[];
  top_pages: PageRow[];
  findings: FindingRow[];
  recovery_actions: RecoveryRow[];
  diagnostic_summary: Record<string, unknown> | null;
};

type SiteMetrics = {
  organic_traffic: number;
  organic_keywords: number;
  traffic_value: number;
  backlinks_total: number;
  backlinks_dofollow: number;
  referring_domains: number;
  domain_rating_avg_links: number;
  domain_rating_max_links: number;
  position_buckets: {
    pos_1: number; pos_2_3: number; pos_4_5: number;
    pos_6_10: number; pos_gt_10: number;
  };
  homepage_url_rating: number | null;
};

type KeywordRow = {
  keyword: string; position: number | null; volume: number | null;
  cpc: number | null; traffic_estimate: number | null; value_usd: number;
};

type PageRow = {
  url: string; traffic_estimate: number | null;
  keywords_count: number | null; url_rating: number | null;
  traffic_value: number | null;
};

type FindingRow = {
  title: string; description: string | null; finding_type: string;
  impact_score: number | null; effort_score: number | null;
  priority_rank: number | null; finding_confidence: number | null;
  evidence: Record<string, unknown> | null;
};

type RecoveryRow = {
  phase: string; action_title: string; action_description: string | null;
  responsible: string | null; estimated_impact: string | null;
  effort_level: string | null; expected_traffic_recovery: number | null;
  success_metric: string | null; action_category: string | null;
};

type SectionDraft = {
  section_key: string;
  section_title: string;
  section_order: number;
  body_markdown: string;
};

const SECTION_SCHEMA: Array<Omit<SectionDraft, "body_markdown">> = [
  { section_key: "executive_summary",   section_title: "Resumen Ejecutivo",                 section_order: 1 },
  { section_key: "site_snapshot",       section_title: "Snapshot del Dominio",              section_order: 2 },
  { section_key: "traffic_loss_summary",section_title: "Análisis del Estado del Tráfico",   section_order: 3 },
  { section_key: "diagnosis",           section_title: "Diagnóstico de Oportunidades y Riesgos", section_order: 4 },
  { section_key: "recovery_plan",       section_title: "Plan de Recuperación",              section_order: 5 },
  { section_key: "appendix",            section_title: "Apéndice Técnico",                  section_order: 6 },
];

async function pgGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Accept-Profile": SCHEMA,
    },
  });
  if (!res.ok) throw new Error(`PostgREST GET ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function pgPost(path: string, body: unknown, prefer = "return=representation"): Promise<unknown> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": SCHEMA,
      Prefer: prefer,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PostgREST POST ${path}: ${res.status} ${await res.text()}`);
  return res.status === 201 || prefer === "return=representation" ? await res.json() : null;
}

async function pgPatch(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": SCHEMA,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PostgREST PATCH ${path}: ${res.status} ${await res.text()}`);
}

async function pgRpc<T>(name: string, body: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": SCHEMA,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RPC ${name}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function loadOrchestration(orchestration_id: string): Promise<Orchestration> {
  const rows = await pgGet<Orchestration[]>(
    `pipeline_orchestrations?select=id,domain,target_url,client_name,country,snapshot_date,diagnostic_result,recovery_plan_result,comparison_result&id=eq.${orchestration_id}`
  );
  if (!rows.length) throw new Error(`Orchestration ${orchestration_id} not found`);
  return rows[0];
}

async function findClientId(domain: string, orchestration_id: string): Promise<{ client_id: string; last_run_id: string }> {
  // El client_id no está en pipeline_orchestrations directamente.
  // Lo recuperamos vía analysis_runs del mismo orchestration window.
  const runs = await pgGet<Array<{ id: string; client_id: string; started_at: string }>>(
    `analysis_runs?select=id,client_id,started_at&domain=eq.${domain}&order=started_at.desc&limit=4`
  );
  if (!runs.length) throw new Error(`No analysis_runs found for domain ${domain}`);
  // Tomamos el client_id consensuado (todos deberían ser el mismo)
  const client_id = runs[0].client_id;
  const last_run_id = runs[0].id;
  return { client_id, last_run_id };
}

async function loadMetrics(client_id: string): Promise<SiteMetrics> {
  // Usamos una RPC inline vía PostgREST count: para evitar varias roundtrips
  // calculamos en un solo SQL vía rpc imposible (no hay), entonces hacemos varios GETs.
  const kw = await pgGet<KeywordRow[]>(
    `organic_keywords?select=keyword,position,volume,cpc,traffic_estimate&client_id=eq.${client_id}`
  );
  const bl = await pgGet<Array<{ is_dofollow: boolean; domain_rating_source: number | null }>>(
    `backlinks?select=is_dofollow,domain_rating_source&client_id=eq.${client_id}`
  );
  const rd = await pgGet<Array<{ id: string }>>(
    `referring_domains?select=id&client_id=eq.${client_id}`
  );
  const tp = await pgGet<PageRow[]>(
    `top_pages?select=url,traffic_estimate,keywords_count,url_rating,traffic_value&client_id=eq.${client_id}&order=traffic_estimate.desc.nullslast&limit=50`
  );

  const buckets = { pos_1: 0, pos_2_3: 0, pos_4_5: 0, pos_6_10: 0, pos_gt_10: 0 };
  let organic_traffic = 0;
  let traffic_value = 0;
  for (const k of kw) {
    const t = Number(k.traffic_estimate ?? 0);
    const c = Number(k.cpc ?? 0);
    organic_traffic += t;
    traffic_value += t * c;
    const p = k.position ?? 999;
    if (p === 1) buckets.pos_1++;
    else if (p <= 3) buckets.pos_2_3++;
    else if (p <= 5) buckets.pos_4_5++;
    else if (p <= 10) buckets.pos_6_10++;
    else buckets.pos_gt_10++;
  }

  const dr_values = bl.map(b => Number(b.domain_rating_source ?? 0)).filter(v => v > 0);
  const dr_avg = dr_values.length ? dr_values.reduce((a, b) => a + b, 0) / dr_values.length : 0;
  const dr_max = dr_values.length ? Math.max(...dr_values) : 0;
  const dofollow = bl.filter(b => b.is_dofollow).length;

  const homepage = tp.find(p => /\/(es|en)?\/?$/.test(p.url) || p.url.endsWith("/")) ?? tp[0];

  return {
    organic_traffic: Math.round(organic_traffic),
    organic_keywords: kw.length,
    traffic_value: Math.round(traffic_value),
    backlinks_total: bl.length,
    backlinks_dofollow: dofollow,
    referring_domains: rd.length,
    domain_rating_avg_links: Math.round(dr_avg * 10) / 10,
    domain_rating_max_links: dr_max,
    position_buckets: buckets,
    homepage_url_rating: homepage ? Number(homepage.url_rating ?? null) : null,
  };
}

async function loadTopKeywords(client_id: string, limit = 10): Promise<KeywordRow[]> {
  const all = await pgGet<KeywordRow[]>(
    `organic_keywords?select=keyword,position,volume,cpc,traffic_estimate&client_id=eq.${client_id}`
  );
  return all
    .map(k => ({ ...k, value_usd: Math.round(Number(k.traffic_estimate ?? 0) * Number(k.cpc ?? 0)) }))
    .sort((a, b) => b.value_usd - a.value_usd)
    .slice(0, limit);
}

async function loadTopPages(client_id: string, limit = 10): Promise<PageRow[]> {
  return await pgGet<PageRow[]>(
    `top_pages?select=url,traffic_estimate,keywords_count,url_rating,traffic_value&client_id=eq.${client_id}&order=traffic_estimate.desc.nullslast&limit=${limit}`
  );
}

async function loadFindings(client_id: string): Promise<FindingRow[]> {
  return await pgGet<FindingRow[]>(
    `agent_findings?select=title,description,finding_type,impact_score,effort_score,priority_rank,finding_confidence,evidence&client_id=eq.${client_id}&order=priority_rank.asc`
  );
}

async function loadRecovery(client_id: string): Promise<RecoveryRow[]> {
  return await pgGet<RecoveryRow[]>(
    `recovery_plan?select=phase,action_title,action_description,responsible,estimated_impact,effort_level,expected_traffic_recovery,success_metric,action_category&client_id=eq.${client_id}&order=priority_rank.asc`
  );
}

async function upsertSiteOverview(ctx: ReportContext): Promise<void> {
  // ¿Ya existe un row reciente? (mismo client + dia)
  const existing = await pgGet<Array<{ id: string }>>(
    `site_overview?select=id&client_id=eq.${ctx.client_id}&order=captured_at.desc&limit=1`
  );
  const payload = {
    run_id: ctx.last_run_id,
    client_id: ctx.client_id,
    domain: ctx.domain,
    organic_traffic: ctx.metrics.organic_traffic,
    organic_keywords: ctx.metrics.organic_keywords,
    backlinks_total: ctx.metrics.backlinks_total,
    referring_domains: ctx.metrics.referring_domains,
    traffic_value: ctx.metrics.traffic_value,
    url_rating: ctx.metrics.homepage_url_rating,
    domain_rating: ctx.metrics.domain_rating_avg_links,
    captured_at: new Date().toISOString(),
  };
  if (existing.length) {
    await pgPatch(`site_overview?id=eq.${existing[0].id}`, payload);
  } else {
    await pgPost(`site_overview`, payload, "return=minimal");
  }
}

function buildLlmPrompt(ctx: ReportContext): string {
  // El prompt pide al LLM las 6 secciones en JSON estructurado.
  // El esquema de salida es rígido para que el parsing sea determinista.
  const compactCtx = {
    client_name: ctx.client_name,
    domain: ctx.domain,
    target_url: ctx.target_url,
    country: ctx.country.toUpperCase(),
    snapshot_date: ctx.snapshot_date,
    metrics: ctx.metrics,
    top_keywords_by_value: ctx.top_keywords,
    top_pages: ctx.top_pages,
    findings: ctx.findings,
    recovery_actions: ctx.recovery_actions,
    comparison_summary: ctx.orchestration.comparison_result,
    diagnostic_summary: ctx.orchestration.diagnostic_result,
  };

  return `Sos un analista SEO senior de SeoLab Agency. Generás informes de diagnóstico de tráfico orgánico siguiendo una estructura fija de 6 secciones. Los informes los lee la dirección de marketing del cliente: deben ser concisos, accionables y técnicamente sólidos. Hablás en español rioplatense profesional ("se detectó", no "se ha detectado"), sin coloquialismos.

DATOS DEL ANÁLISIS (todos verificables, vienen de Ahrefs API):
\`\`\`json
${JSON.stringify(compactCtx, null, 2)}
\`\`\`

REGLAS NO NEGOCIABLES:
1. Usá EXCLUSIVAMENTE los números provistos. Nunca inventes métricas.
2. Si una métrica falta o vale 0 en un campo donde sería raro (ej: comparison_summary.organic_keywords_lost=0 en un primer análisis), reconocelo explícitamente como "baseline ausente" en vez de afirmar caídas.
3. Cada sección debe tener tablas markdown cuando hay datos tabulares. NO uses HTML.
4. NO inventes recomendaciones que no se desprenden de los findings + recovery_actions.
5. La sección "appendix" debe incluir IDs técnicos del análisis para trazabilidad.

ESTRUCTURA DE SALIDA — devolvé EXCLUSIVAMENTE un JSON válido con esta forma:
\`\`\`json
{
  "sections": {
    "executive_summary": "<markdown con título, hallazgo principal en tabla, 2-3 párrafos de lectura estratégica, próximos pasos numerados>",
    "site_snapshot": "<markdown con tablas de Métricas Generales, Distribución por posición en Google, Top 10 páginas, Top keywords por valor>",
    "traffic_loss_summary": "<markdown con la comparativa histórica honesta (si no hay baseline, decirlo), análisis de concentración del riesgo>",
    "diagnosis": "<markdown con risk score, lista detallada de findings (uno por uno con tabla de evidencia), lo que el diagnóstico descarta>",
    "recovery_plan": "<markdown con el plan en fases (Quick Win + Mes 1-3), tabla resumen con tráfico esperado, métricas de éxito>",
    "appendix": "<markdown con tabla de IDs técnicos, metodología (qué edge functions corrieron), limitaciones de la corrida, recomendación de próxima ejecución>"
  }
}
\`\`\`

IMPORTANTE: el output debe ser JSON parseable. NO incluyas \`\`\`json wrappers en tu respuesta — solo el objeto JSON puro.`;
}

async function callOpenRouter(prompt: string): Promise<{ sections: Record<string, string> }> {
  if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://seolabagency.com",
      "X-Title": "Lighthouse Report Builder",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 8000,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter empty content: ${JSON.stringify(data).slice(0, 500)}`);
  try {
    return JSON.parse(content);
  } catch (_e) {
    // Algunos providers wrappean en ```json
    const cleaned = content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned);
  }
}

function buildSectionsFromLlm(llm: { sections: Record<string, string> }): SectionDraft[] {
  const drafts: SectionDraft[] = [];
  for (const def of SECTION_SCHEMA) {
    const md = llm.sections?.[def.section_key];
    if (!md || typeof md !== "string") {
      throw new Error(`LLM response missing section "${def.section_key}"`);
    }
    drafts.push({ ...def, body_markdown: md.trim() });
  }
  return drafts;
}

async function persistReport(ctx: ReportContext, drafts: SectionDraft[], force: boolean): Promise<{ report_id: string; sections_created: number }> {
  // Idempotencia: si ya existe un report para el run_id y NO se pidió force, devolvemos ese.
  const existing = await pgGet<Array<{ id: string; report_version: number }>>(
    `reports?select=id,report_version&run_id=eq.${ctx.last_run_id}&order=report_version.desc&limit=1`
  );
  if (existing.length && !force) {
    return { report_id: existing[0].id, sections_created: 0 };
  }
  const next_version = existing.length ? existing[0].report_version + 1 : 1;

  const inserted = await pgPost(`reports`, {
    run_id: ctx.last_run_id,
    client_id: ctx.client_id,
    domain: ctx.domain,
    report_type: REPORT_TYPE,
    report_status: "generated",
    report_version: next_version,
    output_format: "markdown",
    generated_by_agent: REPORT_AGENT,
    generated_at: new Date().toISOString(),
  }) as Array<{ id: string }>;
  const report_id = inserted[0].id;

  const sectionRows = drafts.map(d => ({
    report_id,
    section_key: d.section_key,
    section_title: d.section_title,
    section_order: d.section_order,
    section_status: "generated",
    body_markdown: d.body_markdown,
    generated_by_agent: REPORT_AGENT,
  }));
  await pgPost(`report_sections`, sectionRows, "return=minimal");

  return { report_id, sections_created: sectionRows.length };
}

async function emitEvent(run_id: string, type: string, message: string, payload: Record<string, unknown>) {
  await pgPost(`analysis_run_events`, {
    run_id,
    event_type: type,
    event_source: "lighthouse-report-builder",
    message,
    payload,
  }, "return=minimal").catch((e) => console.error("emitEvent failed:", e));
}

async function handle(req: Request): Promise<Response> {
  let body: { orchestration_id?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* ok */ }

  if (!body.orchestration_id) {
    return new Response(JSON.stringify({ error: "missing orchestration_id" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const orchestration = await loadOrchestration(body.orchestration_id);
  const { client_id, last_run_id } = await findClientId(orchestration.domain, orchestration.id);
  const metrics = await loadMetrics(client_id);
  const top_keywords = await loadTopKeywords(client_id, 10);
  const top_pages = await loadTopPages(client_id, 10);
  const findings = await loadFindings(client_id);
  const recovery_actions = await loadRecovery(client_id);

  const ctx: ReportContext = {
    client_id,
    client_name: orchestration.client_name || orchestration.domain,
    domain: orchestration.domain,
    target_url: orchestration.target_url,
    country: orchestration.country || "",
    snapshot_date: orchestration.snapshot_date,
    orchestration,
    last_run_id,
    metrics,
    top_keywords,
    top_pages,
    findings,
    recovery_actions,
    diagnostic_summary: orchestration.diagnostic_result,
  };

  await upsertSiteOverview(ctx);
  await emitEvent(last_run_id, "agent_started", "agent_6 iniciado", {
    orchestration_id: body.orchestration_id, model: LLM_MODEL,
  });

  const prompt = buildLlmPrompt(ctx);
  const llmResponse = await callOpenRouter(prompt);
  const drafts = buildSectionsFromLlm(llmResponse);

  const { report_id, sections_created } = await persistReport(ctx, drafts, body.force === true);

  await emitEvent(last_run_id, "agent_completed", "Informe final generado", {
    report_id, sections_created, generated_by_agent: REPORT_AGENT, model: LLM_MODEL,
  });

  return new Response(JSON.stringify({
    ok: true,
    report_id,
    sections_created,
    generated_at: new Date().toISOString(),
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!INTERNAL_SECRET) {
    return new Response(JSON.stringify({
      error: "server_misconfigured: LIGHTHOUSE_REPORT_INTERNAL_SECRET missing",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if ((req.headers.get("x-internal-secret") || "") !== INTERNAL_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    return await handle(req);
  } catch (err) {
    console.error("lighthouse-report-builder error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
