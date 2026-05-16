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
    sectionTitle: "BRIEFING & ANALYSIS", assetsTag: "DADOS DO BRIEFING", customerJourneyTag: "JORNADA", editorialLogicTag: "POR QUÊ & COMO", seoOptimizationTag: "META + CHECKLIST",
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
    sectionTitle: "BRIEFING & ANALYSIS", assetsTag: "BRIEFING DATA", customerJourneyTag: "READER PATH", editorialLogicTag: "WHY & HOW", seoOptimizationTag: "META + CHECKLIST",
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
    sectionTitle: "BRIEFING & ANALYSIS", assetsTag: "DATOS BRIEFING", customerJourneyTag: "RUTA DEL LECTOR", editorialLogicTag: "POR QUÉ & CÓMO", seoOptimizationTag: "META + CHECKLIST",
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

  // ── ASSETS TAB ────────────────────────────────────────────────
  const kws = c.secondary.slice(0, 8);
  const faqs = c.faq.slice(0, 6);
  const sections = c.h2.slice(0, 8);
  const kwTagsHtml = kws.map(function(k){ return '<span class="seo-fz-tag">' + esc(String(k)) + "</span>"; }).join("");
  const sectionsHtml = sections.map(function(s){ return "<li>" + esc(String(s)) + "</li>"; }).join("");
  const faqsHtml = faqs.map(function(q){ return "<li>" + esc(String(q)) + "</li>"; }).join("");
  const metaTitleCard = c.metaTitle ? '<div class="seo-fz-asset-card seo-fz-asset-card--full"><div class="seo-fz-asset-label">' + L.metaTitle + '</div><div class="seo-fz-asset-value">' + esc(c.metaTitle) + "</div></div>" : "";
  const metaDescCard = c.metaDescription ? '<div class="seo-fz-asset-card seo-fz-asset-card--full"><div class="seo-fz-asset-label">' + L.metaDescription + '</div><div class="seo-fz-asset-value">' + esc(c.metaDescription) + "</div></div>" : "";
  const kwsCard = kws.length ? '<div class="seo-fz-asset-card seo-fz-asset-card--full"><div class="seo-fz-asset-label">' + L.secondaryKeywords + '</div><div class="seo-fz-asset-tags">' + kwTagsHtml + "</div></div>" : "";
  const sectionsCard = sections.length ? '<div class="seo-fz-asset-card seo-fz-asset-card--full"><div class="seo-fz-asset-label">' + L.structure + '</div><ol class="seo-fz-asset-ol">' + sectionsHtml + "</ol></div>" : "";
  const faqsCard = faqs.length ? '<div class="seo-fz-asset-card seo-fz-asset-card--full"><div class="seo-fz-asset-label">' + L.faqQuestions + '</div><ul class="seo-fz-asset-ul">' + faqsHtml + "</ul></div>" : "";
  const assetsHtml = `
<div class="seo-fz-assets">
  <div class="seo-fz-asset-grid">
    <div class="seo-fz-asset-card seo-fz-asset-card--wide">
      <div class="seo-fz-asset-label">${L.mainKeyword}</div>
      <div class="seo-fz-asset-value seo-fz-kw-main">${esc(c.keyword || "—")}</div>
    </div>
    <div class="seo-fz-asset-card">
      <div class="seo-fz-asset-label">${L.intent}</div>
      <div class="seo-fz-asset-value">${esc(String(c.intent || "—"))}</div>
    </div>
    <div class="seo-fz-asset-card">
      <div class="seo-fz-asset-label">${L.targetLength}</div>
      <div class="seo-fz-asset-value">${esc(c.extensionRaw || "—")}</div>
    </div>
    <div class="seo-fz-asset-card seo-fz-asset-card--wide">
      <div class="seo-fz-asset-label">${L.audience}</div>
      <div class="seo-fz-asset-value">${esc(String(c.audience || "—"))}</div>
    </div>
    <div class="seo-fz-asset-card seo-fz-asset-card--wide">
      <div class="seo-fz-asset-label">${L.angle}</div>
      <div class="seo-fz-asset-value">${esc(String(c.angle || "—"))}</div>
    </div>
    ${metaTitleCard}
    ${metaDescCard}
    ${kwsCard}
    ${sectionsCard}
    ${faqsCard}
  </div>
</div>`;

  // ── CUSTOMER JOURNEY TAB ──────────────────────────────────────
  const stages: J[] = Array.isArray(cj.stages) ? cj.stages : [];
  const stagesInnerHtml = stages.map(function(s, i) {
    const icon = esc(String(s.icon_label || "◆"));
    const stageNum = String(s.number || i + 1);
    const stageName = esc(String(s.name || ""));
    const userStateHtml = s.user_state ? '<div class="seo-fz-cj-field"><span class="seo-fz-cj-field-label">Estado del usuario</span><p>' + esc(String(s.user_state)) + "</p></div>" : "";
    const userNeedHtml = '<div class="seo-fz-cj-field"><span class="seo-fz-cj-field-label">' + L.userNeed + "</span><p>" + esc(String(s.user_need || "")) + "</p></div>";
    const contentResponseHtml = '<div class="seo-fz-cj-field"><span class="seo-fz-cj-field-label">' + L.contentResponse + "</span><p>" + esc(String(s.content_response || "")) + "</p></div>";
    const refHtml = s.section_reference ? '<div class="seo-fz-cj-ref">→ ' + esc(String(s.section_reference)) + "</div>" : "";
    const arrowHtml = i < stages.length - 1 ? '<div class="seo-fz-cj-arrow" aria-hidden="true">→</div>' : "";
    return '<div class="seo-fz-cj-stage">' +
      '<div class="seo-fz-cj-stage-header">' +
      '<span class="seo-fz-cj-icon">' + icon + "</span>" +
      '<span class="seo-fz-cj-stage-num">' + L.stage + " " + stageNum + "</span>" +
      "</div>" +
      '<div class="seo-fz-cj-stage-name">' + stageName + "</div>" +
      userStateHtml + userNeedHtml + contentResponseHtml + refHtml +
      "</div>" + arrowHtml;
  }).join("");
  const fallbackHtml = '<div class="seo-fz-cj-fallback"><p><em>Customer journey generado con datos del brief.</em></p><p><strong>Keyword:</strong> ' + esc(c.keyword || "—") + "</p><p><strong>" + L.intent + ":</strong> " + esc(String(c.intent || "—")) + "</p><p><strong>" + L.audience + ":</strong> " + esc(String(c.audience || "—")) + "</p></div>";
  const stagesHtml = stages.length
    ? '<div class="seo-fz-cj-stages">' + stagesInnerHtml + "</div>"
    : fallbackHtml;

  const cjInsight = function(title: string, content: string) {
    return '<div class="seo-fz-cj-insight"><h4 class="seo-fz-insight-title">' + title + "</h4><p>" + content + "</p></div>";
  };
  const cjRationale = [
    cj.flow_rationale ? cjInsight(L.flowRationale, esc(String(cj.flow_rationale))) : "",
    cj.search_intent_alignment ? cjInsight(L.searchIntentAlignment, esc(String(cj.search_intent_alignment))) : "",
    cj.audience_insight ? cjInsight(L.audienceInsight, esc(String(cj.audience_insight))) : "",
  ].filter(Boolean).join("\n");
  const cjInsightsBlock = cjRationale ? '<div class="seo-fz-cj-insights">' + cjRationale + "</div>" : "";
  const cjHtml = '<div class="seo-fz-cj">' + stagesHtml + cjInsightsBlock + "</div>";

  // ── EDITORIAL LOGIC TAB ───────────────────────────────────────
  const decisions: string[] = Array.isArray(el.key_editorial_decisions) ? el.key_editorial_decisions.map(String) : [];
  const decisionsHtml = decisions.map(function(d){ return "<li>" + esc(d) + "</li>"; }).join("");
  const elBlock = function(title: string, content: string, extra = "") {
    return '<div class="seo-fz-el-block' + (extra ? " " + extra : "") + '"><h4 class="seo-fz-el-title">' + title + "</h4><p>" + content + "</p></div>";
  };
  const elWhyStr = el.why_structure ? elBlock(L.whyStructure, esc(String(el.why_structure))) : "";
  const elIntentStr = el.search_intent_served ? elBlock(L.searchIntentAlignment, esc(String(el.search_intent_served))) : "";
  const elReaderStr = el.target_reader_profile ? elBlock(L.targetReader, esc(String(el.target_reader_profile))) : "";
  const elDistStr = el.content_distribution_logic ? elBlock(L.contentDist, esc(String(el.content_distribution_logic))) : "";
  const elDecisionsStr = decisions.length ? '<div class="seo-fz-el-block"><h4 class="seo-fz-el-title">' + L.editorialDecisions + '</h4><ul class="seo-fz-el-list">' + decisionsHtml + "</ul></div>" : "";
  const elConvStr = el.conversion_rationale ? elBlock(L.conversionRationale, esc(String(el.conversion_rationale))) : "";
  const elQualStr = el.quality_signals ? elBlock(L.qualitySignals, esc(String(el.quality_signals)), "seo-fz-el-block--highlight") : "";
  const elFallbackStr = !el.why_structure && !el.target_reader_profile ? '<div class="seo-fz-el-block"><p><strong>' + L.intent + ":</strong> " + esc(String(c.intent || "—")) + "</p><p><strong>" + L.audience + ":</strong> " + esc(String(c.audience || "—")) + "</p><p><strong>" + L.angle + ":</strong> " + esc(String(c.angle || "—")) + "</p></div>" : "";
  const elHtml = '<div class="seo-fz-el">' + elWhyStr + elIntentStr + elReaderStr + elDistStr + elDecisionsStr + elConvStr + elQualStr + elFallbackStr + "</div>";

  // ── SEO OPTIMIZATION TAB ─────────────────────────────────────
  const seoNorm = function(s: string) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  };
  const kw = seoNorm(c.keyword || "");
  const mtLen = (c.metaTitle || "").length;
  const mdLen = (c.metaDescription || "").length;
  const ogTitle = c.metaTitle || c.h1 || "—";
  const ogDesc = c.metaDescription || "—";

  const charBadge = function(len: number, idealMin: number, idealMax: number) {
    const cls = len >= idealMin && len <= idealMax ? "ok" : (len >= idealMin - 15 && len <= idealMax + 20 ? "warn" : "err");
    return '<span class="seo-fz-seo-badge seo-fz-seo-badge--' + cls + '">' + len + " " + L.chars + "</span>";
  };

  const checkItem = function(state: "ok" | "warn" | "err", label: string) {
    const icon = state === "ok" ? "✅" : state === "warn" ? "⚠️" : "❌";
    return '<li class="seo-fz-seo-check seo-fz-seo-check--' + state + '">' + icon + " " + esc(label) + "</li>";
  };

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
  const wcLabel = L.checkWordCount + ": " + val.wordCount + (wcMin ? " / " + wcMin + (wcMax ? "–" + wcMax : "+") : "");

  const checklistHtml = "<ul class=\"seo-fz-seo-checklist\">" +
    checkItem(!val.missingH1 ? "ok" : "err", L.checkH1Present) +
    checkItem(kwInH1 ? "ok" : (kw ? "err" : "warn"), L.checkKwInH1) +
    checkItem(kwInMeta ? "ok" : (kw && c.metaTitle ? "err" : "warn"), L.checkKwInMeta) +
    checkItem(kwInDesc ? "ok" : (kw && c.metaDescription ? "warn" : "warn"), L.checkKwInDesc) +
    checkItem(mtState, L.checkMetaTitleLen + " (" + mtLen + " " + L.chars + ")") +
    checkItem(mdState, L.checkMetaDescLen + " (" + mdLen + " " + L.chars + ")") +
    checkItem(faqOk ? "ok" : (c.faq.length > 0 ? "warn" : "err"), L.checkFaq + (c.faq.length ? " (" + c.faq.length + ")" : "")) +
    checkItem(!val.missingCta ? "ok" : "warn", L.checkCta) +
    checkItem(c.slug ? "ok" : "warn", L.checkSlug) +
    checkItem(wcOk ? "ok" : (wcWarn ? "warn" : "err"), wcLabel) +
    "</ul>";

  // Extract images from article HTML
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
    return '<div class="seo-fz-seo-img-row">' +
      '<div class="seo-fz-seo-img-src"><code>' + esc(srcShort) + "</code></div>" +
      '<div class="seo-fz-seo-img-fields">' +
      '<span class="seo-fz-seo-img-label">' + L.altCurrent + '</span>' +
      '<span class="seo-fz-seo-img-val' + (alt ? "" : " seo-fz-seo-img-val--empty") + '">' + (alt ? esc(alt) : "—") + "</span>" +
      '<span class="seo-fz-seo-img-label">' + L.altSuggested + '</span>' +
      '<span class="seo-fz-seo-img-val seo-fz-seo-img-val--suggested">' + esc(suggestedAlt) + "</span>" +
      (title ? '<span class="seo-fz-seo-img-label">' + L.titleAttr + '</span><span class="seo-fz-seo-img-val">' + esc(title) + "</span>" : "") +
      "</div></div>";
  }).filter(Boolean);

  const imgsHtml = imgRows.length
    ? imgRows.join("")
    : '<p class="seo-fz-seo-no-imgs">' + esc(L.noImagesFound) + "</p>";

  const seoHtml = '<div class="seo-fz-seo">' +
    '<div class="seo-fz-seo-section">' +
    '<h3 class="seo-fz-seo-section-title">' + L.metaOg + "</h3>" +
    '<div class="seo-fz-seo-meta-grid">' +
    '<div class="seo-fz-seo-meta-field seo-fz-seo-meta-field--full">' +
    '<div class="seo-fz-seo-meta-header"><span class="seo-fz-seo-meta-label">Meta title</span>' + charBadge(mtLen, 50, 60) + "</div>" +
    '<div class="seo-fz-seo-meta-value">' + esc(c.metaTitle || "—") + "</div></div>" +
    '<div class="seo-fz-seo-meta-field seo-fz-seo-meta-field--full">' +
    '<div class="seo-fz-seo-meta-header"><span class="seo-fz-seo-meta-label">Meta description</span>' + charBadge(mdLen, 140, 160) + "</div>" +
    '<div class="seo-fz-seo-meta-value">' + esc(c.metaDescription || "—") + "</div></div>" +
    '<div class="seo-fz-seo-meta-field">' +
    '<div class="seo-fz-seo-meta-header"><span class="seo-fz-seo-meta-label">H1</span></div>' +
    '<div class="seo-fz-seo-meta-value">' + esc(c.h1 || "—") + "</div></div>" +
    '<div class="seo-fz-seo-meta-field">' +
    '<div class="seo-fz-seo-meta-header"><span class="seo-fz-seo-meta-label">Slug</span></div>' +
    '<div class="seo-fz-seo-meta-value seo-fz-seo-meta-value--slug">' + esc(c.slug || "—") + "</div></div>" +
    '<div class="seo-fz-seo-og seo-fz-seo-meta-field--full">' +
    '<div class="seo-fz-seo-og-title">Open Graph</div>' +
    '<div class="seo-fz-seo-og-row"><code>og:title</code><span>' + esc(ogTitle) + "</span></div>" +
    '<div class="seo-fz-seo-og-row"><code>og:description</code><span>' + esc(ogDesc.slice(0, 120) + (ogDesc.length > 120 ? "…" : "")) + "</span></div>" +
    '<div class="seo-fz-seo-og-row"><code>og:type</code><span>article</span></div>' +
    '<div class="seo-fz-seo-og-row"><code>og:image</code><span class="seo-fz-seo-og-note">' + esc(L.ogImageNote) + "</span></div>" +
    "</div></div></div>" +
    '<div class="seo-fz-seo-section"><h3 class="seo-fz-seo-section-title">' + L.seoChecklist + "</h3>" + checklistHtml + "</div>" +
    '<div class="seo-fz-seo-section"><h3 class="seo-fz-seo-section-title">' + L.seoImages + "</h3>" +
    '<p class="seo-fz-seo-img-note">' + esc(L.featuredImageNote) + "</p>" +
    imgsHtml + "</div></div>";

  // ── STYLES ─────────────────────────────────────────────────────
  const styles = `<style data-fz="1">
::-webkit-scrollbar{width:10px}
::-webkit-scrollbar-track{background:#111118}
::-webkit-scrollbar-thumb{background:#6C5CFF;border-radius:999px}
.seo-fz-sep{margin:48px 0 0;padding:0}
.seo-fz-sep-line{height:2px;background:linear-gradient(90deg,transparent 0%,rgba(108,92,255,0.25) 20%,rgba(108,92,255,0.6) 50%,rgba(108,92,255,0.25) 80%,transparent 100%)}
.seo-fz-wrapper{margin:32px 0 0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:15px;color:#A8B3CF;background:#0B0B0F;border-radius:18px;border:1px solid rgba(120,120,255,0.12)}
.seo-fz-header{display:flex;align-items:center;gap:12px;margin:0 0 24px;padding-bottom:24px;border-bottom:1px solid rgba(140,140,255,0.15)}
.seo-fz-header-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(108,92,255,0.25))}
.seo-fz-header-label{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9B8CFF;white-space:nowrap;padding:0 8px;text-shadow:0 0 12px rgba(155,140,255,0.5)}
.seo-fz-tabs{display:flex;justify-content:space-between;gap:4px;padding:6px;background:#14141B;border-radius:14px;margin:0 0 8px;border:1px solid rgba(120,120,255,0.12)}
.seo-fz-tab-sep{height:1px;background:rgba(140,140,255,0.15);margin:0 0 32px}
.seo-fz-tab{flex:1;padding:12px 16px;border:none;background:transparent;border-radius:10px;cursor:pointer;transition:all .2s;text-align:left;display:flex;flex-direction:column;gap:2px}
.seo-fz-tab-num{font-size:11px;font-weight:700;letter-spacing:.06em;color:#4B5563;transition:color .2s}
.seo-fz-tab-main{font-size:13px;font-weight:600;color:#6B7280;transition:color .2s;white-space:nowrap}
.seo-fz-tab-sub{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#374151;transition:color .2s}
.seo-fz-tab:hover{background:#1B1B24}
.seo-fz-tab:hover .seo-fz-tab-num{color:#9B8CFF}
.seo-fz-tab:hover .seo-fz-tab-main{color:#A8B3CF}
.seo-fz-tab:hover .seo-fz-tab-sub{color:#6B7280}
.seo-fz-tab--active{background:rgba(108,92,255,0.12);border:1px solid rgba(108,92,255,0.35);box-shadow:0 0 12px rgba(108,92,255,0.15)}
.seo-fz-tab--active .seo-fz-tab-num{color:#9B8CFF}
.seo-fz-tab--active .seo-fz-tab-main{color:#FFFFFF;font-weight:700}
.seo-fz-tab--active .seo-fz-tab-sub{color:#6EE7FF}
.seo-fz-panel{display:none}.seo-fz-panel--active{display:block}
.seo-fz-assets{}.seo-fz-asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px}
.seo-fz-asset-card{background:#1B1B24;border:1px solid rgba(120,120,255,0.12);border-radius:14px;padding:16px 18px;transition:background .2s}
.seo-fz-asset-card:hover{background:#222230}
.seo-fz-asset-card--wide{grid-column:span 2}.seo-fz-asset-card--full{grid-column:1/-1}
.seo-fz-asset-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6EE7FF;margin:0 0 8px;text-shadow:0 0 8px rgba(110,231,255,0.25)}
.seo-fz-asset-value{font-size:14px;color:#E2E8F0;line-height:1.6}
.seo-fz-kw-main{font-size:18px;font-weight:800;color:#FFFFFF;text-shadow:0 0 20px rgba(155,140,255,0.3)}
.seo-fz-asset-tags{display:flex;flex-wrap:wrap;gap:8px}
.seo-fz-tag{background:rgba(108,92,255,0.12);border:1px solid rgba(108,92,255,0.35);color:#C6BEFF;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:500}
.seo-fz-asset-ol,.seo-fz-asset-ul{margin:8px 0 0;padding:0 0 0 18px;font-size:13px;color:#A8B3CF;line-height:1.8}
.seo-fz-cj{}.seo-fz-cj-stages{display:flex;align-items:flex-start;gap:0;overflow-x:auto;padding:8px 0 24px;-webkit-overflow-scrolling:touch}
.seo-fz-cj-stage{flex:0 0 220px;background:#1B1B24;border:1px solid rgba(120,120,255,0.15);border-radius:14px;padding:18px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.4)}
.seo-fz-cj-arrow{flex:0 0 auto;align-self:center;font-size:20px;color:#6C5CFF;padding:0 8px;font-weight:300;text-shadow:0 0 8px rgba(108,92,255,0.5)}
.seo-fz-cj-stage-header{display:flex;align-items:center;gap:8px;margin:0 0 8px}
.seo-fz-cj-icon{font-size:20px;line-height:1}
.seo-fz-cj-stage-num{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9B8CFF}
.seo-fz-cj-stage-name{font-size:15px;font-weight:700;color:#FFFFFF;margin:0 0 12px;line-height:1.3}
.seo-fz-cj-field{margin:0 0 10px}
.seo-fz-cj-field-label{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6EE7FF;margin:0 0 4px}
.seo-fz-cj-field p{margin:0;font-size:12px;color:#A8B3CF;line-height:1.6}
.seo-fz-cj-ref{margin-top:10px;font-size:11px;color:#9B8CFF;font-style:italic;border-top:1px solid rgba(120,120,255,0.15);padding-top:8px}
.seo-fz-cj-insights{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin:24px 0 0}
.seo-fz-cj-insight{background:#1B1B24;border:1px solid rgba(108,92,255,0.25);border-radius:14px;padding:16px;box-shadow:0 0 12px rgba(108,92,255,0.08)}
.seo-fz-insight-title{margin:0 0 8px;font-size:13px;font-weight:700;color:#9B8CFF;text-shadow:0 0 8px rgba(155,140,255,0.3)}
.seo-fz-cj-insight p{margin:0;font-size:13px;color:#A8B3CF;line-height:1.6}
.seo-fz-cj-fallback{background:#1B1B24;border-radius:14px;padding:20px;font-size:14px;color:#A8B3CF}
.seo-fz-el{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.seo-fz-el-block{background:#1B1B24;border:1px solid rgba(120,120,255,0.12);border-radius:14px;padding:18px}
.seo-fz-el-block--highlight{background:rgba(108,92,255,0.08);border-color:rgba(108,92,255,0.35);box-shadow:0 0 12px rgba(108,92,255,0.12)}
.seo-fz-el-title{margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7CFFB2;text-shadow:0 0 8px rgba(124,255,178,0.2)}
.seo-fz-el-block p{margin:0 0 8px;font-size:13px;color:#A8B3CF;line-height:1.7}
.seo-fz-el-block p:last-child{margin-bottom:0}
.seo-fz-el-list{margin:0;padding:0 0 0 16px;font-size:13px;color:#A8B3CF;line-height:1.8}
@media(max-width:640px){
  .seo-fz-tabs{flex-direction:column}
  .seo-fz-asset-card--wide{grid-column:span 1}
  .seo-fz-cj-stages{flex-direction:column;overflow-x:visible}
  .seo-fz-cj-arrow{transform:rotate(90deg);align-self:flex-start;padding:4px 0}
  .seo-fz-el{grid-template-columns:1fr}
}
.seo-fz-seo{display:flex;flex-direction:column;gap:24px}
.seo-fz-seo-section{background:#1B1B24;border:1px solid rgba(120,120,255,0.12);border-radius:14px;padding:20px}
.seo-fz-seo-section-title{margin:0 0 16px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6EE7FF;text-shadow:0 0 8px rgba(110,231,255,0.25)}
.seo-fz-seo-meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.seo-fz-seo-meta-field{background:#14141B;border:1px solid rgba(120,120,255,0.12);border-radius:10px;padding:12px 14px}
.seo-fz-seo-meta-field--full{grid-column:1/-1}
.seo-fz-seo-meta-header{display:flex;align-items:center;justify-content:space-between;margin:0 0 6px}
.seo-fz-seo-meta-label{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9B8CFF}
.seo-fz-seo-meta-value{font-size:13px;color:#E2E8F0;line-height:1.6}
.seo-fz-seo-meta-value--slug{font-family:monospace;font-size:12px;color:#6EE7FF}
.seo-fz-seo-badge{padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700}
.seo-fz-seo-badge--ok{background:rgba(124,255,178,0.15);color:#7CFFB2;border:1px solid rgba(124,255,178,0.3)}
.seo-fz-seo-badge--warn{background:rgba(251,191,36,0.12);color:#FCD34D;border:1px solid rgba(251,191,36,0.25)}
.seo-fz-seo-badge--err{background:rgba(239,68,68,0.12);color:#F87171;border:1px solid rgba(239,68,68,0.25)}
.seo-fz-seo-og{background:#14141B;border:1px solid rgba(108,92,255,0.25);border-radius:10px;padding:14px;box-shadow:0 0 12px rgba(108,92,255,0.08)}
.seo-fz-seo-og-title{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9B8CFF;margin:0 0 10px;text-shadow:0 0 8px rgba(155,140,255,0.3)}
.seo-fz-seo-og-row{display:flex;gap:10px;align-items:baseline;margin:0 0 6px;font-size:12px}
.seo-fz-seo-og-row code{flex:0 0 120px;color:#6EE7FF;font-size:11px}
.seo-fz-seo-og-row span{color:#A8B3CF;line-height:1.5}
.seo-fz-seo-og-note{color:#6B7280;font-style:italic}
.seo-fz-seo-checklist{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.seo-fz-seo-check{font-size:13px;padding:8px 14px;border-radius:10px;line-height:1.5}
.seo-fz-seo-check--ok{background:rgba(124,255,178,0.08);color:#7CFFB2;border:1px solid rgba(124,255,178,0.2)}
.seo-fz-seo-check--warn{background:rgba(251,191,36,0.08);color:#FCD34D;border:1px solid rgba(251,191,36,0.2)}
.seo-fz-seo-check--err{background:rgba(239,68,68,0.08);color:#F87171;border:1px solid rgba(239,68,68,0.2)}
.seo-fz-seo-img-note{margin:0 0 16px;font-size:12px;color:#6B7280;font-style:italic}
.seo-fz-seo-no-imgs{font-size:13px;color:#6B7280;font-style:italic;margin:0}
.seo-fz-seo-img-row{border:1px solid rgba(120,120,255,0.12);border-radius:10px;padding:12px 14px;margin:0 0 10px;background:#14141B}
.seo-fz-seo-img-src{margin:0 0 10px;overflow:hidden}
.seo-fz-seo-img-src code{font-size:11px;color:#9B8CFF;word-break:break-all}
.seo-fz-seo-img-fields{display:grid;grid-template-columns:100px 1fr;gap:4px 10px;align-items:baseline;font-size:12px}
.seo-fz-seo-img-label{font-weight:700;color:#6EE7FF;text-transform:uppercase;font-size:10px;letter-spacing:.06em}
.seo-fz-seo-img-val{color:#A8B3CF;line-height:1.5}
.seo-fz-seo-img-val--empty{color:#4B5563;font-style:italic}
.seo-fz-seo-img-val--suggested{color:#6EE7FF;font-weight:500}
@media(max-width:640px){.seo-fz-seo-meta-grid{grid-template-columns:1fr}.seo-fz-seo-og-row{flex-wrap:wrap}.seo-fz-seo-og-row code{flex:none}}
</style>`;

  // ── SCRIPT ─────────────────────────────────────────────────────
  const script = `<script data-fz="1">
(function(){
  var wrapper=document.getElementById('${uid}-wrapper');
  if(!wrapper)return;
  var tabs=wrapper.querySelectorAll('.seo-fz-tab');
  var panels=wrapper.querySelectorAll('.seo-fz-panel');
  tabs.forEach(function(tab){
    tab.addEventListener('click',function(){
      var target=tab.getAttribute('data-fz-target');
      tabs.forEach(function(t){t.classList.remove('seo-fz-tab--active');});
      panels.forEach(function(p){p.classList.remove('seo-fz-panel--active');});
      tab.classList.add('seo-fz-tab--active');
      var panel=document.getElementById(target);
      if(panel)panel.classList.add('seo-fz-panel--active');
    });
  });
})();
<\/script>`;

  return `${styles}
<div class="seo-fz-sep" aria-hidden="true"><div class="seo-fz-sep-line"></div></div>
<section id="${uid}-wrapper" class="seo-fz-wrapper" aria-label="${L.supplementaryContent}">
  <div class="seo-fz-header">
    <div class="seo-fz-header-line"></div>
    <span class="seo-fz-header-label">${L.sectionTitle}</span>
    <div class="seo-fz-header-line"></div>
  </div>
  <nav class="seo-fz-tabs" role="tablist">
    <button class="seo-fz-tab seo-fz-tab--active" role="tab" data-fz-target="${uid}-assets" aria-selected="true"><span class="seo-fz-tab-num">01</span><span class="seo-fz-tab-main">${L.assets}</span><span class="seo-fz-tab-sub">${L.assetsTag}</span></button>
    <button class="seo-fz-tab" role="tab" data-fz-target="${uid}-cj" aria-selected="false"><span class="seo-fz-tab-num">02</span><span class="seo-fz-tab-main">${L.customerJourney}</span><span class="seo-fz-tab-sub">${L.customerJourneyTag}</span></button>
    <button class="seo-fz-tab" role="tab" data-fz-target="${uid}-el" aria-selected="false"><span class="seo-fz-tab-num">03</span><span class="seo-fz-tab-main">${L.editorialLogic}</span><span class="seo-fz-tab-sub">${L.editorialLogicTag}</span></button>
    <button class="seo-fz-tab" role="tab" data-fz-target="${uid}-seo" aria-selected="false"><span class="seo-fz-tab-num">04</span><span class="seo-fz-tab-main">${L.seoOptimization}</span><span class="seo-fz-tab-sub">${L.seoOptimizationTag}</span></button>
  </nav>
  <div class="seo-fz-tab-sep" aria-hidden="true"></div>
  <div class="seo-fz-panels">
    <div id="${uid}-assets" class="seo-fz-panel seo-fz-panel--active" role="tabpanel">${assetsHtml}</div>
    <div id="${uid}-cj" class="seo-fz-panel" role="tabpanel">${cjHtml}</div>
    <div id="${uid}-el" class="seo-fz-panel" role="tabpanel">${elHtml}</div>
    <div id="${uid}-seo" class="seo-fz-panel" role="tabpanel">${seoHtml}</div>
  </div>
</section>
${script}`;
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
