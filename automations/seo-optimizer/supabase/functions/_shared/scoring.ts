// _shared/scoring.ts
// Funciones puras de scoring (sin DB, sin LLM, sin I/O).

export type Confidence = "high" | "medium" | "low";
export type Effort = "low" | "medium" | "high";

const CTR_CURVE: Record<number, number> = {
  1: 0.40, 2: 0.20, 3: 0.13, 4: 0.09, 5: 0.07,
  6: 0.05, 7: 0.04, 8: 0.03, 9: 0.025, 10: 0.02,
};

export function ctrBenchmarkForPosition(position: number): number {
  if (position <= 1) return CTR_CURVE[1];
  if (position >= 11) {
    if (position >= 30) return 0.001;
    return 0.01 - ((position - 11) / 19) * (0.01 - 0.001);
  }
  const low = Math.floor(position);
  const high = low + 1;
  if (high > 10) return CTR_CURVE[10];
  const frac = position - low;
  return CTR_CURVE[low] * (1 - frac) + CTR_CURVE[high] * frac;
}

export function trafficPotentialClicks(args: {
  impressionsMonthly: number;
  currentPosition: number;
  targetPosition: number;
}): number {
  const cur = ctrBenchmarkForPosition(args.currentPosition);
  const tgt = ctrBenchmarkForPosition(args.targetPosition);
  const delta = Math.max(0, tgt - cur);
  return args.impressionsMonthly * delta;
}

export function trafficPotentialFromLowCtr(args: {
  impressionsMonthly: number;
  actualCtr: number;
  position: number;
}): number {
  const expected = ctrBenchmarkForPosition(args.position);
  const delta = Math.max(0, expected - args.actualCtr);
  return args.impressionsMonthly * delta;
}

const CONFIDENCE_WEIGHT: Record<Confidence, number> = { high: 1.0, medium: 0.7, low: 0.4 };
const EFFORT_DISCOUNT: Record<Effort, number> = { low: 1.0, medium: 0.7, high: 0.4 };

export function finalScore(args: {
  trafficPotential: number;
  confidence: Confidence;
  effort: Effort;
}): number {
  return args.trafficPotential
    * CONFIDENCE_WEIGHT[args.confidence]
    * EFFORT_DISCOUNT[args.effort];
}

export async function makeDedupeKey(args: {
  clientId: string;
  contentItemId: string | null;
  category: string;
  evidenceSignature: string;
}): Promise<string> {
  const data = new TextEncoder().encode(args.evidenceSignature);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  const ci = args.contentItemId ?? "null";
  return `${args.clientId}:${ci}:${args.category}:${hashHex}`;
}
