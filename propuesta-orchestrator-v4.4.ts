// seo-content-orchestrator v4.4 — footer zone: Customer Journey, Assets, Lógica del contenido
// Fix: language enforcement (no more Spanish in PT content) + language-aware headings
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
type J = Record<string, unknown>;
type Item = { id:string; client_id?:string|null; proyecto_id?:string|null; title?:string|null; slug?:string|null; main_keyword?:string|null; secondary_keywords?:unknown; status?:string|null; language?:string|null; brief_data?:unknown; raw_source_content?:string|null; article_content?:string|null; meta_description?:string|null; custom_metadata?:J|null; archived?:boolean|null };
type Project = { id:string; nombremarca?:string|null; idioma_objetivo?:string|null; paisobjetivo?:string|null };
type Section = { key:string; kind:"intro"|"h2"|"faq"|"cta"|"expansion"; heading:string; minWords:number; payload?:unknown };
type Contract = { source:string; extensionRaw:string|null; extensionSource?:string|null; extensionComplianceRule?:string; min:number|null; max:number|null; h1:string|null; slug:string|null; metaTitle:string|null; metaDescription:string|null; keyword:string|null; secondary:string[]; intent:string|null; audience:string|null; angle:string|null; h2:string[]; h2Details:J[]; faq:string[]; cta:string|null; research:string|null; facts:string[]; sections:Section[] };
type Val = { passed:boolean; wordCount:number; issues:string[]; missingH1:boolean; missingH2:string[]; missingFaq:string[]; missingCta:boolean; missingKeyword:boolean; missingFacts:string[]; extensionRaw:string|null; targetWordMin:number|null; targetWordMax:number|null };
const VERSION = "4.6";
const CORS = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };

function faqHeading(language:string):string{
  const lang=(language||"").toLowerCase().trim();
  if(lang==="pt"||lang==="pt-br")return "Perguntas Frequentes";
  if(lang==="en"||lang==="en-us")return "Frequently Asked Questions";
  return "Preguntas Frecuentes";
}

function introHeading(language:string):string{
  const lang=(language||"").toLowerCase().trim();
  if(lang==="pt"||lang==="pt-br")return "Introdução";
  if(lang==="en"||lang==="en-us")return "Introduction";
  return "Introducción";
}

function langName(language:string):string{
  const lang=(language||"").toLowerCase().trim();
  if(lang==="pt"||lang==="pt-br")return "português brasileiro";
  if(lang==="en"||lang==="en-us")return "English";
  return "español";
}

function footerZoneLabels(language: string) {
  const lang = (language || "").toLowerCase().trim();
  if (lang === "pt" || lang === "pt-br") return {
    assets: "Ativos", customerJourney: "Jornada do Cliente", editorialLogic: "Lógica editorial",
    supplementaryContent: "Conteúdo complementar",
    stage: "Etapa", userNeed: "Necessidade do usuário", contentResponse: "Como o conteúdo responde",
    flowRationale: "Raciocínio do fluxo", searchIntentAlignment: "Alinhamento com intenção de busca", audienceInsight: "Perfil do público",
    whyStructure: "Por que essa estrutura", targetReader: "Leitor-alvo", contentDist: "Distribuição do conteúdo",
    editorialDecisions: "Decisões editoriais", conversionRationale: "Estratégia de conversão", qualitySignals: "Sinais de qualidade",
    mainKeyword: "Palavra-chave principal", secondaryKeywords: "Palavras-chave secundárias",
    intent: "Intenção de busca", audience: "Público-alvo", angle: "Ângulo editorial",
    targetLength: "Extensão alvo", metaTitle: "Meta title", metaDescription: "Meta description",
    structure: "Estrutura do artigo", faqQuestions: "Perguntas frequentes",
    seoOptimization: "Otimização SEO",
    metaOg: "Meta & Open Graph", seoChecklist: "Checklist SEO", seoImages: "Imagens — Alt tags",
    featuredImageNote: "A imagem destacada (og_image_url) é gerenciada pelo image skill.",
    noImagesFound: "Nenhuma imagem encontrada no HTML do artigo.",
    altCurrent: "Alt atual", altSuggested: "Alt sugerido", titleAttr: "Title", chars: "chars",
    checkH1Present: "H1 presente no artigo", checkKwInH1: "Keyword no H1",
    checkKwInMeta: "Keyword no meta title", checkKwInDesc: "Keyword na meta description",
    checkMetaTitleLen: "Meta title (ideal 50–60)", checkMetaDescLen: "Meta description (ideal 140–160)",
    checkFaq: "FAQ presente", checkCta: "CTA presente", checkSlug: "Slug definido",
    checkWordCount: "Contagem de palavras", ogImageNote: "Gerenciada pelo image skill",
  };
  if (lang === "en" || lang === "en-us") return {
    assets: "Assets", customerJourney: "Customer Journey", editorialLogic: "Editorial Logic",
    supplementaryContent: "Supplementary content",
    stage: "Stage", userNeed: "User need", contentResponse: "How content responds",
    flowRationale: "Flow rationale", searchIntentAlignment: "Search intent alignment", audienceInsight: "Audience profile",
    whyStructure: "Why this structure", targetReader: "Target reader", contentDist: "Content distribution",
    editorialDecisions: "Editorial decisions", conversionRationale: "Conversion strategy", qualitySignals: "Quality signals",
    mainKeyword: "Main keyword", secondaryKeywords: "Secondary keywords",
    intent: "Search intent", audience: "Target audience", angle: "Editorial angle",
    targetLength: "Target length", metaTitle: "Meta title", metaDescription: "Meta description",
    structure: "Article structure", faqQuestions: "FAQ questions",
    seoOptimization: "SEO Optimization",
    metaOg: "Meta & Open Graph", seoChecklist: "SEO Checklist", seoImages: "Images — Alt tags",
    featuredImageNote: "The featured image (og_image_url) is managed by the image skill.",
    noImagesFound: "No images found in the article HTML.",
    altCurrent: "Current alt", altSuggested: "Suggested alt", titleAttr: "Title", chars: "chars",
    checkH1Present: "H1 present in article", checkKwInH1: "Keyword in H1",
    checkKwInMeta: "Keyword in meta title", checkKwInDesc: "Keyword in meta description",
    checkMetaTitleLen: "Meta title (ideal 50–60)", checkMetaDescLen: "Meta description (ideal 140–160)",
    checkFaq: "FAQ present", checkCta: "CTA present", checkSlug: "Slug defined",
    checkWordCount: "Word count", ogImageNote: "Managed by image skill",
  };
  return {
    assets: "Assets", customerJourney: "Customer Journey", editorialLogic: "Lógica del contenido",
    supplementaryContent: "Contenido complementario",
    stage: "Etapa", userNeed: "Necesidad del usuario", contentResponse: "Cómo responde el contenido",
    flowRationale: "Razonamiento del flujo", searchIntentAlignment: "Alineación con intención de búsqueda", audienceInsight: "Perfil de la audiencia",
    whyStructure: "Por qué esta estructura", targetReader: "Lector objetivo", contentDist: "Distribución del contenido",
    editorialDecisions: "Decisiones editoriales", conversionRationale: "Estrategia de conversión", qualitySignals: "Señales de calidad",
    mainKeyword: "Keyword principal", secondaryKeywords: "Keywords secundarias",
    intent: "Intención de búsqueda", audience: "Audiencia objetivo", angle: "Ángulo editorial",
    targetLength: "Extensión objetivo", metaTitle: "Meta title", metaDescription: "Meta description",
    structure: "Estructura del artículo", faqQuestions: "Preguntas frecuentes",
    seoOptimization: "Optimización SEO",
    metaOg: "Meta & Open Graph", seoChecklist: "Checklist SEO", seoImages: "Imágenes — Alt tags",
    featuredImageNote: "La imagen destacada (og_image_url) es gestionada por el image skill.",
    noImagesFound: "No se encontraron imágenes en el HTML del artículo.",
    altCurrent: "Alt actual", altSuggested: "Alt sugerido", titleAttr: "Title", chars: "chars",
    checkH1Present: "H1 presente en el artículo", checkKwInH1: "Keyword principal en H1",
    checkKwInMeta: "Keyword en meta title", checkKwInDesc: "Keyword en meta description",
    checkMetaTitleLen: "Meta title (ideal 50–60)", checkMetaDescLen: "Meta description (ideal 140–160)",
    checkFaq: "FAQ presente", checkCta: "CTA presente", checkSlug: "Slug definido",
    checkWordCount: "Conteo de palabras", ogImageNote: "Gestionada por image skill",
  };
}

function promptCustomerJourney(master: J, seo: J, c: Contract, language: string): string {
  return `You are a senior SEO content strategist. Based on the article brief, generate a detailed customer journey map that explains WHY this content flow serves the reader. Write everything in ${langName(language)}. Make it feel like expert editorial strategy — intentional, professional, well-reasoned.

Context:
- H1: ${c.h1}
- Main keyword: ${c.keyword}
- Search intent: ${String(c.intent || obj(seo).search_intent || "informational")}
- Audience: ${c.audience}
- Editorial angle: ${c.angle}
- Article sections: ${c.h2.join(" | ")}
- Brand: ${String(master.brand || "")}

Return ONLY valid JSON, no markdown:
{
  "stages": [
    {
      "number": 1,
      "name": "stage name (3-5 words)",
      "icon_label": "single emoji",
      "user_state": "What the user is feeling/thinking at this stage — 1-2 sentences in ${langName(language)}",
      "user_need": "What specific information they need — 1-2 sentences in ${langName(language)}",
      "content_response": "How this article section responds to that need — 1-2 sentences in ${langName(language)}",
      "section_reference": "H2 or section name that covers this stage"
    }
  ],
  "flow_rationale": "2-3 sentence paragraph explaining why the stages flow in this specific order — in ${langName(language)}",
  "search_intent_alignment": "2 sentences: how the journey aligns with the keyword search intent — in ${langName(language)}",
  "audience_insight": "2 sentences: who this reader is and what drives their decision to search — in ${langName(language)}"
}`;
}

