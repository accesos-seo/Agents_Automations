// _shared/run-events.ts
// Helper para emitir eventos a seo_optimizer.run_events.
// Falla en silencio (log a console) para no romper el pipeline.

import { sbSchema } from "./supabase.ts";

export type EventType =
  | "run_started" | "run_completed" | "run_failed"
  | "agent_started" | "agent_completed" | "agent_failed"
  | "opportunity_detected" | "opportunity_dispatched"
  | "approval_received" | "rewrite_generated" | "implementation_marked"
  | "reeval_completed" | "warning";

export interface EmitEventArgs {
  runId: string;
  eventSource: string;
  eventType: EventType;
  clientId?: string | null;
  payload?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

export async function emitEvent(args: EmitEventArgs): Promise<void> {
  const row = {
    run_id: args.runId,
    client_id: args.clientId ?? null,
    event_source: args.eventSource,
    event_type: args.eventType,
    payload: args.payload ?? {},
    error_message: args.errorMessage ?? null,
  };
  try {
    const { error } = await sbSchema("seo_optimizer").from("run_events").insert(row);
    if (error) console.warn("[run-events] insert failed:", error.message);
  } catch (err) {
    console.warn("[run-events] exception:", err);
  }
  // Mirror to stdout (Supabase captures Edge Function logs)
  console.log(JSON.stringify({ kind: "run_event", ...row }));
}
