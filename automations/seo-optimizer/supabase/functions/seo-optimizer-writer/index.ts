// seo-optimizer-writer
// Triggered by DB trigger on opportunities.status='approved'.
// Generates HTML rewrite using LLM, then sets status='ready_for_writer'.

import { verifySecret } from "../_shared/secret.ts";
import { callWithUsage, parseLlmJson, getModelName } from "../_shared/llm-client.ts";
import { buildDiffHtml } from "../_shared/html-utils.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { sbSchema, getFunctionsBaseUrl, getInternalSecret } from "../_shared/supabase.ts";

interface Payload {
  opportunity_id: string;
  regenerate?: boolean;
}

interface LlmOutput {
  change_summary?: string;
  proposed_html?: string;
  proposed_title_tag?: string | null;
  proposed_meta_description?: string | null;
  proposed_h1?: string | null;
}

// Embedded prompts (Edge Functions can't read arbitrary local files at runtime
// reliably across deployments; we inline the text here. Source-of-truth lives in
// the prompts/ folder for git visibility and we sync it manually.)
const PROMPT_REWRITE_BODY = await readPrompt("rewrite-body.txt");
const PROMPT_REWRITE_META = await readPrompt("rewrite-meta.txt");

async function readPrompt(name: string): Promise<string> {
  // In Supabase Edge Functions, relative file reads work at deploy time
  try {
    const url = new URL(`./prompts/${name}`, import.meta.url);
    return await Deno.readTextFile(url);
  } catch {
    return ""; // will be replaced with embedded fallback if needed
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const authErr = verifySecret(req);
  if (authErr) return authErr;

  const payload: Payload = await req.json();
  const { opportunity_id, regenerate } = payload;

  const { data: opp, error: oppErr } = await sbSchema("seo_optimizer")
    .from("opportunities").select("*").eq("id", opportunity_id).single();
  if (oppErr || !opp) return Response.json({ status: "failed", reason: "opportunity_not_found" });

  if (!["approved", "writing"].includes(opp.status) && !regenerate) {
    return Response.json({ status: "skipped", reason: `status is ${opp.status}, not approved` });
  }

  const runId = opp.run_id, clientId = opp.client_id;

  // Mark as writing (idempotent guard)
  await sbSchema("seo_optimizer").from("opportunities").update({ status: "writing" })
    .eq("id", opportunity_id).eq("status", "approved");

  await emitEvent({ runId, clientId, eventSource: "writer", eventType: "agent_started",
    payload: { opportunity_id } });

  // Load article snapshot
  const { data: snaps } = await sbSchema("seo_optimizer").from("article_snapshots")
    .select("url, html, title_tag, meta_description, h1")
    .eq("run_id", runId).eq("client_id", clientId).eq("url", opp.article_url).limit(1);
  const snap = (snaps && snaps[0]) || null;
  if (!snap || !snap.html) {
    await sbSchema("seo_optimizer").from("opportunities").update({ status: "approved" }).eq("id", opportunity_id);
    await emitEvent({ runId, clientId, eventSource: "writer", eventType: "agent_failed",
      errorMessage: "no article snapshot HTML available" });
    return Response.json({ status: "failed", reason: "no_snapshot_html" });
  }

  // Pick prompt
  const isMetaOnly = opp.category === "low_ctr";
  const promptTemplate = isMetaOnly ? PROMPT_REWRITE_META : PROMPT_REWRITE_BODY;
  const languageName = mapLanguageName(opp.article_language as string | null);
  const system = promptTemplate.replaceAll("{language}", languageName);

  const userPayload = {
    article_url: opp.article_url,
    article_title: opp.article_title,
    article_language: opp.article_language,
    category: opp.category,
    current_title_tag: snap.title_tag,
    current_meta_description: snap.meta_description,
    current_h1: snap.h1,
    current_html: snap.html,
    evidence: opp.evidence,
    recommendation_summary: opp.recommendation_summary,
    recommendation_details: opp.recommendation_details,
  };

  let text: string;
  let usage: { input_tokens: number; output_tokens: number };
  try {
    const r = await callWithUsage({
      system, user: JSON.stringify(userPayload, null, 2),
      maxTokens: 8000, temperature: 0.3, cacheSystem: true,
    });
    text = r.text; usage = r.usage;
  } catch (err) {
    await sbSchema("seo_optimizer").from("opportunities").update({ status: "approved" }).eq("id", opportunity_id);
    await emitEvent({ runId, clientId, eventSource: "writer", eventType: "agent_failed",
      errorMessage: `LLM call: ${err}` });
    return Response.json({ status: "failed", reason: "llm_error", error: String(err) });
  }

  let parsed: LlmOutput;
  try {
    parsed = parseLlmJson<LlmOutput>(text);
  } catch (err) {
    await sbSchema("seo_optimizer").from("opportunities").update({ status: "approved" }).eq("id", opportunity_id);
    await emitEvent({ runId, clientId, eventSource: "writer", eventType: "agent_failed",
      errorMessage: `parse error: ${err}` });
    return Response.json({ status: "failed", reason: "parse_error" });
  }

  const proposedHtml = parsed.proposed_html ?? snap.html;
  const diffHtml = buildDiffHtml(snap.html ?? "", proposedHtml);

  const { data: ins, error: insErr } = await sbSchema("seo_optimizer").from("opportunity_rewrites").insert({
    opportunity_id,
    original_html: snap.html,
    proposed_html: proposedHtml,
    proposed_title_tag: parsed.proposed_title_tag ?? null,
    proposed_meta_description: parsed.proposed_meta_description ?? null,
    proposed_h1: parsed.proposed_h1 ?? null,
    diff_html: diffHtml,
    change_summary: parsed.change_summary ?? "(sin resumen)",
    generated_by_model: getModelName(),
    tokens_input: usage.input_tokens,
    tokens_output: usage.output_tokens,
    status: "draft",
  }).select().single();
  if (insErr) {
    await sbSchema("seo_optimizer").from("opportunities").update({ status: "approved" }).eq("id", opportunity_id);
    await emitEvent({ runId, clientId, eventSource: "writer", eventType: "agent_failed",
      errorMessage: `insert: ${insErr.message}` });
    return Response.json({ status: "failed", reason: "insert_error" });
  }
  const rewriteId = ins.id;

  // Advance status
  await sbSchema("seo_optimizer").from("opportunities").update({ status: "ready_for_writer" }).eq("id", opportunity_id);

  // Notify redactor via dispatcher (fire-and-forget HTTP)
  try {
    await fetch(`${getFunctionsBaseUrl()}/seo-optimizer-dispatcher`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": getInternalSecret() },
      body: JSON.stringify({ opportunity_id, recipient: "redactor" }),
    });
  } catch (err) {
    await emitEvent({ runId, clientId, eventSource: "writer", eventType: "warning",
      errorMessage: `dispatcher to redactor failed: ${err}` });
  }

  await emitEvent({ runId, clientId, eventSource: "writer", eventType: "rewrite_generated",
    payload: { opportunity_id, rewrite_id: rewriteId, usage } });

  return Response.json({ status: "ok", rewrite_id: rewriteId, tokens_used: usage, category: opp.category });
});

function mapLanguageName(lang: string | null): string {
  if (!lang) return "Spanish";
  const l = lang.toLowerCase();
  if (l.startsWith("pt")) return "Brazilian Portuguese";
  if (l.startsWith("en")) return "English";
  return "Spanish";
}