function promptEditorialLogic(master: J, seo: J, c: Contract, val: Val, language: string): string {
  return `You are an editorial director presenting the rationale behind a completed SEO article. Write in ${langName(language)}. Sound like a senior strategist — intelligent, reasoned, confident. This must feel human and intentional, not AI-generated.

Context:
- H1: ${c.h1}
- Keyword: ${c.keyword}
- Intent: ${String(c.intent || obj(seo).search_intent || "")}
- Audience: ${c.audience}
- Angle: ${c.angle}
- Sections: ${c.h2.join(" → ")}
- FAQ: ${c.faq.length} questions
- Word count: ${val.wordCount} words
- Extension target: ${c.extensionRaw}
- Brand: ${String(master.brand || "")}

Return ONLY valid JSON, no markdown:
{
  "why_structure": "2-3 sentences: why the article is organized in this specific sequence — in ${langName(language)}",
  "search_intent_served": "2 sentences: which search intent this satisfies and how — in ${langName(language)}",
  "target_reader_profile": "2-3 sentences: who reads this, what triggers their search, what they hope to find — in ${langName(language)}",
  "content_distribution_logic": "2 sentences: how information density is distributed for comprehension and retention — in ${langName(language)}",
  "key_editorial_decisions": [
    "Decision 1 — in ${langName(language)}",
    "Decision 2 — in ${langName(language)}",
    "Decision 3 — in ${langName(language)}"
  ],
  "conversion_rationale": "2 sentences: how the structure leads toward conversion or desired action — in ${langName(language)}",
  "quality_signals": "1-2 sentences: what E-E-A-T signals this content demonstrates — in ${langName(language)}"
}`;
}

