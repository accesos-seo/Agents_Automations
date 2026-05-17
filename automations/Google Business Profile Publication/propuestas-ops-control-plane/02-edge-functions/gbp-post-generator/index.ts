import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://stjugsrkrweakvzmizpq.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const DB_HEADERS = {
  "Content-Type": "application/json",
  "apikey": SERVICE_ROLE_KEY,
  "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
  "Prefer": "return=minimal",
};

const GBP_POSTS_PER_MONTH = 4;

// Month divided into 4 weekly slots by day range
const WEEK_SLOTS = [
  { start: 1,  end: 7  },
  { start: 8,  end: 14 },
  { start: 15, end: 21 },
  { start: 22, end: 31 },
];

// ---------- Types ----------

interface ContentItem {
  id: string;
  title: string;
  main_keyword: string;
  meta_description: string | null;
  final_published_url: string | null;
  proyecto_id: string;
  client_id: string;
  language: string | null;
  country: string | null;
}

interface ArticleAnalysis {
  summary_150_words: string | null;
  search_intent: string | null;
  customer_journey_stage: string | null;
  recommended_cta_type: string | null;
}

interface ProjectInfo {
  nombremarca: string;
  lider_id: string | null;
  slack_channel_id: string | null;
}

// ---------- Supabase REST helpers ----------

async function dbGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...DB_HEADERS, "Prefer": "return=representation" },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T[]>;
}

async function dbPatch(table: string, filter: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: DB_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table} → ${res.status}: ${await res.text()}`);
}

async function dbInsert(table: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: DB_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`INSERT ${table} → ${res.status}: ${await res.text()}`);
}

// ---------- Business logic helpers ----------

async function isGBPEnabledForProject(proyectoId: string): Promise<boolean> {
  const rows = await dbGet<{ services: { service_type: string; is_active: boolean }[] }>(
    `project_services?proyecto_id=eq.${proyectoId}&is_active=eq.true&select=services`
  );
  if (!rows.length) return false;
  return (rows[0].services ?? []).some(
    (s) => s.service_type === "seo_local" && s.is_active === true
  );
}

async function countMonthlyGBPPosts(proyectoId: string, year: number, month: number): Promise<number> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  const end   = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;

  const rows = await dbGet<{ id: string }>(
    `content_items?proyecto_id=eq.${proyectoId}` +
    `&content_type=eq.blog_post` +
    `&gbp_status=in.(draft_ready,seo_approved,scheduled,published)` +
    `&gbp_scheduled_date=gte.${start}&gbp_scheduled_date=lt.${end}` +
    `&select=id`
  );
  return rows.length;
}

async function findFirstWorkingDayInRange(
  year: number,
  month: number,
  dayStart: number,
  dayEnd: number
): Promise<string | null> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-${pad(dayStart)}`;
  const end   = `${year}-${pad(month)}-${pad(Math.min(dayEnd, 31))}`;

  const rows = await dbGet<{ calendar_date: string }>(
    `business_calendar?calendar_date=gte.${start}&calendar_date=lte.${end}` +
    `&is_working_day=eq.true&order=calendar_date.asc&limit=1&select=calendar_date`
  );
  return rows[0]?.calendar_date ?? null;
}

async function calculateGBPScheduledDate(proyectoId: string): Promise<string | null> {
  const now = new Date();

  for (let offset = 0; offset < 4; offset++) {
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year  = target.getFullYear();
    const month = target.getMonth() + 1;

    const existing = await countMonthlyGBPPosts(proyectoId, year, month);
    if (existing >= GBP_POSTS_PER_MONTH) continue;

    const slot = WEEK_SLOTS[existing]; // 0-based: slot for position existing+1
    const date = await findFirstWorkingDayInRange(year, month, slot.start, slot.end);
    if (date) return date;
  }

  return null; // no slot found in the next 4 months
}

async function fetchContentItem(id: string): Promise<ContentItem | null> {
  const rows = await dbGet<ContentItem>(
    `content_items?id=eq.${id}` +
    `&select=id,title,main_keyword,meta_description,final_published_url,proyecto_id,client_id,language,country`
  );
  return rows[0] ?? null;
}

async function fetchArticleAnalysis(contentItemId: string): Promise<ArticleAnalysis | null> {
  const rows = await dbGet<ArticleAnalysis>(
    `article_analysis_index?content_item_id=eq.${contentItemId}` +
    `&select=summary_150_words,search_intent,customer_journey_stage,recommended_cta_type`
  );
  return rows[0] ?? null;
}

async function fetchProjectInfo(proyectoId: string): Promise<ProjectInfo | null> {
  const rows = await dbGet<ProjectInfo>(
    `proyectos_seo?id=eq.${proyectoId}&select=nombremarca,lider_id,slack_channel_id`
  );
  return rows[0] ?? null;
}

// ---------- GBP post generation ----------

