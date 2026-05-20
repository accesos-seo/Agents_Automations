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

const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("GA4_SERVICE_ACCOUNT_JSON") ?? Deno.env.get("GSC_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GA4_SERVICE_ACCOUNT_JSON or GSC_SERVICE_ACCOUNT_JSON not set");
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GA4 service account JSON missing client_email or private_key");
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

export async function getAccessTokenGA4(): Promise<string> {
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
      scope: GA4_SCOPE,
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
    throw new Error(`GA4 token exchange failed (${res.status}): ${txt}`);
  }
  const json = await res.json() as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, expiresAt: now + json.expires_in };
  return json.access_token;
}

export interface GA4Record {
  date: string;
  sessions: number;
  users: number;
  conversions: number;
}

interface RunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

function formatGA4Date(yyyymmdd: string): string {
  if (yyyymmdd.length === 8 && !yyyymmdd.includes("-")) {
    return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
  }
  return yyyymmdd;
}

export async function runReport(
  propertyId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ records: GA4Record[] }> {
  const token = await getAccessTokenGA4();
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
    dimensions: [{ name: "date" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "conversions" },
    ],
    dimensionFilter: {
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: "Organic Search" },
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GA4 runReport failed (${res.status}): ${txt}`);
  }
  const json = await res.json() as RunReportResponse;
  const records: GA4Record[] = (json.rows ?? []).map((row) => {
    const rawDate = row.dimensionValues?.[0]?.value ?? "";
    return {
      date: formatGA4Date(rawDate),
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
      users: Number(row.metricValues?.[1]?.value ?? 0),
      conversions: Number(row.metricValues?.[2]?.value ?? 0),
    };
  });
  return { records };
}