function buildFooterZone(cj: J, el: J, c: Contract, val: Val, articleHtml: string, brand: string, language: string): string {
  const L = footerZoneLabels(language);
  const uid = "fz" + Date.now().toString(36);

  // ── SEO CALCULATIONS (shared) ──────────────────────────────────
  const seoNorm = function(s: string) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  };
  const kw = seoNorm(c.keyword || "");
  const mtLen = (c.metaTitle || "").length;
  const mdLen = (c.metaDescription || "").length;
  const kwInH1 = !!kw && seoNorm(c.h1 || "").includes(kw);
  const kwInMeta = !!kw && seoNorm(c.metaTitle || "").includes(kw);
  const kwInDesc = !!kw && seoNorm(c.metaDescription || "").includes(kw);
  const mtState: "ok"|"warn"|"err" = mtLen >= 50 && mtLen <= 60 ? "ok" : (mtLen >= 40 && mtLen <= 70 ? "warn" : "err");
  const mdState: "ok"|"warn"|"err" = mdLen >= 140 && mdLen <= 160 ? "ok" : (mdLen >= 120 && mdLen <= 175 ? "warn" : "err");
  const faqOk = c.faq.length > 0 && val.missingFaq.length === 0;
  const wcMin = c.min || 0;
  const wcMax = c.max || 0;
  const wcOk = (!wcMin || val.wordCount >= wcMin) && (!wcMax || val.wordCount <= wcMax);
  const wcWarn = !wcOk && wcMin > 0 && val.wordCount >= Math.round(wcMin * 0.88);

  // Build checklist states array for gauge
  type CheckState = "ok" | "warn" | "err";
  const checks: CheckState[] = [
    (!val.missingH1 ? "ok" : "err") as CheckState,
    (kwInH1 ? "ok" : (kw ? "err" : "warn")) as CheckState,
    (kwInMeta ? "ok" : (kw && c.metaTitle ? "err" : "warn")) as CheckState,
    (kwInDesc ? "ok" : (kw && c.metaDescription ? "warn" : "warn")) as CheckState,
    mtState,
    mdState,
    (faqOk ? "ok" : (c.faq.length > 0 ? "warn" : "err")) as CheckState,
    (!val.missingCta ? "ok" : "warn") as CheckState,
    (c.slug ? "ok" : "warn") as CheckState,
    (wcOk ? "ok" : (wcWarn ? "warn" : "err")) as CheckState,
  ];
  const totalChecks = checks.length;
  const passCount = checks.filter(s => s === "ok").length;
  const warnCount = checks.filter(s => s === "warn").length;
  const score = Math.round(passCount / totalChecks * 100);
  const circ = 301.59; // 2 * Math.PI * 48
  const dashoffset = circ * (1 - score / 100);
  const gaugeColor = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#f87171";

  // ── ASSETS TAB ────────────────────────────────────────────────
  const allKws = c.secondary;
  const visibleKws = allKws.slice(0, 3);
  const moreKws = allKws.length > 3 ? allKws.length - 3 : 0;
  const kwTagsHtml = visibleKws.map(function(k) {
    return '<span class="seo-fz-tag">' + esc(String(k)) + "</span>";
  }).join("") + (moreKws > 0 ? '<span class="seo-fz-tag seo-fz-tag--more">+' + moreKws + " more</span>" : "");

  const wcPct = wcMin > 0 ? Math.min(100, Math.round(val.wordCount / wcMin * 100)) : 0;
  const wcBarColor = wcOk ? "#10b981" : (wcWarn ? "#f59e0b" : "#f87171");
  const sections = c.h2.slice(0, 8);
  const sectionCardsHtml = sections.map(function(s, i) {
    const num = String(i + 1).padStart(2, "0");
    return `<div class="seo-fz-sec-card">
  <div class="seo-fz-sec-num">SECTION ${num}</div>
  <div class="seo-fz-sec-title">${esc(String(s))}</div>
</div>`;
  }).join("");

  const assetsHtml = `<div class="seo-fz-assets">
  <div class="seo-fz-assets-row1">
    <div class="seo-fz-asset-card seo-fz-asset-card--kw">
      <div class="seo-fz-asset-label">${esc(L.mainKeyword)}</div>
      <div class="seo-fz-kw-display">${esc(c.keyword || "—")}</div>
      <div class="seo-fz-asset-tags">${kwTagsHtml}</div>
    </div>
    <div class="seo-fz-asset-card seo-fz-asset-card--intent">
      <div class="seo-fz-asset-label">${esc(L.intent)}</div>
      <div class="seo-fz-intent-primary">${esc(String(c.intent || "—"))}</div>
      <div class="seo-fz-intent-secondary">${esc(String(c.audience || "—")).slice(0, 48)}</div>
    </div>
    <div class="seo-fz-asset-card seo-fz-asset-card--length">
      <div class="seo-fz-asset-label">${esc(L.targetLength)}</div>
      <div class="seo-fz-length-display">${esc(c.extensionRaw || (wcMin && wcMax ? wcMin + " – " + wcMax : wcMin ? wcMin + "+" : "—"))}</div>
      <div class="seo-fz-length-unit">${language === "en" || language === "en-us" ? "words" : (language === "pt" || language === "pt-br" ? "palavras" : "palabras/words")}</div>
      <div class="seo-fz-length-bar"><div class="seo-fz-length-bar-fill" style="width:${wcPct}%;background:${wcBarColor}"></div></div>
      <div class="seo-fz-length-note">est. ${val.wordCount} words &middot; ${wcPct}%</div>
    </div>
  </div>
  <div class="seo-fz-assets-row2">
    <div class="seo-fz-asset-card">
      <div class="seo-fz-asset-label">${esc(L.audience)}</div>
      <div class="seo-fz-asset-body">${esc(String(c.audience || "—"))}</div>
    </div>
    <div class="seo-fz-asset-card">
      <div class="seo-fz-asset-label">${esc(L.angle)}</div>
      <div class="seo-fz-asset-body">${esc(String(c.angle || "—"))}</div>
    </div>
  </div>
  ${sections.length ? `<div class="seo-fz-asset-card seo-fz-asset-card--full">
    <div class="seo-fz-structure-header">
      <span class="seo-fz-asset-label">${esc(L.structure)}</span>
      <span class="seo-fz-structure-count">${sections.length} sections</span>
    </div>
    <div class="seo-fz-sec-grid">${sectionCardsHtml}</div>
  </div>` : ""}
</div>`;

  // ── CUSTOMER JOURNEY TAB ──────────────────────────────────────
  const stages: J[] = Array.isArray(cj.stages) ? cj.stages : [];
  const displayStages = stages.length >= 2 ? stages.slice(0, 4) : null;

  // SVG flow map — sinusoidal bezier curve with 4 circles
  const svgPoints = [150, 300, 450, 650];
  const svgYs = [60, 100, 40, 80];
  const svgFlowMap = `<svg viewBox="0 0 800 140" xmlns="http://www.w3.org/2000/svg" class="seo-fz-cj-svg" aria-hidden="true">
  <defs>
    <linearGradient id="${uid}-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7c6fff"/>
      <stop offset="100%" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>
  <path d="M${svgPoints[0]},${svgYs[0]} C${svgPoints[0]+60},${svgYs[0]} ${svgPoints[1]-60},${svgYs[1]} ${svgPoints[1]},${svgYs[1]} C${svgPoints[1]+60},${svgYs[1]} ${svgPoints[2]-60},${svgYs[2]} ${svgPoints[2]},${svgYs[2]} C${svgPoints[2]+60},${svgYs[2]} ${svgPoints[3]-60},${svgYs[3]} ${svgPoints[3]},${svgYs[3]}" fill="none" stroke="url(#${uid}-grad)" stroke-width="2.5" stroke-linecap="round"/>
  ${svgPoints.map(function(x, i) {
    const y = svgYs[i];
    const stg = stages[i] || {};
    const label = esc(String(stg.name || "Stage " + (i + 1))).slice(0, 18);
    const sublabel = esc(String(stg.icon_label || String(i + 1)));
    return `<circle cx="${x}" cy="${y}" r="18" fill="#14111e" stroke="#7c6fff" stroke-width="1.5"/>
  <text x="${x}" y="${y+5}" text-anchor="middle" fill="#f0eeff" font-size="12" font-weight="600" font-family="system-ui,sans-serif">${i + 1}</text>
  <text x="${x}" y="${y+38}" text-anchor="middle" fill="#8b85a8" font-size="10" font-family="system-ui,sans-serif">${label}</text>`;
  }).join("\n  ")}
</svg>`;

  const cjStageCards = (displayStages || stages.slice(0, 4)).map(function(s, i) {
    const stageNum = String(s.number || i + 1).padStart(2, "0");
    const stageName = esc(String(s.name || "Stage " + (i + 1)));
    const userNeed = esc(String(s.user_need || ""));
    const userState = esc(String(s.user_state || ""));
    const contentResp = esc(String(s.content_response || ""));
    const sectionRef = s.section_reference ? esc(String(s.section_reference)) : "";
    return `<div class="seo-fz-cj-card">
  <div class="seo-fz-cj-card-header">
    <span class="seo-fz-cj-card-num">${stageNum}</span>
    <span class="seo-fz-cj-card-name">${stageName}</span>
  </div>
  ${userNeed ? `<div class="seo-fz-cj-field"><div class="seo-fz-cj-field-label">${esc(L.userNeed)}</div><div class="seo-fz-cj-field-text">${userNeed}</div></div>` : ""}
  ${userState ? `<div class="seo-fz-cj-field"><div class="seo-fz-cj-field-label">STATE</div><div class="seo-fz-cj-field-text">${userState}</div></div>` : ""}
  ${contentResp ? `<div class="seo-fz-cj-field"><div class="seo-fz-cj-field-label">${esc(L.contentResponse)}</div><div class="seo-fz-cj-field-text">${contentResp}</div></div>` : ""}
  ${sectionRef ? `<div class="seo-fz-cj-ref">&rarr; ${sectionRef}</div>` : ""}
</div>`;
  }).join("");

  const fallbackCjHtml = stages.length === 0 ? `<div class="seo-fz-cj-fallback">
  <div class="seo-fz-asset-label">READER FLOW MAP</div>
  <p style="color:#8b85a8;font-size:13px;margin:12px 0 0">Keyword: <strong style="color:#f0eeff">${esc(c.keyword || "—")}</strong> &middot; ${esc(L.intent)}: <strong style="color:#f0eeff">${esc(String(c.intent || "—"))}</strong> &middot; ${esc(L.audience)}: <strong style="color:#f0eeff">${esc(String(c.audience || "—"))}</strong></p>
</div>` : "";

  const cjInsightCards = [
    cj.flow_rationale ? { title: L.flowRationale, content: String(cj.flow_rationale) } : null,
    cj.search_intent_alignment ? { title: L.searchIntentAlignment, content: String(cj.search_intent_alignment) } : null,
    cj.audience_insight ? { title: L.audienceInsight, content: String(cj.audience_insight) } : null,
  ].filter(Boolean) as { title: string; content: string }[];

  const cjHtml = `<div class="seo-fz-cj">
  <div class="seo-fz-asset-label" style="margin-bottom:16px">READER FLOW MAP</div>
  ${stages.length >= 2 ? svgFlowMap : ""}
  ${stages.length > 0 ? `<div class="seo-fz-cj-cards">${cjStageCards}</div>` : fallbackCjHtml}
  ${cjInsightCards.length > 0 ? `<div class="seo-fz-cj-insights">${cjInsightCards.map(function(ins) {
    return `<div class="seo-fz-cj-insight"><div class="seo-fz-cj-insight-title">${esc(ins.title)}</div><p>${esc(ins.content)}</p></div>`;
  }).join("")}</div>` : ""}
</div>`;

  // ── EDITORIAL LOGIC TAB ───────────────────────────────────────
  const decisions: string[] = Array.isArray(el.key_editorial_decisions) ? el.key_editorial_decisions.map(String) : [];
  const elDecisionsHtml = decisions.length ? decisions.map(function(d, i) {
    const num = String(i + 1).padStart(2, "0");
    return `<div class="seo-fz-el-decision"><span class="seo-fz-el-dec-num">${num}</span><span class="seo-fz-el-dec-text">${esc(d)}</span></div>`;
  }).join("") : "";

  const elHtml = `<div class="seo-fz-el">
  ${el.why_structure ? `<div class="seo-fz-el-pullquote">
    <div class="seo-fz-asset-label" style="margin-bottom:12px">WHY THIS STRUCTURE</div>
    <div class="seo-fz-el-quote-mark">&ldquo;</div>
    <p class="seo-fz-el-quote-text">${esc(String(el.why_structure))}</p>
  </div>` : ""}
  <div class="seo-fz-el-grid3">
    ${el.search_intent_served ? `<div class="seo-fz-el-card">
      <div class="seo-fz-asset-label">${esc(L.searchIntentAlignment)}</div>
      <p class="seo-fz-el-card-text">${esc(String(el.search_intent_served))}</p>
    </div>` : ""}
    ${el.target_reader_profile ? `<div class="seo-fz-el-card">
      <div class="seo-fz-asset-label">${esc(L.targetReader)}</div>
      <p class="seo-fz-el-card-text">${esc(String(el.target_reader_profile))}</p>
    </div>` : ""}
    ${el.content_distribution_logic ? `<div class="seo-fz-el-card">
      <div class="seo-fz-asset-label">${esc(L.contentDist)}</div>
      <p class="seo-fz-el-card-text">${esc(String(el.content_distribution_logic))}</p>
    </div>` : ""}
    ${!el.search_intent_served && !el.target_reader_profile ? `<div class="seo-fz-el-card">
      <div class="seo-fz-asset-label">${esc(L.intent)}</div>
      <p class="seo-fz-el-card-text">${esc(String(c.intent || "—"))}</p>
    </div>
    <div class="seo-fz-el-card">
      <div class="seo-fz-asset-label">${esc(L.audience)}</div>
      <p class="seo-fz-el-card-text">${esc(String(c.audience || "—"))}</p>
    </div>
    <div class="seo-fz-el-card">
      <div class="seo-fz-asset-label">${esc(L.angle)}</div>
      <p class="seo-fz-el-card-text">${esc(String(c.angle || "—"))}</p>
    </div>` : ""}
  </div>
  ${elDecisionsHtml ? `<div class="seo-fz-el-decisions">
    <div class="seo-fz-asset-label" style="margin-bottom:14px">${esc(L.editorialDecisions)}</div>
    ${elDecisionsHtml}
  </div>` : ""}
  ${el.conversion_rationale ? `<div class="seo-fz-el-conversion">
    <div class="seo-fz-asset-label" style="margin-bottom:8px">${esc(L.conversionRationale)}</div>
    <p class="seo-fz-el-card-text">${esc(String(el.conversion_rationale))}</p>
  </div>` : ""}
</div>`;

  // ── SEO OPTIMIZATION TAB ─────────────────────────────────────
  const charBadge = function(len: number, idealMin: number, idealMax: number) {
    const cls = len >= idealMin && len <= idealMax ? "ok" : (len >= idealMin - 15 && len <= idealMax + 20 ? "warn" : "err");
    return '<span class="seo-fz-seo-badge seo-fz-seo-badge--' + cls + '">' + len + " " + L.chars + "</span>";
  };

  const wcLabel = L.checkWordCount + ": " + val.wordCount + (wcMin ? " / " + wcMin + (wcMax ? "–" + wcMax : "+") : "");
  const checkDefs: { state: CheckState; label: string }[] = [
    { state: (!val.missingH1 ? "ok" : "err") as CheckState, label: L.checkH1Present },
    { state: (kwInH1 ? "ok" : (kw ? "err" : "warn")) as CheckState, label: L.checkKwInH1 },
    { state: (kwInMeta ? "ok" : (kw && c.metaTitle ? "err" : "warn")) as CheckState, label: L.checkKwInMeta },
    { state: (kwInDesc ? "ok" : (kw && c.metaDescription ? "warn" : "warn")) as CheckState, label: L.checkKwInDesc },
    { state: mtState, label: L.checkMetaTitleLen + " (" + mtLen + " " + L.chars + ")" },
    { state: mdState, label: L.checkMetaDescLen + " (" + mdLen + " " + L.chars + ")" },
    { state: (faqOk ? "ok" : (c.faq.length > 0 ? "warn" : "err")) as CheckState, label: L.checkFaq + (c.faq.length ? " (" + c.faq.length + ")" : "") },
    { state: (!val.missingCta ? "ok" : "warn") as CheckState, label: L.checkCta },
    { state: (c.slug ? "ok" : "warn") as CheckState, label: L.checkSlug },
    { state: (wcOk ? "ok" : (wcWarn ? "warn" : "err")) as CheckState, label: wcLabel },
  ];
  const checkCardsHtml = checkDefs.map(function(ch) {
    const isPass = ch.state === "ok";
    const isWarn = ch.state === "warn";
    const badgeClass = isPass ? "seo-fz-chk-badge--ok" : (isWarn ? "seo-fz-chk-badge--warn" : "seo-fz-chk-badge--err");
    const badgeText = isPass ? "&#10003; PASS" : (isWarn ? "! WARN" : "&#10007; FAIL");
    return `<div class="seo-fz-chk-card">
  <span class="seo-fz-chk-badge ${badgeClass}">${badgeText}</span>
  <span class="seo-fz-chk-label">${esc(ch.label)}</span>
</div>`;
  }).join("");

  // Extract images
  const imgMatches = Array.from(articleHtml.matchAll(/<img[^>]*>/gi));
  const imgRows: string[] = imgMatches.map(function(m) {
    const tag = m[0];
    const getA = function(attr: string) {
      const r1 = tag.match(new RegExp(attr + '\\s*=\\s*"([^"]*)"', 'i'));
      if (r1) return r1[1];
      const r2 = tag.match(new RegExp(attr + "\\s*=\\s*'([^']*)'", 'i'));
      return r2 ? r2[1] : "";
    };
    const src = getA('src');
    if (!src || src.startsWith('data:')) return "";
    const alt = getA('alt');
    const title = getA('title');
    const srcShort = src.length > 55 ? "…" + src.slice(-52) : src;
    const suggestedAlt = alt ? alt : (c.keyword ? c.keyword + (brand ? " — " + brand : "") : (brand || ""));
    return `<div class="seo-fz-img-row">
  <div class="seo-fz-img-src"><code>${esc(srcShort)}</code></div>
  <div class="seo-fz-img-fields">
    <span class="seo-fz-img-label">${esc(L.altCurrent)}</span>
    <span class="seo-fz-img-val${alt ? "" : " seo-fz-img-val--empty"}">${alt ? esc(alt) : "—"}</span>
    <span class="seo-fz-img-label">${esc(L.altSuggested)}</span>
    <span class="seo-fz-img-val seo-fz-img-val--suggested">${esc(suggestedAlt)}</span>
    ${title ? `<span class="seo-fz-img-label">${esc(L.titleAttr)}</span><span class="seo-fz-img-val">${esc(title)}</span>` : ""}
  </div>
</div>`;
  }).filter(Boolean);

  const seoHtml = `<div class="seo-fz-seo">
  <div class="seo-fz-seo-top">
    <div class="seo-fz-seo-gauge-wrap">
      <svg viewBox="0 0 120 120" class="seo-fz-gauge-svg">
        <circle cx="60" cy="60" r="48" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="8"/>
        <circle cx="60" cy="60" r="48" fill="none" stroke="${gaugeColor}" stroke-width="8"
          stroke-dasharray="${circ}" stroke-dashoffset="${dashoffset.toFixed(1)}"
          stroke-linecap="round" transform="rotate(-90 60 60)"/>
        <text x="60" y="56" text-anchor="middle" fill="#f0eeff" font-size="22" font-weight="700" font-family="system-ui,sans-serif">${score}</text>
        <text x="60" y="72" text-anchor="middle" fill="#8b85a8" font-size="10" font-family="system-ui,sans-serif">/ 100</text>
      </svg>
      <div class="seo-fz-gauge-sub">${passCount} of ${totalChecks} checks</div>
      <div class="seo-fz-gauge-badges">
        <span class="seo-fz-chk-badge seo-fz-chk-badge--ok">${passCount} ok</span>
        <span class="seo-fz-chk-badge seo-fz-chk-badge--warn">${warnCount} warn</span>
      </div>
    </div>
    <div class="seo-fz-seo-meta">
      <div class="seo-fz-seo-meta-row">
        <div class="seo-fz-seo-meta-header"><span class="seo-fz-asset-label">META TITLE</span>${charBadge(mtLen, 50, 60)}</div>
        <div class="seo-fz-seo-meta-val">${esc(c.metaTitle || "—")}</div>
      </div>
      <div class="seo-fz-seo-meta-row">
        <div class="seo-fz-seo-meta-header"><span class="seo-fz-asset-label">SLUG</span></div>
        <div class="seo-fz-seo-meta-val seo-fz-seo-meta-val--mono">${esc(c.slug || "—")}</div>
      </div>
      <div class="seo-fz-seo-meta-row">
        <div class="seo-fz-seo-meta-header"><span class="seo-fz-asset-label">META DESCRIPTION</span>${charBadge(mdLen, 140, 160)}</div>
        <div class="seo-fz-seo-meta-val">${esc(c.metaDescription || "—")}</div>
      </div>
      <div class="seo-fz-seo-meta-row">
        <div class="seo-fz-seo-meta-header"><span class="seo-fz-asset-label">H1</span></div>
        <div class="seo-fz-seo-meta-val">${esc(c.h1 || "—")}</div>
      </div>
    </div>
  </div>
  <div class="seo-fz-asset-label" style="margin-bottom:12px">${esc(L.seoChecklist)}</div>
  <div class="seo-fz-chk-grid">${checkCardsHtml}</div>
  ${imgRows.length > 0 ? `<div class="seo-fz-asset-label" style="margin:24px 0 12px">${esc(L.seoImages)}</div>
  <p class="seo-fz-img-note">${esc(L.featuredImageNote)}</p>
  ${imgRows.join("")}` : `<p class="seo-fz-img-note" style="margin-top:16px">${esc(L.noImagesFound)}</p>`}
</div>`;

  // ── STYLES ─────────────────────────────────────────────────────
  const styles = `<style data-fz="1">
/* ── Dark wrapper ── */
.seo-fz-wrapper{margin-top:64px;padding:40px 32px;background:#14111e;border-radius:16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;color:#f0eeff}
/* ── Shared label ── */
.seo-fz-asset-label{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#5a5478;display:block;margin-bottom:6px}
/* ── Tab system (CSS-only radio) ── */
.seo-fz-tabs{display:flex;gap:0;border-bottom:1px solid rgba(255,255,255,0.06);margin-bottom:28px;overflow-x:auto}
.seo-fz-tab{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:14px 24px 12px;cursor:pointer;border:none;background:transparent;color:#6b648a;font-size:13px;font-weight:600;letter-spacing:.01em;position:relative;white-space:nowrap;transition:color .15s;border-bottom:2px solid transparent;margin-bottom:-1px}
.seo-fz-tab:hover{color:#a098ff}
.seo-fz-tab-num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;border:1px solid rgba(255,255,255,0.12);font-size:10px;font-weight:700;margin-bottom:4px;color:#5a5478;transition:all .15s}
.seo-fz-tab-sub{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3d3760;transition:color .15s}
/* active tab via radio checked sibling selectors */
#${uid}-r-assets:checked ~ .seo-fz-tabs label[for="${uid}-r-assets"],
#${uid}-r-cj:checked ~ .seo-fz-tabs label[for="${uid}-r-cj"],
#${uid}-r-el:checked ~ .seo-fz-tabs label[for="${uid}-r-el"],
#${uid}-r-seo:checked ~ .seo-fz-tabs label[for="${uid}-r-seo"]{color:#f0eeff;border-bottom-color:#7c6fff}
#${uid}-r-assets:checked ~ .seo-fz-tabs label[for="${uid}-r-assets"] .seo-fz-tab-num,
#${uid}-r-cj:checked ~ .seo-fz-tabs label[for="${uid}-r-cj"] .seo-fz-tab-num,
#${uid}-r-el:checked ~ .seo-fz-tabs label[for="${uid}-r-el"] .seo-fz-tab-num,
#${uid}-r-seo:checked ~ .seo-fz-tabs label[for="${uid}-r-seo"] .seo-fz-tab-num{border-color:#7c6fff;color:#a098ff}
#${uid}-r-assets:checked ~ .seo-fz-tabs label[for="${uid}-r-assets"] .seo-fz-tab-sub,
#${uid}-r-cj:checked ~ .seo-fz-tabs label[for="${uid}-r-cj"] .seo-fz-tab-sub,
#${uid}-r-el:checked ~ .seo-fz-tabs label[for="${uid}-r-el"] .seo-fz-tab-sub,
#${uid}-r-seo:checked ~ .seo-fz-tabs label[for="${uid}-r-seo"] .seo-fz-tab-sub{color:#7c6fff}
/* panel visibility */
.seo-fz-panel{display:none}
#${uid}-r-assets:checked ~ .seo-fz-panels #${uid}-assets,
#${uid}-r-cj:checked ~ .seo-fz-panels #${uid}-cj,
#${uid}-r-el:checked ~ .seo-fz-panels #${uid}-el,
#${uid}-r-seo:checked ~ .seo-fz-panels #${uid}-seo{display:block}
/* ── Dark cards ── */
.seo-fz-asset-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:20px}
.seo-fz-asset-card--full{grid-column:1/-1}
.seo-fz-asset-body{font-size:13px;color:#8b85a8;line-height:1.6;margin-top:4px}
/* ── Assets Row 1 ── */
.seo-fz-assets-row1{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:12px}
.seo-fz-assets-row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
/* keyword card */
.seo-fz-asset-card--kw{}
.seo-fz-kw-display{font-size:42px;font-weight:800;color:#f0eeff;line-height:1.05;margin:8px 0 14px;letter-spacing:-.02em}
.seo-fz-asset-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.seo-fz-tag{background:rgba(124,111,255,0.12);border:1px solid rgba(124,111,255,0.3);color:#a098ff;padding:3px 11px;border-radius:20px;font-size:11px;font-weight:500}
.seo-fz-tag--more{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.1);color:#5a5478}
/* intent card */
.seo-fz-intent-primary{font-size:20px;font-weight:700;color:#f0eeff;margin:8px 0 4px}
.seo-fz-intent-secondary{font-size:12px;color:#8b85a8;line-height:1.4}
/* length card */
.seo-fz-length-display{font-size:26px;font-weight:800;color:#f0eeff;margin:8px 0 2px;letter-spacing:-.01em}
.seo-fz-length-unit{font-size:11px;color:#5a5478;margin-bottom:14px}
.seo-fz-length-bar{height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin-bottom:6px}
.seo-fz-length-bar-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,#7c6fff,#22d3ee);transition:width .3s}
.seo-fz-length-note{font-size:10px;color:#5a5478}
/* structure */
.seo-fz-structure-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.seo-fz-structure-count{font-size:11px;color:#5a5478;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.seo-fz-sec-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.seo-fz-sec-card{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:12px 14px}
.seo-fz-sec-num{font-size:9px;font-weight:700;letter-spacing:.1em;color:#7c6fff;text-transform:uppercase;margin-bottom:6px}
.seo-fz-sec-title{font-size:12px;color:#8b85a8;line-height:1.45}
/* ── Customer Journey ── */
.seo-fz-cj{}.seo-fz-cj-svg{width:100%;height:auto;margin:0 0 20px;display:block}
.seo-fz-cj-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.seo-fz-cj-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px}
.seo-fz-cj-card-header{display:flex;flex-direction:column;gap:3px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.06)}
.seo-fz-cj-card-num{font-size:9px;font-weight:700;letter-spacing:.1em;color:#7c6fff;text-transform:uppercase}
.seo-fz-cj-card-name{font-size:14px;font-weight:700;color:#f0eeff;line-height:1.3}
.seo-fz-cj-field{display:flex;flex-direction:column;gap:3px}
.seo-fz-cj-field-label{font-size:9px;font-weight:700;letter-spacing:.1em;color:#5a5478;text-transform:uppercase}
.seo-fz-cj-field-text{font-size:11px;color:#8b85a8;line-height:1.5}
.seo-fz-cj-ref{margin-top:auto;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05);font-size:11px;color:#7c6fff;font-style:italic}
.seo-fz-cj-insights{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px}
.seo-fz-cj-insight{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:14px}
.seo-fz-cj-insight-title{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#5a5478;margin-bottom:8px;display:block}
.seo-fz-cj-insight p{margin:0;font-size:12px;color:#8b85a8;line-height:1.55}
.seo-fz-cj-fallback{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:20px}
/* ── Editorial Logic ── */
.seo-fz-el{display:flex;flex-direction:column;gap:16px}
.seo-fz-el-pullquote{background:rgba(124,111,255,0.08);border-left:3px solid #7c6fff;border-radius:0 10px 10px 0;padding:20px 24px}
.seo-fz-el-quote-mark{font-size:56px;color:#7c6fff;line-height:.8;font-family:Georgia,serif;margin-bottom:8px}
.seo-fz-el-quote-text{font-style:italic;font-size:17px;color:#c8c0ff;line-height:1.65;margin:0}
.seo-fz-el-grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.seo-fz-el-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:16px}
.seo-fz-el-card-text{margin:0;font-size:12px;color:#8b85a8;line-height:1.6}
.seo-fz-el-decisions{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:18px}
.seo-fz-el-decision{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px}
.seo-fz-el-decision:last-child{margin-bottom:0}
.seo-fz-el-dec-num{font-size:12px;font-weight:800;color:#7c6fff;flex-shrink:0;min-width:24px}
.seo-fz-el-dec-text{font-size:12px;color:#8b85a8;line-height:1.55}
.seo-fz-el-conversion{background:rgba(124,111,255,0.15);border:1px solid rgba(124,111,255,0.3);border-radius:10px;padding:16px}
/* ── SEO Optimization ── */
.seo-fz-seo{display:flex;flex-direction:column;gap:20px}
.seo-fz-seo-top{display:grid;grid-template-columns:160px 1fr;gap:20px;align-items:start}
.seo-fz-seo-gauge-wrap{display:flex;flex-direction:column;align-items:center;gap:8px}
.seo-fz-gauge-svg{width:120px;height:120px}
.seo-fz-gauge-sub{font-size:11px;color:#5a5478;text-align:center}
.seo-fz-gauge-badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.seo-fz-seo-meta{display:flex;flex-direction:column;gap:10px}
.seo-fz-seo-meta-row{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px 16px}
.seo-fz-seo-meta-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.seo-fz-seo-meta-val{font-size:13px;color:#c8c0ff;line-height:1.5}
.seo-fz-seo-meta-val--mono{font-family:monospace;font-size:12px;color:#22d3ee}
.seo-fz-seo-badge{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:.04em}
.seo-fz-seo-badge--ok{background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)}
.seo-fz-seo-badge--warn{background:rgba(245,158,11,0.12);color:#f59e0b;border:1px solid rgba(245,158,11,0.3)}
.seo-fz-seo-badge--err{background:rgba(248,113,113,0.12);color:#f87171;border:1px solid rgba(248,113,113,0.3)}
/* checklist grid */
.seo-fz-chk-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:8px}
.seo-fz-chk-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px}
.seo-fz-chk-badge{display:inline-block;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:700;letter-spacing:.04em;align-self:flex-start}
.seo-fz-chk-badge--ok{background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3)}
.seo-fz-chk-badge--warn{background:rgba(245,158,11,0.12);color:#f59e0b;border:1px solid rgba(245,158,11,0.3)}
.seo-fz-chk-badge--err{background:rgba(248,113,113,0.12);color:#f87171;border:1px solid rgba(248,113,113,0.3)}
.seo-fz-chk-label{font-size:11px;color:#8b85a8;line-height:1.4}
/* images */
.seo-fz-img-note{font-size:11px;color:#5a5478;font-style:italic;margin:0 0 12px}
.seo-fz-img-row{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:12px 14px;margin-bottom:8px}
.seo-fz-img-src{margin-bottom:8px;overflow:hidden}
.seo-fz-img-src code{font-size:11px;color:#5a5478;word-break:break-all}
.seo-fz-img-fields{display:grid;grid-template-columns:90px 1fr;gap:4px 10px;align-items:baseline;font-size:12px}
.seo-fz-img-label{font-weight:700;color:#5a5478;text-transform:uppercase;font-size:9px;letter-spacing:.08em}
.seo-fz-img-val{color:#8b85a8;line-height:1.4}
.seo-fz-img-val--empty{color:#3d3760;font-style:italic}
.seo-fz-img-val--suggested{color:#7c6fff;font-weight:500}
/* ── Responsive ── */
@media(max-width:900px){
  .seo-fz-assets-row1{grid-template-columns:1fr 1fr}
  .seo-fz-asset-card--kw{grid-column:1/-1}
  .seo-fz-sec-grid{grid-template-columns:repeat(2,1fr)}
  .seo-fz-cj-cards{grid-template-columns:repeat(2,1fr)}
  .seo-fz-cj-insights{grid-template-columns:repeat(2,1fr)}
  .seo-fz-el-grid3{grid-template-columns:1fr 1fr}
  .seo-fz-chk-grid{grid-template-columns:repeat(3,1fr)}
  .seo-fz-seo-top{grid-template-columns:1fr}
}
@media(max-width:640px){
  .seo-fz-wrapper{padding:24px 16px}
  .seo-fz-assets-row1,.seo-fz-assets-row2{grid-template-columns:1fr}
  .seo-fz-sec-grid{grid-template-columns:repeat(2,1fr)}
  .seo-fz-cj-cards{grid-template-columns:1fr}
  .seo-fz-cj-insights{grid-template-columns:1fr}
  .seo-fz-el-grid3{grid-template-columns:1fr}
  .seo-fz-chk-grid{grid-template-columns:repeat(2,1fr)}
  .seo-fz-tabs{flex-wrap:wrap}
  .seo-fz-tab{padding:10px 16px 8px}
}
</style>`;

  return `${styles}
<input type="radio" id="${uid}-r-assets" name="${uid}-tabs" hidden checked>
<input type="radio" id="${uid}-r-cj" name="${uid}-tabs" hidden>
<input type="radio" id="${uid}-r-el" name="${uid}-tabs" hidden>
<input type="radio" id="${uid}-r-seo" name="${uid}-tabs" hidden>
<section id="${uid}-wrapper" class="seo-fz-wrapper" aria-label="${L.supplementaryContent}">
  <nav class="seo-fz-tabs" role="tablist">
    <label for="${uid}-r-assets" class="seo-fz-tab" role="tab">
      <span class="seo-fz-tab-num">01</span>
      ${esc(L.assets)}
      <span class="seo-fz-tab-sub">BRIEFING INPUTS</span>
    </label>
    <label for="${uid}-r-cj" class="seo-fz-tab" role="tab">
      <span class="seo-fz-tab-num">02</span>
      ${esc(L.customerJourney)}
      <span class="seo-fz-tab-sub">READER PATH</span>
    </label>
    <label for="${uid}-r-el" class="seo-fz-tab" role="tab">
      <span class="seo-fz-tab-num">03</span>
      ${esc(L.editorialLogic)}
      <span class="seo-fz-tab-sub">WHY &amp; HOW</span>
    </label>
    <label for="${uid}-r-seo" class="seo-fz-tab" role="tab">
      <span class="seo-fz-tab-num">04</span>
      ${esc(L.seoOptimization)}
      <span class="seo-fz-tab-sub">META + CHECKLIST</span>
    </label>
  </nav>
  <div class="seo-fz-panels">
    <div id="${uid}-assets" class="seo-fz-panel" role="tabpanel">${assetsHtml}</div>
    <div id="${uid}-cj" class="seo-fz-panel" role="tabpanel">${cjHtml}</div>
    <div id="${uid}-el" class="seo-fz-panel" role="tabpanel">${elHtml}</div>
    <div id="${uid}-seo" class="seo-fz-panel" role="tabpanel">${seoHtml}</div>
  </div>
</section>`;
}