async function generateGBPPost(params: {
  title: string;
  mainKeyword: string;
  metaDescription: string | null;
  summary: string | null;
  brandName: string;
  articleUrl: string | null;
  language: string | null;
  ctaType: string | null;
}): Promise<string> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const isEnglish = (params.language ?? "es").toLowerCase().startsWith("en");
  const lang = isEnglish ? "English" : "español";

  // Best available context: summary > meta description > title only
  const context = params.summary
    ?? params.metaDescription
    ?? `Artículo sobre: ${params.title}`;

  const urlLine = params.articleUrl ? `\nURL: ${params.articleUrl}` : "";

  const system = isEnglish
    ? `You are a Google Business Profile copywriting expert. Write short, direct, action-oriented posts.
Use 1–2 relevant emojis. Maximum 70 words. Structure: hook (user pain/need) → brand solution → concrete CTA.
Always include the URL at the end if provided. Write only the post text, no preamble.`
    : `Eres experto en copywriting para Google Business Profile. Escribe posts cortos, directos y accionables.
Usa 1–2 emojis relevantes. Máximo 70 palabras. Estructura: gancho (problema/necesidad del usuario) → solución con nombre de la marca → CTA concreto.
Incluye la URL al final si se proporciona. Escribe solo el texto del post, sin introducción.`;

  const user = isEnglish
    ? `Write a Google Business Profile post for the brand "${params.brandName}".

Context: ${context}
Main keyword: ${params.mainKeyword}${urlLine}

Rules: max 70 words · 1–2 emojis · clear CTA · write in English`
    : `Crea un post de Google Business Profile para la marca "${params.brandName}".

Contexto: ${context}
Keyword principal: ${params.mainKeyword}${urlLine}

Reglas: máximo 70 palabras · 1–2 emojis · CTA claro · escribe en español`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return text.trim();
}

// ---------- Side effects ----------

async function saveGBPDraft(params: {
  contentItemId: string;
  gbpContent: string;
  scheduledDate: string;
}): Promise<void> {
  await dbPatch("content_items", `id=eq.${params.contentItemId}`, {
    gbp_post_content:  params.gbpContent,
    gbp_scheduled_date: params.scheduledDate,
    gbp_status:        "draft_ready",
    updated_at:        new Date().toISOString(),
  });
}

async function markAsOverQuota(contentItemId: string): Promise<void> {
  await dbPatch("content_items", `id=eq.${contentItemId}`, {
    gbp_status: "over_quota",
    gbp_notes:
      "Sin cupo trimestral disponible. Se procesará en el siguiente ciclo cuando haya un slot libre.",
    updated_at: new Date().toISOString(),
  });
}

async function notifyLider(params: {
  liderId: string;
  contentItemId: string;
  articleTitle: string;
  brandName: string;
  scheduledDate: string;
}): Promise<void> {
  const message =
    `📝 *Borrador GBP listo para revisión*\n\n` +
    `*Marca:* ${params.brandName}\n` +
    `*Artículo:* ${params.articleTitle}\n` +
    `*Fecha GBP agendada:* ${params.scheduledDate}\n\n` +
    `Revisa y aprueba en el Local SEO Hub → sección GBP.`;

  await dbInsert("notifications_outbox", {
    source:      "gbp-post-generator",
    user_id:     params.liderId,
    target_type: "content_item",
    target_id:   params.contentItemId,
    type:        "gbp_draft_ready",
    payload: {
      message,
      brand_name:      params.brandName,
      article_title:   params.articleTitle,
      scheduled_date:  params.scheduledDate,
      content_item_id: params.contentItemId,
    },
    priority:   70,
    status:     "pending",
    dedupe_key: `gbp_draft_${params.contentItemId}`,
  });
}

// ---------- Main handler ----------

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body: { content_item_id?: string; proyecto_id?: string; client_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { content_item_id, proyecto_id } = body;
  if (!content_item_id || !proyecto_id) {
    return new Response(
      JSON.stringify({ error: "content_item_id and proyecto_id are required" }),
      { status: 400 }
    );
  }

  try {
    // ① Check seo_local enabled for this project
    const gbpEnabled = await isGBPEnabledForProject(proyecto_id);
    if (!gbpEnabled) {
      console.log(`[gbp-post-generator] Skipped ${content_item_id}: seo_local not active`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "seo_local not enabled for project" }),
        { status: 200 }
      );
    }

    // ② Find next available trimestral slot
    const scheduledDate = await calculateGBPScheduledDate(proyecto_id);
    if (!scheduledDate) {
      await markAsOverQuota(content_item_id);
      console.log(`[gbp-post-generator] Over quota ${content_item_id}: no slot in next 4 months`);
      return new Response(
        JSON.stringify({ skipped: true, reason: "no available slot in next 4 months" }),
        { status: 200 }
      );
    }

    // ③ Fetch article data
    const [contentItem, analysis, project] = await Promise.all([
      fetchContentItem(content_item_id),
      fetchArticleAnalysis(content_item_id),
      fetchProjectInfo(proyecto_id),
    ]);

    if (!contentItem) {
      return new Response(JSON.stringify({ error: "content item not found" }), { status: 404 });
    }
    if (!project) {
      return new Response(JSON.stringify({ error: "project not found" }), { status: 404 });
    }

    // ④ Generate GBP post
    const gbpContent = await generateGBPPost({
      title:           contentItem.title,
      mainKeyword:     contentItem.main_keyword,
      metaDescription: contentItem.meta_description,
      summary:         analysis?.summary_150_words ?? null,
      brandName:       project.nombremarca,
      articleUrl:      contentItem.final_published_url,
      language:        contentItem.language,
      ctaType:         analysis?.recommended_cta_type ?? null,
    });

    // ⑤ Save draft + notify lider (in parallel)
    await Promise.all([
      saveGBPDraft({ contentItemId: content_item_id, gbpContent, scheduledDate }),
      project.lider_id
        ? notifyLider({
            liderId:       project.lider_id,
            contentItemId: content_item_id,
            articleTitle:  contentItem.title,
            brandName:     project.nombremarca,
            scheduledDate,
          })
        : Promise.resolve(),
    ]);

    console.log(
      `[gbp-post-generator] ✓ ${project.nombremarca} | "${contentItem.title}" → ${scheduledDate}`
    );

    return new Response(
      JSON.stringify({
        success:            true,
        content_item_id,
        brand:              project.nombremarca,
        gbp_status:         "draft_ready",
        gbp_scheduled_date: scheduledDate,
        gbp_word_count:     gbpContent.split(" ").length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[gbp-post-generator] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
