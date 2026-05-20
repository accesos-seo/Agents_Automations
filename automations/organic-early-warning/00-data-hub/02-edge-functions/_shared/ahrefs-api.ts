// Ahrefs API v3 wrapper. Credit costs are approximated per endpoint based on
// Ahrefs' public docs (Domain Rating ~1, refdomains_new_lost ~10, backlinks
// broken ~10, serp_overview ~5). The exact billing comes back in response
// headers (`X-Ahrefs-Credits-Cost`) — we read that when present and fall back
// to these estimates otherwise.

const BASE_URL = "https://api.ahrefs.com/v3";

interface AhrefsCall<T> {
  data: T;
  creditsUsed: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function ahrefsFetch<T>(
  path: string,
  token: string,
  estCredits: number,
): Promise<AhrefsCall<T>> {
  const url = `${BASE_URL}${path}`;
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr = "";

  while (attempt < maxAttempts) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (res.ok) {
      const json = await res.json() as T;
      const header = res.headers.get("X-Ahrefs-Credits-Cost");
      const cost = header ? parseInt(header, 10) : NaN;
      return { data: json, creditsUsed: Number.isFinite(cost) ? cost : estCredits };
    }
    const status = res.status;
    const text = await res.text();
    lastErr = `${status}: ${text}`;
    if (status === 401 || status === 403) {
      throw new Error(`ahrefs_auth_failed: ${status}: ${text}`);
    }
    if (status === 429 || status >= 500) {
      await sleep(Math.pow(2, attempt) * 1000);
      attempt++;
      continue;
    }
    throw new Error(`ahrefs_query_failed (${status}): ${text}`);
  }
  if (lastErr.startsWith("429")) {
    throw new Error(`ahrefs_rate_limit: ${lastErr}`);
  }
  throw new Error(`ahrefs_query_failed_after_retries: ${lastErr}`);
}

export interface DomainOverview {
  domain_rating?: number;
  refdomains?: number;
  backlinks?: number;
}

export interface DomainOverviewResponse {
  domain?: DomainOverview;
}

export async function getDomainOverview(
  token: string,
  domain: string,
): Promise<AhrefsCall<DomainOverviewResponse>> {
  const path =
    `/site-explorer/domain-rating?target=${encodeURIComponent(domain)}&mode=domain&output=json`;
  return await ahrefsFetch<DomainOverviewResponse>(path, token, 1);
}

export interface RefdomainsNewLost {
  new_refdomains?: number;
  lost_refdomains?: number;
}

export interface RefdomainsNewLostResponse {
  refdomains?: RefdomainsNewLost;
}

export async function getRefdomainsNewLost(
  token: string,
  domain: string,
  dateFrom: string,
  dateTo: string,
): Promise<AhrefsCall<RefdomainsNewLostResponse>> {
  const path = `/site-explorer/refdomains-new-lost?target=${encodeURIComponent(domain)}` +
    `&mode=domain&date_from=${dateFrom}&date_to=${dateTo}&output=json`;
  return await ahrefsFetch<RefdomainsNewLostResponse>(path, token, 10);
}

export interface BacklinksBrokenResponse {
  broken_backlinks?: number;
  payload?: unknown;
}

export async function getBacklinksBroken(
  token: string,
  domain: string,
): Promise<AhrefsCall<BacklinksBrokenResponse>> {
  const path =
    `/site-explorer/backlinks-broken?target=${encodeURIComponent(domain)}&mode=domain&limit=100&output=json`;
  return await ahrefsFetch<BacklinksBrokenResponse>(path, token, 10);
}

export interface SerpOverviewItem {
  position?: number;
  url?: string;
  domain?: string;
}
export interface SerpOverviewResponse {
  positions?: SerpOverviewItem[];
  search_volume?: number;
}

export async function getSerpOverview(
  token: string,
  keyword: string,
  country: string,
): Promise<AhrefsCall<SerpOverviewResponse>> {
  const path = `/rank-tracker/serp-overview?keyword=${encodeURIComponent(keyword)}` +
    `&country=${encodeURIComponent(country)}&output=json`;
  return await ahrefsFetch<SerpOverviewResponse>(path, token, 5);
}

export interface ToxicLinkRow {
  url_from?: string;
  domain_from?: string;
  toxic_score?: number;
  anchor?: string;
}
export interface ToxicLinksResponse {
  toxic_links?: ToxicLinkRow[];
}

export async function getToxicLinks(
  token: string,
  domain: string,
): Promise<AhrefsCall<ToxicLinksResponse>> {
  const path = `/site-explorer/backlinks?target=${encodeURIComponent(domain)}` +
    `&mode=domain&toxicity=high&limit=200&output=json`;
  return await ahrefsFetch<ToxicLinksResponse>(path, token, 20);
}

export class CreditTracker {
  private total = 0;
  consume(call: { creditsUsed: number }): void {
    this.total += call.creditsUsed;
  }
  get used(): number {
    return this.total;
  }
}