serve(async (req) => {
  const runId = crypto.randomUUID();
  let env: ReturnType<typeof envs>|null = null;
  let item: Item|null = null;
  let contract: Contract|null = null;
  let partialHtml = "";
  const t0 = Date.now();
  try {
    if (req.method === "OPTIONS") return js({ok:true});
    if (req.method !== "POST") return js({success:false,run_id:runId,error_code:"method_not_allowed"},405);
    const body = await req.json().catch(()=>{ throw new Error("error_validacion: JSON inválido"); }) as J;
    const record = obj(body.record);
    const itemId = String(record.id || body.content_item_id || body.id || "");
    const dryRun = body.dry_run === true;
    const force = body.force === true;
    if (!itemId) return js({success:false,run_id:runId,error_code:"error_validacion",error:"record.id requerido"},400);
    if (body.publication === true) return js({success:false,run_id:runId,error_code:"publication_blocked"},403);
    env = envs();
    await log(env,runId,itemId,"start","orchestrator","started",{version:VERSION,dry_run:dryRun,force,publication:false});
    item = await getOne<Item>(env,"content_items",`id=eq.${encodeURIComponent(itemId)}`);
    validateItem(item,force);
    const project = item.proyecto_id ? await getOne<Project>(env,"proyectos_seo",`id=eq.${encodeURIComponent(item.proyecto_id)}`,false) : null;
    if (!project?.nombremarca || isPlaceholder(project.nombremarca)) return js({success:false,run_id:runId,item_id:item.id,error_code:"error_brand_context",error:"Marca real obligatoria"},422);
    contract = makeContract(item.brief_data,item);
    await log(env,runId,item.id,"brief_contract","contract-extractor","ok",contract);
    if (!dryRun) await patch(env,"content_items",item.id,{status:"in_progress",status_wp:"pending",status_wp_msg:`Orchestrator ${VERSION}: generando por secciones.`,custom_metadata:mergeMeta(item.custom_metadata,{generation_run_id:runId,seo_swarm_engine_version:VERSION,brief_contract:contract,publication:false,generation_strategy:"sectioned"})});
    const language = item.language||project?.idioma_objetivo||"es";
    const master = {id:item.id,title:item.title,brand:project?.nombremarca,country:project?.paisobjetivo,language,brief_data:item.brief_data,raw_source_content:item.raw_source_content,contract};
    const seo = dryRun ? {search_intent:contract.intent,content_angle:contract.angle,h1:contract.h1,outline:contract.h2} : await agent(env,"seo-expert",promptSeo(master,contract),"OPENROUTER_MODEL_SEO_EXPERT",45000);
    await log(env,runId,item.id,"seo_expert","seo-expert","ok",redact(seo));
    const parts:string[] = [];
    for (const section of contract.sections) {
      const prevMemory = memory(parts.join("\n"));
      const out = dryRun ? {section_html:mockSection(section,contract)} : await agent(env,`section-${section.key}`,promptSection(master,seo,contract,section,prevMemory,language),"OPENROUTER_MODEL_CONTENT_WRITER",70000);
      assertKeys(out,["section_html"]);
      const html = clean(String(out.section_html||""));
      parts.push(html);
      partialHtml = assemble(contract,parts,language);
      await log(env,runId,item.id,`section_${section.key}`,"content-writer","ok",{section,section_words:words(strip(html)),total_words:words(strip(partialHtml)),result:redact(out)});
      if (!dryRun && parts.length % 2 === 0) await patch(env,"content_items",item.id,{article_content:partialHtml,word_count:words(strip(partialHtml)),actual_word_count:words(strip(partialHtml)),status:"in_progress",status_wp_msg:`Borrador parcial (${words(strip(partialHtml))} palabras).`});
    }
    let article = assemble(contract,parts,language);
    let val = validate(article,contract);
    await log(env,runId,item.id,"sectioned_contract_gate","contract-validator",val.passed?"ok":"error",val,val.passed?undefined:"error_contract_validation",val.issues.join("; "));
    if (!dryRun && contract.min && val.wordCount < contract.min) {
      for (let i=1;i<=1 && val.wordCount < contract.min;i++) {
        const missing = contract.min - val.wordCount;
        const out = await agent(env,`expansion-${i}`,promptExpansion(master,contract,article,val,missing),"OPENROUTER_MODEL_CONTENT_WRITER",70000);
        assertKeys(out,["section_html"]);
        parts.push(clean(String(out.section_html||"")));
        article = assemble(contract,parts,language);
        val = validate(article,contract);
        await log(env,runId,item.id,`expansion_${i}`,"content-writer",val.passed?"ok":"error",{missing_before:missing,validation:val,result:redact(out)},val.passed?undefined:"error_contract_validation",val.issues.join("; "));
      }
    }
    // Structural integrity check: if missing critical elements, attempt repair
    const h2Coverage = contract.h2.length ? (contract.h2.length - val.missingH2.length) / contract.h2.length : 1;
    const structurallyBroken = val.missingH1 || val.missingCta || h2Coverage < 0.75 || (contract.faq.length > 0 && val.missingFaq.length > contract.faq.length * 0.5);
    const wordCountIssueOnly = !structurallyBroken && !val.missingKeyword && val.wordCount >= Math.max(500, Math.round((contract.min || 1000) * 0.6));

    if (!dryRun && structurallyBroken && val.wordCount >= Math.max(500, Math.round((contract.min || 1000) * 0.45))) {
      const beforeRepair = val;
      try {
        const out = await agent(env, "final-repair", promptRepair(master, contract, article, val), "OPENROUTER_MODEL_CONTENT_WRITER", 50000);
        if (typeof out.article_html === "string") {
          const repaired = clean(out.article_html);
          const repairedVal = validate(repaired, contract);
          const shouldAccept = repairedVal.passed || validationDistance(repairedVal, contract) < validationDistance(val, contract) || repairedVal.issues.length < val.issues.length;
          if (shouldAccept) { article = repaired; val = repairedVal; }
        }
        await log(env, runId, item.id, "final_repair", "content-writer", val.passed ? "ok" : "error", { accepted: val !== beforeRepair, validation: val, previous_validation: beforeRepair, result: redact(out) }, val.passed ? undefined : "error_contract_validation", val.issues.join("; "));
      } catch (re) {
        await log(env, runId, item.id, "final_repair", "content-writer", "error", { reason: err(re), validation: val }, "error_repair_failed", err(re)).catch(() => {});
      }
    } else if (!val.passed && wordCountIssueOnly) {
      await log(env, runId, item.id, "final_repair_skipped", "orchestrator", "skipped", { reason: "structural_ok_word_overshoot_only", validation: val }).catch(() => {});
    }

    // Build initial footer zone (no AI data) and SAVE IMMEDIATELY
    const brandName = String(project?.nombremarca || "");
    let footerZone = buildFooterZone({}, {}, contract, val, article, brandName, language);
    article = assemble(contract, parts, language, footerZone);

    const initialStatus = val.passed ? "published" : "pending_review";
    const initialMsg = val.passed ? "Artículo generado. Contrato validado. Sin publicación automática." : "Artículo generado; requiere revisión del Content Manager.";
    const baselineEeat: J = { eeat_score: val.passed ? 80 : 55, passes: val.passed, issues: val.issues, required_human_review: !val.passed };

    if (!dryRun) {
      await patch(env, "content_items", item.id, {
        article_content: article,
        meta_description: contract.metaDescription || item.meta_description || "",
        slug: contract.slug || item.slug || "",
        content_score: val.passed ? 80 : 55,
        word_count: val.wordCount,
        actual_word_count: val.wordCount,
        character_count: article.length,
        status: initialStatus,
        status_wp: "pending",
        status_wp_msg: initialMsg,
        processed_at: new Date().toISOString(),
        custom_metadata: mergeMeta(item.custom_metadata, {
          generation_run_id: runId,
          seo_swarm_engine_version: VERSION,
          brief_contract: contract,
          contract_validation: val,
          contract_passed: val.passed,
          quality_gate: val.passed ? "passed" : "failed_contract",
          eeat: baselineEeat,
          required_human_review: !val.passed,
          publication: false,
          image_generated: false,
          generation_strategy: "sectioned_save_early",
          footer_zone_enriched: false,
        }),
      });
      await log(env, runId, item.id, "early_complete", "orchestrator", val.passed ? "ok" : "error", { status_initial: initialStatus, latency_ms: Date.now() - t0, contract_validation: val, footer_zone: "basic_no_ai" }, val.passed ? undefined : "error_contract_validation", val.issues.join("; ")).catch(() => {});
    }

    // Best-effort AI enrichment: EEAT + Customer Journey + Editorial Logic in parallel
    if (!dryRun) {
      try {
        const footerModel = Deno.env.get("OPENROUTER_MODEL_FOOTER_ZONE") || Deno.env.get("OPENROUTER_MODEL_CONTENT_WRITER") || "";
        const orHeaders = {
          authorization: "Bearer " + env.openRouterKey,
          "content-type": "application/json",
          "HTTP-Referer": "https://github.com/accesos-seo/ops-control-plane",
          "X-Title": "seo-sectioned-engine",
        };
        const fetchJson = async function(prompt: string): Promise<J> {
          if (!footerModel || !env.openRouterKey) return {};
          try {
            const ac = new AbortController();
            const to = setTimeout(() => ac.abort(), 25000);
            try {
              const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST", signal: ac.signal, headers: orHeaders,
                body: JSON.stringify({ model: footerModel, messages: [{ role: "system", content: "Respond with valid JSON only. No markdown." }, { role: "user", content: prompt }], response_format: { type: "json_object" } }),
              });
              if (!res.ok) return {};
              const d = await res.json();
              return JSON.parse(d?.choices?.[0]?.message?.content || "{}");
            } finally { clearTimeout(to); }
          } catch { return {}; }
        };

        const eeatPromise: Promise<J> = agent(env, "eeat-validator", promptEeat(article, val, contract), "OPENROUTER_MODEL_EEAT_VALIDATOR", 25000)
          .catch(function(e) { return { eeat_score: val.passed ? 80 : 55, passes: val.passed, issues: val.issues, required_human_review: !val.passed, _eeat_error: err(e) }; });
        const cjPromise: Promise<J> = fetchJson(promptCustomerJourney(master, seo, contract, language));
        const elPromise: Promise<J> = fetchJson(promptEditorialLogic(master, seo, contract, val, language));

        const [eeatResult, cjData, elData] = await Promise.all([eeatPromise, cjPromise, elPromise]);
        const enrichedFooter = buildFooterZone(cjData, elData, contract, val, article, brandName, language);
        const enrichedArticle = assemble(contract, parts, language, enrichedFooter);

        await patch(env, "content_items", item.id, {
          article_content: enrichedArticle,
          custom_metadata: mergeMeta(item.custom_metadata, {
            generation_run_id: runId,
            seo_swarm_engine_version: VERSION,
            brief_contract: contract,
            contract_validation: val,
            contract_passed: val.passed,
            quality_gate: val.passed ? "passed" : "failed_contract",
            eeat: eeatResult,
            required_human_review: !val.passed,
            publication: false,
            image_generated: false,
            generation_strategy: "sectioned_save_early",
            footer_zone_enriched: true,
            footer_zone_cj_stages: Array.isArray((cjData as J).stages) ? ((cjData as J).stages as unknown[]).length : 0,
            footer_zone_el_decisions: Array.isArray((elData as J).key_editorial_decisions) ? ((elData as J).key_editorial_decisions as unknown[]).length : 0,
          }),
        });

        await log(env, runId, item.id, "eeat", "eeat-validator", (eeatResult as J)._eeat_error ? "error" : "ok", redact(eeatResult)).catch(() => {});
        await log(env, runId, item.id, "footer_zone_enriched", "footer-zone-generator", "ok", {
          cj_stages: Array.isArray((cjData as J).stages) ? ((cjData as J).stages as unknown[]).length : 0,
          el_decisions: Array.isArray((elData as J).key_editorial_decisions) ? ((elData as J).key_editorial_decisions as unknown[]).length : 0,
        }).catch(() => {});
        await log(env, runId, item.id, "complete", "orchestrator", val.passed ? "ok" : "error", { status_final: initialStatus, latency_ms: Date.now() - t0, contract_validation: val, enriched: true }, val.passed ? undefined : "error_contract_validation", val.issues.join("; ")).catch(() => {});
      } catch (enrichErr) {
        await log(env, runId, item.id, "enrichment_skipped", "orchestrator", "error", { reason: err(enrichErr), note: "Article already saved with basic footer" }).catch(() => {});
        await log(env, runId, item.id, "complete", "orchestrator", val.passed ? "ok" : "error", { status_final: initialStatus, latency_ms: Date.now() - t0, contract_validation: val, enriched: false }, val.passed ? undefined : "error_contract_validation", val.issues.join("; ")).catch(() => {});
      }
    } else {
      await log(env, runId, item.id, "complete", "orchestrator", "dry_run", { latency_ms: Date.now() - t0, contract_validation: val }).catch(() => {});
    }

    return js({ success: true, contract_passed: val.passed, run_id: runId, item_id: item.id, status: dryRun ? "dry_run" : initialStatus, contract_validation: val }, val.passed ? 200 : 202);
  } catch(e) {
    const msg = err(e), code = classify(msg);
    if (env && item) await log(env,runId,item.id,"fatal","orchestrator","error",{message:msg,partial_words:words(strip(partialHtml))},code,msg).catch(()=>{});
    if (env && item) await saveFailure(env,item,runId,msg,code,partialHtml,contract).catch(()=>{});
    return js({success:false,run_id:runId,error_code:code,error:msg},code==="error_validacion"?400:500);
  }
});

