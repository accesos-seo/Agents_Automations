import { supabase } from "./supabase.ts";

export type RunEventType =
  | "agent_started"
  | "agent_completed"
  | "agent_failed"
  | "anomaly_detected"
  | "alert_enqueued"
  | "alert_sent";

export interface RunEventInput {
  run_id: string;
  brand_id?: string | null;
  event_source: string;
  event_type: RunEventType;
  payload?: Record<string, unknown>;
  error_message?: string;
}

export async function emitEvent(input: RunEventInput): Promise<void> {
  try {
    const { error } = await supabase.from("run_events").insert({
      run_id: input.run_id,
      brand_id: input.brand_id ?? null,
      event_source: input.event_source,
      event_type: input.event_type,
      occurred_at: new Date().toISOString(),
      payload: input.payload ?? null,
      error_message: input.error_message ?? null,
    });
    if (error) {
      console.error(`[run-events] insert failed: ${error.message}`, input);
    }
  } catch (err) {
    // Fire-and-forget: nunca lanzamos desde aca para no romper el agente que emite
    console.error(`[run-events] unexpected: ${String(err)}`, input);
  }
}
