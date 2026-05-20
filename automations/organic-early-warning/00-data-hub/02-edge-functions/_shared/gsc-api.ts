import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { ServiceAccountJson } from "./types.ts";

interface CachedToken {
  token: string;
  expiresAt: number;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

const tokenCache = new Map<string, CachedToken>();

function loadGscServiceAccount(): ServiceAccountJson {
  const raw = Deno.env.get("GSC_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("gsc_auth_failed: GSC_SERVICE_ACCOUNT_JSON not set");
  let parsed: ServiceAccountJson;
  try {
    parsed = JSON.parse(raw) as ServiceAccountJson;
  } catch {
    throw new Error("gsc_auth_failed: GSC_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("gsc_auth_failed: missing client_email or private_key");
  }
  return parsed;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function getGscClient(saJson?: ServiceAccountJson): Promise<string> {
  const sa = saJson ?? loadGscServiceAccount();
  const cacheKey = sa.client_email;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const key = await importPrivateKey(sa.private_key);
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: sa.client_email,
      scope: GSC_SCOPE,
      aud: TOKEN_URL,
      exp: getNumericDate(3000),
      iat: now,
    },
    key,
  );
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`gsc_auth_failed: token exchange ${res.status}: ${txt}`);
  }
  const json = await res.json() as { access_token: string; expires_in: number };
  tokenCache.set(cacheKey, { token: json.access_token, expiresAt: now + Math.min(json.expires_in, 3000) });
  return json.access_token;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface SearchAnalyticsRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsBody {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit?: number;
  startRow?: number;
  searchType?: string;
}

export async function searchAnalyticsQuery(
  token: string,
  siteUrl: string,
  body: SearchAnalyticsBody,
): Promise<SearchAnalyticsRow[]> {
  const rowLimit = body.rowLimit ?? 25000;
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const allRows: SearchAnalyticsRow[] = [];
  let startRow = body.startRow ?? 0;

  while (true) {
    const payload = JSON.stringify({ ...body, rowLimit, startRow });
    const maxAttempts = 3;
    let attempt = 0;
    let pageRows: SearchAnalyticsRow[] | null = null;
    let lastErr = "";

    while (attempt < maxAttempts) {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: payload,
      });
      if (res.ok) {
        const json = await res.json() as { rows?: SearchAnalyticsRow[] };
        pageRows = json.rows ?? [];
        break;
      }
      const status = res.status;
      const text = await res.text();
      lastErr = `${status}: ${text}`;
      if (status === 429 || status >= 500) {
        let waitMs = Math.pow(2, attempt) * 1000;
        const retryAfter = res.headers.get("Retry-After");
        if (status === 429 && retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!Number.isNaN(parsed) && parsed > 0) waitMs = parsed * 1000;
        }
        attempt++;
        if (attempt >= maxAttempts) break;
        await sleep(waitMs);
        continue;
      }
      if (status === 401 || status === 403) {
        throw new Error(`gsc_auth_failed: ${status}: ${text}`);
      }
      throw new Error(`gsc_query_failed (${status}): ${text}`);
    }

    if (pageRows === null) {
      if (lastErr.startsWith("429")) {
        throw new Error(`gsc_rate_limit_exhausted: ${lastErr}`);
      }
      throw new Error(`gsc_query_failed_after_retries: ${lastErr}`);
    }

    for (const r of pageRows) allRows.push(r);
    if (pageRows.length < rowLimit) break;
    startRow += rowLimit;
  }

  return allRows;
}

export interface UrlInspectionResult {
  inspectionResult?: {
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      lastCrawlTime?: string;
    };
    mobileUsabilityResult?: {
      verdict?: string;
    };
  };
}

export async function urlInspect(
  token: string,
  siteUrl: string,
  inspectionUrl: string,
): Promise<UrlInspectionResult> {
  const url = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr = "";

  while (attempt < maxAttempts) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inspectionUrl, siteUrl }),
    });
    if (res.ok) {
      return await res.json() as UrlInspectionResult;
    }
    const status = res.status;
    const text = await res.text();
    lastErr = `${status}: ${text}`;
    if (status === 429 || status >= 500) {
      const waitMs = Math.pow(2, attempt) * 1000;
      attempt++;
      if (attempt >= maxAttempts) break;
      await sleep(waitMs);
      continue;
    }
    if (status === 401 || status === 403) {
      throw new Error(`gsc_auth_failed: urlInspection ${status}: ${text}`);
    }
    throw new Error(`gsc_url_inspect_failed (${status}): ${text}`);
  }
  throw new Error(`gsc_url_inspect_failed_after_retries: ${lastErr}`);
}

// Coverage aproximada (POC): la API real "Index Coverage" no está publicada para
// service accounts. Esta implementación agrega los coverageState del muestreo de
// urlInspect y los mapea a los 4 buckets que persiste el schema:
//   '4xx' | '5xx' | 'soft_404' | 'blocked_by_robots'
// TODO: cuando Google publique el endpoint oficial, reemplazar por ese.
export interface CoverageAgg {
  error_type: "4xx" | "5xx" | "soft_404" | "blocked_by_robots";
  count: number;
  sample_urls: string[];
}

export function aggregateCoverageFromInspections(
  inspections: Array<{ url: string; result: UrlInspectionResult }>,
): CoverageAgg[] {
  const buckets: Record<string, { count: number; samples: string[] }> = {
    "4xx": { count: 0, samples: [] },
    "5xx": { count: 0, samples: [] },
    "soft_404": { count: 0, samples: [] },
    "blocked_by_robots": { count: 0, samples: [] },
  };

  for (const { url, result } of inspections) {
    const idx = result.inspectionResult?.indexStatusResult;
    if (!idx) continue;
    const cov = (idx.coverageState ?? "").toLowerCase();
    const robots = (idx.robotsTxtState ?? "").toLowerCase();
    let bucket: keyof typeof buckets | null = null;
    if (robots === "disallowed") bucket = "blocked_by_robots";
    else if (cov.includes("soft 404")) bucket = "soft_404";
    else if (cov.includes("not found") || cov.includes("404")) bucket = "4xx";
    else if (cov.includes("server error") || cov.includes("5xx")) bucket = "5xx";
    if (!bucket) continue;
    buckets[bucket].count += 1;
    if (buckets[bucket].samples.length < 10) buckets[bucket].samples.push(url);
  }

  return (Object.keys(buckets) as Array<keyof typeof buckets>).map((k) => ({
    error_type: k,
    count: buckets[k].count,
    sample_urls: buckets[k].samples,
  }));
}