function validationDistance(v:Val,c:Contract){let d=v.issues.length*1000;if(c.min&&v.wordCount<c.min)d+=c.min-v.wordCount;if(c.max&&v.wordCount>c.max)d+=v.wordCount-c.max;d+=v.missingH2.length*200+v.missingFaq.length*150+v.missingFacts.length*120+(v.missingH1?500:0)+(v.missingKeyword?300:0)+(v.missingCta?200:0);return d}
function makeContract(data:unknown,item:Item):Contract{const root=obj(normRoot(data));const bf=root.brief_final?obj(root.brief_final):(root.resumen_ejecutivo||root.estructura_contenido?root:obj(root.brief));const r=obj(bf.resumen_ejecutivo),p=obj(r.parametros),m=obj(r.meta_seo),k=obj(r.estrategia_keywords),s=obj(bf.estructura_contenido),x=obj(s.elementos_extra);const raw=first(p.extension_palabras,p.extension,r.extension_palabras,root.extension_palabras);const range=parseRange(raw);const h2d=h2Details(s.desarrollo_h2_h3);const h2=h2d.map(v=>String(v.heading||"")).filter(Boolean);const faq=faqs(s.preguntas_frecuentes);const cta=first(x.cta_final,s.cta_final,root.cta_final);const research=stringify(bf.contexto_investigacion||root.contexto_investigacion||item.raw_source_content||null);const c:Contract={source:root.brief_final?"brief_final":(bf.resumen_ejecutivo?"direct_brief":"fallback"),extensionRaw:raw,extensionSource:raw?"brief_final.resumen_ejecutivo.parametros.extension_palabras":null,extensionComplianceRule:"Cumplir la extensión del brief.",min:range.min,max:range.max,h1:first(r.h1_propuesto,root.h1_propuesto,item.title),slug:first(r.slug_sugerido,root.slug_sugerido,item.slug),metaTitle:first(m.meta_title,m.titulo,m.title,r.meta_title),metaDescription:first(m.meta_description,m.descripcion,m.description,r.meta_description),keyword:first(k.keyword_principal,k.primary_keyword,k.principal,k.principal_keyword,r.keyword_principal,item.main_keyword),secondary:list(k.keywords_secundarias||k.secondary_keywords||k.secundarias||item.secondary_keywords),intent:first(p.intencion_busqueda,r.intencion_busqueda,r.search_intent),audience:first(p.publico_objetivo,r.publico_objetivo,r.audiencia),angle:first(p.angulo_editorial,r.angulo_editorial,r.enfoque_editorial),h2,h2Details:h2d,faq,cta,research,facts:facts(research),sections:[]};c.sections=plan(c.min,h2d,faq,cta,item.language||"es");return c}
function plan(min:number|null,h2d:J[],faq:string[],cta:string|null,language:string="es"):Section[]{const n=min||1200,intro=Math.max(120,Math.round(n*.10)),fq=faq.length?Math.max(180,Math.round(n*.12)):0,ct=cta?Math.max(80,Math.round(n*.05)):0,rem=Math.max(0,n-intro-fq-ct),per=h2d.length?Math.max(130,Math.round(rem/h2d.length)):rem;const a:Section[]=[{key:"intro",kind:"intro",heading:introHeading(language),minWords:intro}];h2d.forEach((h,i)=>a.push({key:`h2_${i+1}`,kind:"h2",heading:String(h.heading||`Sección ${i+1}`),minWords:per,payload:h}));if(faq.length)a.push({key:"faq",kind:"faq",heading:faqHeading(language),minWords:fq,payload:faq});if(cta)a.push({key:"cta",kind:"cta",heading:"",minWords:ct,payload:cta});return a;}
function stripPreH1(html:string):string{const trimmed=html.trim();if(/^<(h[2-6]|p|ul|ol|table|div|blockquote)/i.test(trimmed))return trimmed;const firstTag=trimmed.search(/<(h[2-6]|p|ul|ol|table|div|blockquote)/i);if(firstTag>0)return trimmed.slice(firstTag);return trimmed;}

