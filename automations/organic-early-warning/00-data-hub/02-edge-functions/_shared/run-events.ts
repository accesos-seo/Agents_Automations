import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

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
  | "partition_created"
  | "rotation_executed";

export interface EmitEventParams {
  client: SupabaseClient;
  run_id: string;
  brand_id?: string | null;
  event_source: string;
  event_type: RunEventType;
  payload?: Record<string, unknown>;
  error_message?: string;
}

export async function emitEvent(params: EmitEventParams): Promise<void> {
  try {
    const { error } = await params.client.from("run_events").insert({
      run_id: params.run_id,
      brand_id: params.brand_id ?? null,
      event_source: params.event_source,
      event_type: params.event_type,
      occurred_at: new Date().toISOString(),
      payload: params.payload ?? null,
      error_message: params.error_message ?? null,
    });
    if (error) {
      console.error(`[run-events] insert failed: ${error.message}`, params);
    }
  } catch (err) {
    console.error(`[run-events] unexpected: ${String(err)}`, params);
  }
}
