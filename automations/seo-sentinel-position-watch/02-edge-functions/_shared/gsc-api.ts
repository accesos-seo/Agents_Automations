import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("GSC_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GSC_SERVICE_ACCOUNT_JSON not set");
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GSC_SERVICE_ACCOUNT_JSON missing client_email or private_key");
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

export async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.expiresAt > now + 60) {
    return tokenCache.token;
  }
  const sa = loadServiceAccount();
  const key = await importPrivateKey(sa.private_key);
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: sa.client_email,
      scope: GSC_SCOPE,
      aud: TOKEN_URL,
      exp: getNumericDate(3600),
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
    throw new Error(`GSC token exchange failed (${res.status}): ${txt}`);
  }
  const json = await res.json() as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

interface SearchAnalyticsRow {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchAnalyticsResponse {
  rows: SearchAnalyticsRow[];
  totalRows?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function querySearchAnalytics(
  propertyUrl: string,
  dimensions: string[],
  dateFrom: string,
  dateTo: string,
  startRow = 0,
  rowLimit = 25000,
): Promise<{ rows: SearchAnalyticsRow[]; totalRows: number }> {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`;
  const body = JSON.stringify({
    startDate: dateFrom,
    endDate: dateTo,
    dimensions,
    rowLimit,
    startRow,
  });

  const maxAttempts = 3;
  let attempt = 0;
  let lastError = "";

  while (attempt < maxAttempts) {
    const token = await getAccessToken();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    });

    if (res.ok) {
      const json = await res.json() as SearchAnalyticsResponse;
      const rows = json.rows ?? [];
      return { rows, totalRows: json.totalRows ?? rows.length };
    }

    const status = res.status;
    const text = await res.text();
    lastError = `${status}: ${text}`;

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

    throw new Error(`GSC query failed (${status}): ${text}`);
  }

  throw new Error(`GSC query failed after ${maxAttempts} retries: ${lastError}`);
}

export async function* paginateAll(
  propertyUrl: string,
  dimensions: string[],
  dateFrom: string,
  dateTo: string,
  rowLimit = 25000,
): AsyncGenerator<SearchAnalyticsRow> {
  let startRow = 0;
  while (true) {
    const { rows } = await querySearchAnalytics(propertyUrl, dimensions, dateFrom, dateTo, startRow, rowLimit);
    if (rows.length === 0) return;
    for (const row of rows) yield row;
    if (rows.length < rowLimit) return;
    startRow += rowLimit;
  }
}