function promptSection(master:J,seo:J,c:Contract,s:Section,prev:string,language:string):string{
  const sectionMax=Math.round(s.minWords*1.08);
  const globalMax=c.max||c.min||2000;
  const maxHint = "LÍMITE ABSOLUTO E INNEGOCIABLE: esta sección DEBE tener entre " + s.minWords + " y " + sectionMax + " palabras. Si generas MÁS de " + sectionMax + " palabras, el output será DESCARTADO y la tarea fallará. El artículo completo NO debe superar " + globalMax + " palabras bajo ninguna circunstancia. Cuenta tus palabras antes de devolver. Prioriza calidad y densidad de información sobre volumen. Cada frase debe aportar valor SEO o informativo. NO uses frases de relleno como 'en resumen', 'es importante mencionar', 'cabe destacar', 'por otro lado'. NO repitas ideas con palabras distintas. Si tienes que elegir entre cumplir mínimo o cumplir máximo, cumple SIEMPRE el máximo.";
  let rules="";
  if(s.kind==="intro"){
    rules="REGLA CRÍTICA: El primer carácter de section_html debe ser un tag HTML (<p>, <ul>, etc). Jamás texto plano antes del primer tag. Párrafos máximo 3 líneas. El párrafo de introducción DEBE ser completo, cerrar con </p> y tener al menos 2 oraciones.";
  } else if(s.kind==="faq"){
    const heading=faqHeading(language);
    rules=`REGLAS CRÍTICAS PARA FAQ — OBLIGATORIAS, NUNCA LAS ROMPAS:\n1. Empieza con <h2>${heading}</h2>\n2. Por cada pregunta usa EXACTAMENTE: <h3>Pregunta?</h3>\n   <p>Respuesta completa. Mínimo 2 oraciones.</p>\n3. Orden SIEMPRE: H3 → P → H3 → P\n4. NUNCA respuestas sueltas arriba + H3 vacíos abajo\n5. NUNCA H3 sin P debajo\n6. NUNCA H3 vacíos al final`;
  } else if(s.kind==="cta"){
    rules=`REGLA CRÍTICA: NO uses ningún encabezado. Escribe ${s.minWords} palabras de cierre en párrafos <p> naturales con el CTA integrado.`;
  } else {
    rules="Párrafos máximo 3 líneas. Contenido completo — no cortes párrafos.";
  }
  const headingHint = s.heading ? (", heading " + JSON.stringify(s.heading)) : " (sin heading)";
  const langInstruction = "IDIOMA OBLIGATORIO: ESCRIBE ABSOLUTAMENTE TODO en " + langName(language) + ". Cada palabra, frase, heading y párrafo debe estar en " + langName(language) + ". Si mezclas idiomas, el artículo será RECHAZADO. El heading de esta sección es: " + JSON.stringify(s.heading||"") + ".\n";
  return langInstruction + "Genera SOLO una sección HTML SEO. No inventes, no uses web.\nContexto: " + JSON.stringify({h1:c.h1,keyword:c.keyword,secondary:c.secondary,intent:c.intent,audience:c.audience,angle:c.angle,extension:c.extensionRaw,h2:c.h2,faq:c.faq,cta:c.cta,facts:c.facts,meta:c.metaTitle,brand:master.brand,country:master.country,language}).slice(0,9000) + "\nInvestigación: " + String(c.research||"").slice(0,10000) + "\nSEO: " + JSON.stringify(seo).slice(0,5000) + "\nMemoria: " + prev + "\nTarea: sección " + s.key + ", tipo " + s.kind + headingHint + ", EXACTAMENTE entre " + s.minWords + " y " + sectionMax + " palabras. Si excedes " + sectionMax + " palabras, el artículo será RECHAZADO.\n" + maxHint + "\n" + rules + "\nPayload: " + JSON.stringify(s.payload||{}).slice(0,4000) + "\nReglas: sin H1; h2 empieza con <h2>" + (s.heading?esc(s.heading):"") + "</h2>; NUNCA Conclusion como encabezado.\nDevuelve JSON: {section_html, declared_word_count, notes}";
}

