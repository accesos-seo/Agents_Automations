import { CwvMetrics } from "./types.ts";

export type CwvDevice = "mobile" | "desktop" | "tablet";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface CruxMetric {
  percentiles?: { p75?: number | string };
  histogram?: Array<{ start?: number; end?: number; density?: number }>;
}

interface CruxRecord {
  record?: {
    metrics?: Record<string, CruxMetric>;
    collectionPeriod?: { firstDate?: unknown; lastDate?: unknown };
  };
  urlNormalizationDetails?: unknown;
}

function cruxFormFactor(device: CwvDevice): string {
  if (device === "desktop") return "DESKTOP";
  if (device === "tablet") return "TABLET";
  return "PHONE";
}

function readP75(metric: CruxMetric | undefined): number | null {
  if (!metric || metric.percentiles?.p75 === undefined) return null;
  const v = metric.percentiles.p75;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

export async function getCrux(
  url: string,
  device: CwvDevice,
  apiKey: string,
): Promise<CwvMetrics | null> {
  const endpoint = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(apiKey)}`;
  const body = JSON.stringify({ url, formFactor: cruxFormFactor(device) });
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr = "";

  while (attempt < maxAttempts) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.status === 404) return null;
    if (res.ok) {
      const json = await res.json() as CruxRecord;
      const metrics = json.record?.metrics ?? {};
      return {
        source: "crux",
        lcp_p75_ms: readP75(metrics["largest_contentful_paint"]) ?? null,
        inp_p75_ms: readP75(metrics["interaction_to_next_paint"]) ?? null,
        cls_p75: readP75(metrics["cumulative_layout_shift"]),
        fcp_p75_ms: readP75(metrics["first_contentful_paint"]) ?? null,
        ttfb_p75_ms: readP75(metrics["experimental_time_to_first_byte"]) ?? null,
        sample_size: null,
      };
    }
    const status = res.status;
    const text = await res.text();
    lastErr = `${status}: ${text}`;
    if (status === 429 || status >= 500) {
      await sleep(Math.pow(2, attempt) * 1000);
      attempt++;
      continue;
    }
    throw new Error(`crux_api_failed (${status}): ${text}`);
  }
  throw new Error(`crux_api_failed after retries: ${lastErr}`);
}

interface PsiAudits {
  [key: string]: {
    id?: string;
    numericValue?: number;
    score?: number | null;
  };
}

interface PsiResponse {
  lighthouseResult?: {
    audits?: PsiAudits;
  };
}

export async function getPsiLab(
  url: string,
  device: CwvDevice,
  apiKey: string,
): Promise<CwvMetrics> {
  const strategy = device === "desktop" ? "desktop" : "mobile";
  const endpoint =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?` +
    `url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance&key=${encodeURIComponent(apiKey)}`;

  const maxAttempts = 3;
  let attempt = 0;
  let lastErr = "";

  while (attempt < maxAttempts) {
    const res = await fetch(endpoint);
    if (res.ok) {
      const json = await res.json() as PsiResponse;
      const audits = json.lighthouseResult?.audits ?? {};
      const num = (k: string): number | null => {
        const v = audits[k]?.numericValue;
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      };
      return {
        source: "psi_lab",
        lcp_p75_ms: num("largest-contentful-paint"),
        inp_p75_ms: num("interaction-to-next-paint") ?? num("max-potential-fid"),
        cls_p75: num("cumulative-layout-shift"),
        fcp_p75_ms: num("first-contentful-paint"),
        ttfb_p75_ms: num("server-response-time"),
        sample_size: null,
      };
    }
    const status = res.status;
    const text = await res.text();
    lastErr = `${status}: ${text}`;
    if (status === 429) throw new Error(`psi_quota_exhausted: ${text}`);
    if (status >= 500) {
      await sleep(Math.pow(2, attempt) * 1000);
      attempt++;
      continue;
    }
    throw new Error(`psi_failed (${status}): ${text}`);
  }
  throw new Error(`psi_failed after retries: ${lastErr}`);
}

export async function getCwvMetrics(
  url: string,
  device: CwvDevice,
  cruxKey: string | null,
  psiKey: string,
): Promise<CwvMetrics> {
  if (cruxKey) {
    try {
      const c = await getCrux(url, device, cruxKey);
      if (c) return c;
    } catch (err) {
      console.warn(`[cwv] crux failed for ${url} (${device}): ${String(err)}; falling back to PSI`);
    }
  }
  return await getPsiLab(url, device, psiKey);
}
