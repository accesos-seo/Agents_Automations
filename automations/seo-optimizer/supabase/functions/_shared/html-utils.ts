// _shared/html-utils.ts
// Parsing de HTML + helpers para matching de queries en texto (sin stemming
// formal — usamos normalización Unicode + tokenización simple; suficiente para v1).

import { DOMParser, Element } from "jsr:@b-fuze/deno-dom@0.1.48";

export interface ParsedArticle {
  titleTag: string | null;
  metaDescription: string | null;
  h1: string | null;
  headings: Array<{ level: number; text: string }>;
  firstParagraph: string | null;
  bodyText: string;
  wordCount: number;
}

export function parseHtml(html: string): ParsedArticle {
  if (!html) {
    return { titleTag: null, metaDescription: null, h1: null, headings: [], firstParagraph: null, bodyText: "", wordCount: 0 };
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) {
    return { titleTag: null, metaDescription: null, h1: null, headings: [], firstParagraph: null, bodyText: "", wordCount: 0 };
  }

  const titleTag = doc.querySelector("title")?.textContent?.trim() ?? null;

  let metaDescription: string | null = null;
  const md = doc.querySelector('meta[name="description"]') ?? doc.querySelector('meta[property="og:description"]');
  if (md && md.getAttribute) {
    metaDescription = md.getAttribute("content")?.trim() ?? null;
  }

  const h1 = doc.querySelector("h1")?.textContent?.trim() ?? null;

  const headings: Array<{ level: number; text: string }> = [];
  for (let lvl = 1; lvl <= 6; lvl++) {
    const list = doc.querySelectorAll(`h${lvl}`);
    list.forEach((h: Element) => {
      const text = h.textContent?.trim();
      if (text) headings.push({ level: lvl, text });
    });
  }

  const firstParagraph = doc.querySelector("p")?.textContent?.trim() ?? null;

  // Body text: <p> + headings + alt-text of <img>
  const chunks: string[] = [];
  doc.querySelectorAll("p").forEach((p: Element) => {
    const t = p.textContent?.trim();
    if (t) chunks.push(t);
  });
  for (const h of headings) chunks.push(h.text);
  doc.querySelectorAll("img").forEach((img: Element) => {
    const alt = img.getAttribute?.("alt");
    if (alt) chunks.push(alt);
  });
  const bodyText = chunks.join(" ");
  const wordCount = bodyText.split(/\s+/).filter(s => s.length > 0).length;

  return { titleTag, metaDescription, h1, headings, firstParagraph, bodyText, wordCount };
}

// --- Query matching (no stemming, solo normalización) ---------------------

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");   // remove accents
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(t => t.length > 1);
}

/**
 * Check if at least `threshold` fraction of query tokens appear in article tokens.
 * Returns true if covered.
 */
export function queryAppearsIn(
  query: string,
  articleText: string,
  threshold = 0.7,
): boolean {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return false;
  const aSet = new Set(tokenize(articleText));
  let matches = 0;
  for (const t of qTokens) if (aSet.has(t)) matches++;
  return matches / qTokens.length >= threshold;
}

/**
 * Return queries that are NOT covered in the article's "key SEO real estate"
 * (title + meta + headings + first paragraph).
 */
export function findMissingQueries(queries: string[], article: ParsedArticle): string[] {
  const keyText = [
    article.titleTag ?? "",
    article.metaDescription ?? "",
    article.h1 ?? "",
    article.headings.map(h => h.text).join(" "),
    article.firstParagraph ?? "",
  ].join(" ");
  return queries.filter(q => !queryAppearsIn(q, keyText));
}

/**
 * Build a simple visual diff HTML between original and proposed strings.
 * Word-level diff via LCS-style approach (lightweight, no external dep).
 */
export function buildDiffHtml(original: string, proposed: string): string {
  const a = original.split(/(\s+)/);
  const b = proposed.split(/(\s+)/);
  // LCS table
  const m = a.length, n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // Walk back
  const out: string[] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push(escapeHtml(a[i]));
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`<del style="background:#fee;color:#900;text-decoration:line-through;">${escapeHtml(a[i])}</del>`);
      i++;
    } else {
      out.push(`<ins style="background:#efe;color:#070;text-decoration:none;">${escapeHtml(b[j])}</ins>`);
      j++;
    }
  }
  while (i < m) out.push(`<del style="background:#fee;color:#900;text-decoration:line-through;">${escapeHtml(a[i++])}</del>`);
  while (j < n) out.push(`<ins style="background:#efe;color:#070;text-decoration:none;">${escapeHtml(b[j++])}</ins>`);

  return `<div class="seo-optimizer-diff" style="font-family:monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;">${out.join("")}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}