function promptExpansion(master:J,c:Contract,html:string,v:Val,missing:number){return `Artículo corto (${c.extensionRaw}). Faltan ~${missing} palabras. Genera sección HTML complementaria. Keyword: ${c.keyword}. Investigación: ${String(c.research||"").slice(0,10000)}. Validación: ${JSON.stringify(v)}. Artículo: ${html.slice(0,12000)}. JSON: {section_html, declared_word_count, notes}.`}
function promptRepair(master:J,c:Contract,html:string,v:Val){return `Repara HTML para cumplir brief. Extensión: ${c.extensionRaw}. Issues: ${JSON.stringify(v.issues)}. Conserva H1, H2, FAQ, CTA. Facts: ${v.missingFacts.join(", ")}. No inventes. Artículo: ${html.slice(0,18000)}. Contexto: ${JSON.stringify({contract:c,brand:master.brand,country:master.country}).slice(0,12000)}. JSON: {article_html, declared_word_count, notes}.`}
function promptSeo(master:J,c:Contract){return `brief_final manda. No web. JSON: search_intent, content_angle, h1, outline, entities, internal_linking_opportunities, schema_recommendation, seo_risks, brief_contract_summary. Contrato:${JSON.stringify(c).slice(0,13000)} Brief:${JSON.stringify(master).slice(0,12000)}`}
function promptEeat(html:string,v:Val,c:Contract){return `Evalúa E-E-A-T, brief, extensión, estructura. JSON: eeat_score, passes, issues, recommendations, required_human_review. Validación:${JSON.stringify(v)} Contrato:${JSON.stringify(c).slice(0,9000)} Artículo:${html.slice(0,12000)}`}
function validate(html:string,c:Contract):Val{html=clean(html);const text=strip(html),norm=normalize(text),wc=words(text);const missH1=!!c.h1&&!hasTag(html,"h1",c.h1);const missH2=c.h2.filter(h=>!hasTag(html,"h2",h)&&!near(norm,normalize(h)));const missFaq=c.faq.filter(q=>!near(norm,normalize(q)));const missFacts=c.facts.filter(f=>!near(norm,normalize(f)));const missKw=!!c.keyword&&!near(norm,normalize(c.keyword));const missCta=!!c.cta&&!near(norm,normalize(c.cta));const issues:string[]=[];if(c.min&&wc<c.min)issues.push(`word_count ${wc} no cumple extensión (${c.extensionRaw}); mínimo ${c.min}`);if(c.max&&wc>Math.round(c.max*1.03))issues.push(`word_count ${wc} excede extensión (${c.extensionRaw}); máximo ${c.max}`);if(missH1)issues.push("H1 ausente");if(missH2.length)issues.push(`H2 faltantes: ${missH2.join(" | ")}`);if(missFaq.length)issues.push(`FAQ faltantes: ${missFaq.join(" | ")}`);if(missKw)issues.push("keyword principal ausente");if(missCta)issues.push("CTA ausente");if(missFacts.length)issues.push(`facts faltantes: ${missFacts.join(" | ")}`);return{passed:issues.length===0,wordCount:wc,issues,missingH1:missH1,missingH2:missH2,missingFaq:missFaq,missingCta:missCta,missingKeyword:missKw,missingFacts:missFacts,extensionRaw:c.extensionRaw,targetWordMin:c.min,targetWordMax:c.max}}

