"""Google Search Console API wrapper.

Authenticates with a Service Account stored in env var GSC_SERVICE_ACCOUNT_JSON
(the full JSON content of the SA key file as a single string).

Each client (brand) has its own GSC property URL. The SA must be added as a
user with "Full" permission in each property's Search Console settings.

Key method: `query_search_analytics(...)` returns rows of (URL, query, country,
device, clicks, impressions, ctr, position) for a date range.

API limits: 1200 query/min, 30000/day per property. We respect these via
exponential backoff and inter-call sleeps.
"""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import date

import structlog
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from tenacity import (
    retry, retry_if_exception_type, stop_after_attempt, wait_exponential,
)


log = structlog.get_logger()

GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
ROW_LIMIT = 25000   # GSC max per request
INTER_REQUEST_SLEEP_MS = 250


# --- silence noisy google libraries
logging.getLogger("googleapiclient.discovery_cache").setLevel(logging.ERROR)


@dataclass
class GscRow:
    url: str
    query: str
    country: str | None
    device: str | None
    clicks: int
    impressions: int
    ctr: float
    position: float


def _client():
    """Build and return the GSC API client (memoized per process)."""
    if hasattr(_client, "_cached"):
        return _client._cached  # type: ignore[attr-defined]

    raw = os.environ.get("GSC_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise RuntimeError("GSC_SERVICE_ACCOUNT_JSON not set in environment")
    try:
        sa_info = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"GSC_SERVICE_ACCOUNT_JSON is not valid JSON: {exc}") from exc

    creds = service_account.Credentials.from_service_account_info(
        sa_info, scopes=[GSC_SCOPE],
    )
    service = build("searchconsole", "v1", credentials=creds, cache_discovery=False)
    _client._cached = service  # type: ignore[attr-defined]
    return service


@retry(
    retry=retry_if_exception_type(HttpError),
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=16),
    reraise=True,
)
def _execute_query(service, site_url: str, body: dict) -> dict:
    """Execute a single GSC searchanalytics.query with retry."""
    return service.searchanalytics().query(siteUrl=site_url, body=body).execute()


def query_search_analytics(
    *,
    site_url: str,
    start_date: date,
    end_date: date,
    dimensions: list[str] | None = None,
    row_limit: int = ROW_LIMIT,
) -> list[GscRow]:
    """Fetch GSC data for a site within a date range.

    Default dimensions: ['page', 'query'] (aggregated over date, country, device).
    For per-country/device breakdown, pass dimensions=['page','query','country','device'].

    Returns list of GscRow. Paginates automatically if results exceed row_limit.
    """
    service = _client()
    dimensions = dimensions or ["page", "query"]
    start = start_date.isoformat()
    end = end_date.isoformat()

    rows: list[GscRow] = []
    start_row = 0
    while True:
        body = {
            "startDate": start,
            "endDate": end,
            "dimensions": dimensions,
            "rowLimit": row_limit,
            "startRow": start_row,
        }
        log.info("gsc_query", site=site_url, start=start, end=end, start_row=start_row)
        try:
            resp = _execute_query(service, site_url, body)
        except HttpError as exc:
            log.error("gsc_query_failed", site=site_url, status=exc.resp.status, error=str(exc))
            raise

        for r in resp.get("rows", []):
            keys = r["keys"]
            # Order of dimensions in 'keys' matches dimensions parameter
            kmap = dict(zip(dimensions, keys))
            rows.append(GscRow(
                url=kmap.get("page", ""),
                query=kmap.get("query", ""),
                country=kmap.get("country"),
                device=kmap.get("device"),
                clicks=int(r.get("clicks", 0)),
                impressions=int(r.get("impressions", 0)),
                ctr=float(r.get("ctr", 0.0)),
                position=float(r.get("position", 0.0)),
            ))

        # If we got fewer than the row_limit, we've reached the end
        page_size = len(resp.get("rows", []))
        if page_size < row_limit:
            break
        start_row += row_limit
        time.sleep(INTER_REQUEST_SLEEP_MS / 1000.0)

    log.info("gsc_query_done", site=site_url, total_rows=len(rows))
    return rows


def query_url_metrics(
    *,
    site_url: str,
    url_filter: str,
    start_date: date,
    end_date: date,
) -> list[GscRow]:
    """Fetch GSC data for a SPECIFIC URL within a date range.

    Used by /reeval to measure post-implementation impact.
    """
    service = _client()
    body = {
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "dimensions": ["query"],
        "dimensionFilterGroups": [{
            "filters": [{"dimension": "page", "operator": "equals", "expression": url_filter}],
        }],
        "rowLimit": ROW_LIMIT,
    }
    resp = _execute_query(service, site_url, body)
    rows: list[GscRow] = []
    for r in resp.get("rows", []):
        rows.append(GscRow(
            url=url_filter,
            query=r["keys"][0],
            country=None,
            device=None,
            clicks=int(r.get("clicks", 0)),
            impressions=int(r.get("impressions", 0)),
            ctr=float(r.get("ctr", 0.0)),
            position=float(r.get("position", 0.0)),
        ))
    return rows
