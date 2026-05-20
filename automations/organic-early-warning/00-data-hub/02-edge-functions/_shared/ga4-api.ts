import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { ServiceAccountJson } from "./types.ts";

interface CachedToken {
  token: string;
  expiresAt: number;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

const tokenCache = new Map<string, CachedToken>();

function loadGa4ServiceAccount(): ServiceAccountJson {
  const raw = Deno.env.get("GA4_SERVICE_ACCOUNT_JSON") ?? Deno.env.get("GSC_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("ga4_auth_failed: GA4_SERVICE_ACCOUNT_JSON / GSC_SERVICE_ACCOUNT_JSON not set");
  let parsed: ServiceAccountJson;
  try {
    parsed = JSON.parse(raw) as ServiceAccountJson;
  } catch {
    throw new Error("ga4_auth_failed: service account JSON is not valid JSON");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("ga4_auth_failed: missing client_email or private_key");
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

export async function getGa4Client(saJson?: ServiceAccountJson): Promise<string> {
  const sa = saJson ?? loadGa4ServiceAccount();
  const cacheKey = sa.client_email;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const key = await importPrivateKey(sa.private_key);
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: sa.client_email,
      scope: GA4_SCOPE,
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
    throw new Error(`ga4_auth_failed: token exchange ${res.status}: ${txt}`);
  }
  const json = await res.json() as { access_token: string; expires_in: number };
  tokenCache.set(cacheKey, { token: json.access_token, expiresAt: now + Math.min(json.expires_in, 3000) });
  return json.access_token;
}

export interface Ga4ReportBody {
  dateRanges: Array<{ startDate: string; endDate: string }>;
  dimensions: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  dimensionFilter?: unknown;
  limit?: number;
  offset?: number;
}

export interface Ga4ReportRow {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

export interface Ga4ReportResponse {
  rows?: Ga4ReportRow[];
  rowCount?: number;
}

export async function runReport(
  token: string,
  propertyId: string,
  body: Ga4ReportBody,
): Promise<Ga4ReportRow[]> {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const allRows: Ga4ReportRow[] = [];
  const limit = body.limit ?? 100000;
  let offset = body.offset ?? 0;

  while (true) {
    const payload = JSON.stringify({ ...body, limit, offset });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: payload,
    });
    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new Error(`ga4_auth_failed: ${res.status}: ${txt}`);
      }
      throw new Error(`ga4_query_failed (${res.status}): ${txt}`);
    }
    const json = await res.json() as Ga4ReportResponse;
    const rows = json.rows ?? [];
    for (const r of rows) allRows.push(r);
    if (rows.length < limit) break;
    offset += limit;
  }
  return allRows;
}
