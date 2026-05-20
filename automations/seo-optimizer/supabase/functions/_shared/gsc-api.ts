// _shared/gsc-api.ts
// Google Search Console wrapper. Usa Service Account + JWT manual para auth
// (Deno-friendly, sin depender de googleapis Node lib).

import { create as djwtCreate, Header as DjwtHeader, Payload as DjwtPayload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GSC_API = "https://www.googleapis.com/webmasters/v3/sites";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ROW_LIMIT = 25000;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface AccessToken {
  token: string;
  expiresAt: number;   // unix seconds
}

let _accessToken: AccessToken | null = null;

function getServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("GSC_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GSC_SERVICE_ACCOUNT_JSON not set");
  return JSON.parse(raw) as ServiceAccount;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // PEM → ArrayBuffer
  const pemClean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binaryDer = Uint8Array.from(atob(pemClean), c => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (_accessToken && _accessToken.expiresAt > now + 60) {
    return _accessToken.token;
  }

  const sa = getServiceAccount();
  const key = await importPrivateKey(sa.private_key);

  const header: DjwtHeader = { alg: "RS256", typ: "JWT" };
  const payload: DjwtPayload = {
    iss: sa.client_email,
    scope: GSC_SCOPE,
    aud: sa.token_uri ?? TOKEN_ENDPOINT,
    exp: now + 3600,
    iat: now,
  };
  const jwt = await djwtCreate(header, payload, key);

  const resp = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GSC token endpoint ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  _accessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600),
  };
  return _accessToken.token;
}

export interface GscRow {
  url: string;
  query: string;
  country: string | null;
  device: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  // attached by analyst when loaded from DB
  clicks_prev?: number;
  impressions_prev?: number;
  ctr_prev?: number;
  position_prev?: number;
}

interface QueryArgs {
  siteUrl: string;
  startDate: string;    // YYYY-MM-DD
  endDate: string;
  dimensions?: string[];
  urlFilter?: string;
}

async function executeQuery(siteUrl: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = await getAccessToken();
  const url = `${GSC_API}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  // Simple exponential retry on 429/5xx
  for (let attempt = 1; attempt <= 5; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (resp.ok) return await resp.json();
    if (resp.status === 429 || resp.status >= 500) {
      const backoff = Math.min(2 ** attempt * 1000, 16000);
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }
    const text = await resp.text();
    throw new Error(`GSC query ${resp.status}: ${text}`);
  }
  throw new Error("GSC query: exhausted retries");
}

export async function querySearchAnalytics(args: QueryArgs): Promise<GscRow[]> {
  const dimensions = args.dimensions ?? ["page", "query"];
  const rows: GscRow[] = [];
  let startRow = 0;
  while (true) {
    const body: Record<string, unknown> = {
      startDate: args.startDate,
      endDate: args.endDate,
      dimensions,
      rowLimit: ROW_LIMIT,
      startRow,
    };
    if (args.urlFilter) {
      body.dimensionFilterGroups = [{
        filters: [{ dimension: "page", operator: "equals", expression: args.urlFilter }],
      }];
    }
    const resp = await executeQuery(args.siteUrl, body);
    const pageRows = (resp.rows ?? []) as Array<{ keys: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }>;
    for (const r of pageRows) {
      const kmap: Record<string, string> = {};
      for (let i = 0; i < dimensions.length; i++) kmap[dimensions[i]] = r.keys[i];
      rows.push({
        url: kmap.page ?? args.urlFilter ?? "",
        query: kmap.query ?? "",
        country: kmap.country ?? null,
        device: kmap.device ?? null,
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
        ctr: r.ctr ?? 0,
        position: r.position ?? 0,
      });
    }
    if (pageRows.length < ROW_LIMIT) break;
    startRow += ROW_LIMIT;
    await new Promise(r => setTimeout(r, 250));   // rate-limit gentle
  }
  return rows;
}

export async function queryUrlMetrics(args: {
  siteUrl: string; urlFilter: string; startDate: string; endDate: string;
}): Promise<GscRow[]> {
  return await querySearchAnalytics({
    siteUrl: args.siteUrl,
    startDate: args.startDate,
    endDate: args.endDate,
    dimensions: ["query"],
    urlFilter: args.urlFilter,
  });
}