function buildClipboardBlock(articleHtml:string):string{
  const escaped = articleHtml
    .replace(/&/g,"&amp;")
    .replace(/"/g,"&quot;");
  return `<div class="copy-article-block" id="cab-wrapper" style="margin:32px 0 16px;padding:16px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;display:flex;align-items:center;gap:12px">\n  <button id="cab-btn" data-html="${escaped}" style="cursor:pointer;padding:8px 18px;background:#1e3a5f;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;transition:background .2s">&#128203; Copiar HTML</button>\n  <span style="font-size:12px;color:#64748b">Copia el HTML completo listo para pegar en editor de c&oacute;digo</span>\n</div>\n<script data-cab="1">\n(function(){\n  function initCab(){\n    var btn=document.getElementById('cab-btn');\n    if(!btn||btn.dataset.cabInit)return;\n    btn.dataset.cabInit='1';\n    btn.addEventListener('click',function(){\n      var text=btn.getAttribute('data-html')\n        .replace(/&amp;/g,'&')\n        .replace(/&quot;/g,'\"');\n      if(!text){btn.textContent='Sin contenido';return;}\n      function onSuccess(){\n        btn.innerHTML='&#10003; Copiado';\n        btn.style.background='#16a34a';\n        setTimeout(function(){btn.innerHTML='&#128203; Copiar HTML';btn.style.background='#1e3a5f';},2500);\n      }\n      function onError(){\n        try{\n          var ta=document.createElement('textarea');\n          ta.value=text;\n          ta.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0;';\n          document.body.appendChild(ta);\n          ta.focus();ta.select();ta.setSelectionRange(0,ta.value.length);\n          var ok=document.execCommand('copy');\n          document.body.removeChild(ta);\n          if(ok)onSuccess();\n          else{btn.textContent='Error';btn.style.background='#dc2626';}\n        }catch(e){btn.textContent='Error';btn.style.background='#dc2626';}\n      }\n      if(navigator.clipboard&&window.isSecureContext){\n        navigator.clipboard.writeText(text).then(onSuccess).catch(onError);\n      }else{\n        onError();\n      }\n    });\n  }\n  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initCab);}else{initCab();}\n  setTimeout(initCab,500);\n})();\n<\/script>`;
}

function assemble(c:Contract,parts:string[],language:string,footerZone:string=""):string{
  const safeParts=parts.map((p,i)=>i===0?stripPreH1(p):p);
  const articleBody=`<article>\n<h1>${esc(c.h1||"Artículo SEO")}</h1>\n${safeParts.join("\n")}\n</article>`;
  const articleClean=clean(articleBody);
  const clipboardBlock=buildClipboardBlock(articleClean);
  const base=articleClean.replace('<article>\n',`<article>\n${clipboardBlock}\n`);
  return footerZone?`${base}\n${footerZone}`:base;
}

async function saveFailure(env:ReturnType<typeof envs>,item:Item,runId:string,msg:string,code:string,partial:string,c:Contract|null){if(partial&&words(strip(partial))>250){const val=validate(partial,c||makeContract(item.brief_data,item));await patch(env,"content_items",item.id,{article_content:partial,word_count:val.wordCount,actual_word_count:val.wordCount,character_count:partial.length,status:"pending_review",status_wp:"pending",status_wp_msg:"Borrador parcial guardado por error/timeout.",processed_at:new Date().toISOString(),custom_metadata:mergeMeta(item.custom_metadata,{generation_run_id:runId,seo_swarm_engine_version:VERSION,contract_passed:false,contract_validation:val,quality_gate:"partial_saved_after_error",last_failure_code:code,last_failure_message:msg,article_generation_retriable:true,required_human_review:true})})}else await patch(env,"content_items",item.id,{status:"pending_review",status_wp:"pending",status_wp_msg:`Generación falló: ${msg}.`,processed_at:new Date().toISOString(),custom_metadata:mergeMeta(item.custom_metadata,{generation_run_id:runId,seo_swarm_engine_version:VERSION,contract_passed:false,quality_gate:"failed_before_article",last_failure_code:code,last_failure_message:msg,article_generation_retriable:true,required_human_review:true})})}
async function agent(env:ReturnType<typeof envs>,name:string,prompt:string,modelEnv:string,timeoutMs:number){const model=Deno.env.get(modelEnv);if(!model)throw new Error(`error_modelo: ${modelEnv} no configurado`);if(!env.openRouterKey)throw new Error("error_modelo: OPENROUTER_API_KEY no configurado");const ac=new AbortController(),to=setTimeout(()=>ac.abort(),timeoutMs);try{const res=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",signal:ac.signal,headers:{authorization:`Bearer ${env.openRouterKey}`,"content-type":"application/json","HTTP-Referer":"https://github.com/accesos-seo/ops-control-plane","X-Title":"seo-sectioned-engine"},body:JSON.stringify({model,messages:[{role:"system",content:"Respond with valid JSON only. No markdown. Write all content in the language specified in the user prompt."},{role:"user",content:prompt}],response_format:{type:"json_object"}})});if(!res.ok)throw new Error(`${name} OpenRouter falló: ${res.status} ${await res.text()}`);const d=await res.json();return JSON.parse(d?.choices?.[0]?.message?.content||"{}")}catch(e){if(e instanceof DOMException&&e.name==="AbortError")throw new Error(`error_timeout: ${name}`);throw e}finally{clearTimeout(to)}}
function envs(){const supabaseUrl=reqEnv("SUPABASE_URL"),supabaseKey=reqEnv("SUPABASE_SERVICE_ROLE_KEY");return{supabaseUrl,supabaseKey,openRouterKey:Deno.env.get("OPENROUTER_API_KEY")||""}}function reqEnv(n:string){const v=Deno.env.get(n);if(!v)throw new Error(`Secret requerido no configurado: ${n}`);return v}
async function getOne<T>(env:ReturnType<typeof envs>,table:string,q:string,required=true){const r=await fetch(`${env.supabaseUrl}/rest/v1/${table}?${q}&select=*`,{headers:{apikey:env.supabaseKey,authorization:`Bearer ${env.supabaseKey}`,accept:"application/json"}});if(!r.ok)throw new Error(`Supabase select ${table} falló: ${r.status} ${await r.text()}`);const rows=await r.json();if(!rows?.length&&required)throw new Error(`error_validacion: no existe ${table}`);return rows?.[0]||null}
async function patch(env:ReturnType<typeof envs>,table:string,id:string,body:J){const r=await fetch(`${env.supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{apikey:env.supabaseKey,authorization:`Bearer ${env.supabaseKey}`,"content-type":"application/json",prefer:"return=minimal"},body:JSON.stringify(body)});if(!r.ok)throw new Error(`Supabase update ${table} falló: ${r.status} ${await r.text()}`)}
async function log(env:ReturnType<typeof envs>,run:string,id:string,step:string,agent:string,status:"started"|"ok"|"error"|"skipped"|"blocked"|"dry_run",out?:unknown,code?:string,msg?:string){await fetch(`${env.supabaseUrl}/rest/v1/content_generation_logs`,{method:"POST",headers:{apikey:env.supabaseKey,authorization:`Bearer ${env.supabaseKey}`,"content-type":"application/json",prefer:"return=minimal"},body:JSON.stringify({content_item_id:id,run_id:run,step,agent_or_skill:agent,status,operation_type:"text_generation",provider:"supabase-edge",output_snapshot:out||null,error_code:code||null,error_message:msg||null})}).catch(()=>{})}
function validateItem(i:Item|null,force:boolean):asserts i is Item{if(!i)throw new Error("error_validacion: content_item no encontrado");if(i.archived)throw new Error("error_validacion: content_item archivado");if(!i.title)throw new Error("error_validacion: title requerido");if(!i.main_keyword)throw new Error("error_validacion: main_keyword requerido");if(!i.client_id)throw new Error("error_validacion: client_id requerido");if(i.article_content&&!force)throw new Error("error_validacion: article_content ya existe; usar force=true")}
function assertKeys(o:J,ks:string[]){for(const k of ks)if(!(k in o))throw new Error(`error_modelo: falta ${k}`)}
function normRoot(v:unknown){if(Array.isArray(v))return v[0]||{};const o=obj(v);if(Array.isArray(o.items))return o.items[0]||{};if(Array.isArray(o.data))return o.data[0]||{};return v}
function obj(v:unknown):J{return v&&typeof v==="object"&&!Array.isArray(v)?v as J:{}}
function first(...xs:unknown[]){for(const x of xs)if(typeof x==="string"&&x.trim())return x.trim();return null}
function stringify(v:unknown){return !v?null:typeof v==="string"?v:JSON.stringify(v)}
function list(v:unknown){if(Array.isArray(v))return [...new Set(v.map(String).map(s=>s.trim()).filter(Boolean))];if(typeof v==="string")return [...new Set(v.split(/[,;\n]/).map(s=>s.trim()).filter(Boolean))];return[]}
function h2Details(v:unknown):J[]{const arr=Array.isArray(v)?v:Object.values(obj(v));return arr.map(x=>typeof x==="string"?{heading:x}:obj(x)).map(x=>({...x,heading:first(x.heading,x.h2,x.titulo,x.title)})).filter(x=>x.heading)}
function faqs(v:unknown){const arr=Array.isArray(v)?v:Object.values(obj(v));return [...new Set(arr.map(x=>typeof x==="string"?x:first(obj(x).pregunta,obj(x).question,obj(x).h3,obj(x).titulo)).filter(Boolean) as string[])]}
function facts(s:string|null){const t=s||"",set=new Set<string>();for(const m of t.matchAll(/\b\d+(?:[.,]\d+)?\s?(?:días|dias|años|anos|%|km|puntos?|minutos?|horas?|h|mxn|pesos?)\\b/gi))set.add(m[0]);for(const tok of["ADAS","BYD","MG","Chirey","JAC","Geely","SEV","Latin NCAP","Euro NCAP","Batería Blade","refacciones","garantía"])if(normalize(t).includes(normalize(tok)))set.add(tok);return Array.from(set).slice(0,30)}
function parseRange(v:string|null){if(!v)return{min:null,max:null};const nums=[...v.toLowerCase().replace(/[–—]/g,"-").replace(/,/g,"").matchAll(/\d{3,5}/g)].map(m=>Number(m[0]));if(nums.length>=2)return{min:Math.min(nums[0],nums[1]),max:Math.max(nums[0],nums[1])};if(nums.length===1)return{min:Math.round(nums[0]*.9),max:Math.round(nums[0]*1.1)};return{min:null,max:null}}
function clean(h:string){return h.replace(/<script(?![\s\S]*?data-cab)(?![\s\S]*?data-fz)[\s\S]*?<\/script>/gi,"").replace(/(<(?!script)[^>]+?)\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,"$1").replace(/(?<!['"])javascript\s*:/gi,"");}
function strip(h:string){return h.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
function words(t:string){return t?t.split(/\s+/).filter(Boolean).length:0}
function normalize(v:string){return String(v||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/<[^>]+>/g," ").replace(/[^a-z0-9.,\/\- ]+/g," ").replace(/\s+/g," ").trim()}
function hasTag(html:string,tag:string,expected:string){const re=new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,"gi"),e=normalize(expected);for(const m of html.matchAll(re))if(near(normalize(strip(m[1])),e))return true;return false}
function near(t:string,n:string){if(!n)return true;if(t.includes(n))return true;const ws=n.split(" ").filter(w=>w.length>2);if(ws.length<=2)return ws.every(w=>t.includes(w));return ws.filter(w=>t.includes(w)).length/ws.length>=.75}
function esc(s:string){return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
function memory(html:string){const text=strip(html);return text.length>1800?text.slice(-1800):text}
function mergeMeta(cur:J|null|undefined,extra:J){return{...(cur||{}),seo_content_swarm:{...((cur?.seo_content_swarm as J)||{}),...extra}}}
function redact(v:J){return Object.fromEntries(Object.entries(v).map(([k,val])=>k.includes("html")?[k,"[redacted_html]"]:[k,val]))}
function isPlaceholder(v:string){return["","default","placeholder","pendiente","sin-marca","test"].includes(v.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-"))}
function classify(m:string){if(m.includes("timeout"))return"error_timeout";if(m.includes("validacion")||m.includes("JSON"))return"error_validacion";if(m.includes("modelo")||m.includes("OpenRouter"))return"error_modelo";if(m.includes("contract")||m.includes("contrato"))return"error_contract_validation";if(m.includes("brand")||m.includes("Marca"))return"error_brand_context";if(m.includes("Supabase update"))return"error_persistencia";return"error_orquestador"}
function err(e:unknown){return e instanceof Error?e.message:String(e)}
function js(b:unknown,s=200){return new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json",...CORS}})}
function mockSection(s:Section,c:Contract){return `<${s.kind==="h2"?"h2":"p"}>${esc(s.heading||c.keyword||"Contenido")}</${s.kind==="h2"?"h2":"p"}><p>Dry run: ${esc(s.key)}.</p>`}
