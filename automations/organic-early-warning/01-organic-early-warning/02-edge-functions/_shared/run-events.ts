import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RunEventType =
  | "run_started"
  | "run_completed"
  | "run_failed"
  | "agent_started"
  | "agent_completed"
  | "agent_failed"
  | "anomaly_detected"
  | "diagnosis_saved"
  | "alert_enqueued"
  | "alert_sent"
  | "alert_failed"
  | "watchdog_triggered"
  | "warning"
  | "baseline_recomputed"
  | "incident_clustered";

export interface EmitEventInput {
  client: SupabaseClient;
  run_id: string;
  brand_id?: string | null;
  event_source: string;
  event_type: RunEventType;
  payload?: Record<string, unknown>;
  error_message?: string;
}

export async function emitEvent(input: EmitEventInput): Promise<void> {
  try {
    const { error } = await input.client.from("run_events").insert({
      run_id: input.run_id,
      brand_id: input.brand_id ?? null,
      event_source: input.event_source,
      event_type: input.event_type,
      occurred_at: new Date().toISOString(),
      payload: input.payload ?? null,
      error_message: input.error_message ?? null,
    });
    if (error) {
      console.error(`[run-events] insert failed: ${error.message}`, {
        run_id: input.run_id,
        event_type: input.event_type,
      });
    }
  } catch (err) {
    console.error(`[run-events] unexpected: ${String(err)}`);
  }
}
