// seo-optimizer-dispatcher
// Two modes:
//   - { run_id } → enqueue per-client SEO summary notifications
//   - { opportunity_id, recipient: 'redactor' } → enqueue rewrite-ready notif

import { verifySecret } from "../_shared/secret.ts";
import { getClient } from "../_shared/orbit.ts";
import { buildSeoNotification, buildWriterNotification } from "../_shared/slack-blockkit.ts";
import { emitEvent } from "../_shared/run-events.ts";
import { sbSchema, getSupabase } from "../_shared/supabase.ts";

interface Payload {
  run_id?: string;
  opportunity_id?: string;
  recipient?: "seo" | "redactor";
}

Deno.serve(async (req: Request): Promise<Response> => {
  const authErr = verifySecret(req);
  if (authErr) return authErr;

  const payload: Payload = await req.json();
  if (payload.opportunity_id) return Response.json(await dispatchRedactor(payload.opportunity_id));
  if (payload.run_id) return Response.json(await dispatchSeoSummary(payload.run_id));
  return Response.json({ status: "noop", reason: "no run_id or opportunity_id" });
});

async function dispatchSeoSummary(runId: string): Promise<Record<string, unknown>> {
  const { data: rows, error } = await sbSchema("seo_optimizer").from("opportunities")
    .select("client_id, category").eq("run_id", runId).eq("status", "pending");
  if (error || !rows || rows.length === 0) {
    return { status: "ok", enqueued: 0, reason: "no_opportunities" };
  }

  const perClient = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const cid = r.client_id as string;
    if (!perClient.has(cid)) perClient.set(cid, {});
    const cats = perClient.get(cid)!;
    const cat = r.category as string;
    cats[cat] = (cats[cat] ?? 0) + 1;
  }

  const frontendUrl = Deno.env.get("ORBIT_FRONTEND_URL") ?? "https://orbit.example.com";
  const fallback = Deno.env.get("SLACK_FALLBACK_CHANNEL") ?? "";
  let enqueued = 0, skipped = 0;
  const sb = getSupabase();

  for (const [clientId, byCat] of perClient) {
    const client = await getClient(clientId);
    const clientName = client?.name ?? `(cliente ${clientId.slice(0, 8)})`;
    const total = Object.values(byCat).reduce((a, b) => a + b, 0);
    const reviewUrl = `${frontendUrl.replace(/\/$/, "")}/seo-optimizer/run/${runId}?client=${clientId}`;
    const slackPayload = buildSeoNotification({
      clientName, runId, opportunitiesCount: total, byCategory: byCat, reviewUrl,
    });
    const targetChannel = client?.slackChannelId ?? fallback;
    if (!targetChannel) {
      skipped++;
      await emitEvent({ runId, clientId, eventSource: "dispatcher", eventType: "warning",
        errorMessage: "no Slack channel resolved" });
      continue;
    }
    const dedupe = `seo_optimizer:${runId}:${clientId}:seo_summary:v1`;
    const { error: upErr } = await sb.from("notifications_outbox").upsert({
      source: "seo_optimizer", target_type: "slack_channel",
      channel_id: targetChannel, payload: slackPayload, dedupe_key: dedupe, status: "pending",
    }, { onConflict: "dedupe_key" });
    if (upErr) {
      await emitEvent({ runId, clientId, eventSource: "dispatcher", eventType: "warning",
        errorMessage: `outbox upsert failed: ${upErr.message}` });
      continue;
    }
    enqueued++;
  }

  await emitEvent({ runId, eventSource: "dispatcher", eventType: "opportunity_dispatched",
    payload: { enqueued, skipped, clients_notified: Array.from(perClient.keys()) } });
  return { status: "ok", enqueued, skipped };
}

async function dispatchRedactor(opportunityId: string): Promise<Record<string, unknown>> {
  const { data: opp } = await sbSchema("seo_optimizer").from("opportunities")
    .select("id, run_id, client_id, article_url, article_title, category")
    .eq("id", opportunityId).single();
  if (!opp) return { status: "failed", reason: "opportunity_not_found" };

  const { data: rewrites } = await sbSchema("seo_optimizer").from("opportunity_rewrites")
    .select("id, change_summary")
    .eq("opportunity_id", opportunityId)
    .order("generated_at", { ascending: false }).limit(1);
  const rewrite = rewrites?.[0];
  if (!rewrite) return { status: "failed", reason: "no_rewrite" };

  const client = await getClient(opp.client_id as string);
  const clientName = client?.name ?? "(cliente)";
  const frontendUrl = Deno.env.get("ORBIT_FRONTEND_URL") ?? "https://orbit.example.com";
  const inboxUrl = `${frontendUrl.replace(/\/$/, "")}/seo-optimizer/inbox/${opportunityId}`;

  const slackPayload = buildWriterNotification({
    clientName,
    articleTitle: (opp.article_title as string) ?? "(sin título)",
    articleUrl: opp.article_url as string,
    category: opp.category as string,
    changeSummary: rewrite.change_summary as string,
    inboxUrl,
  });

  const targetChannel = client?.slackChannelId ?? Deno.env.get("SLACK_FALLBACK_CHANNEL") ?? "";
  if (!targetChannel) return { status: "skipped", reason: "no_channel" };

  const dedupe = `seo_optimizer:redactor:${opportunityId}:v1`;
  const { error: upErr } = await getSupabase().from("notifications_outbox").upsert({
    source: "seo_optimizer", target_type: "slack_channel",
    channel_id: targetChannel, payload: slackPayload, dedupe_key: dedupe, status: "pending",
  }, { onConflict: "dedupe_key" });
  if (upErr) return { status: "failed", reason: "outbox_error", error: upErr.message };

  await emitEvent({
    runId: opp.run_id as string, clientId: opp.client_id as string,
    eventSource: "dispatcher", eventType: "opportunity_dispatched",
    payload: { opportunity_id: opportunityId, recipient: "redactor" },
  });
  return { status: "ok" };
}
