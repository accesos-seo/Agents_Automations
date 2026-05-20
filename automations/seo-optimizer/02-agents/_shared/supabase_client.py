"""Supabase client singleton, using SERVICE_ROLE_KEY (bypasses RLS).

ALL writes from agents go through this client. Reads should also use this
to avoid auth confusion; the frontend will use its own client.

Usage:

    from _shared.supabase_client import sb

    rows = sb.table("opportunities").select("*").eq("status", "pending").execute()
    sb.schema("seo_optimizer").table("runs").insert({...}).execute()
"""
from __future__ import annotations

import os

from supabase import Client, create_client


_client: Client | None = None


def get_client() -> Client:
    """Lazy-init singleton."""
    global _client
    if _client is None:
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
            )
        _client = create_client(url, key)
    return _client


# Convenience export — pre-built singleton accessor
class _SBProxy:
    """Proxy that defers client creation until first attribute access."""

    def __getattr__(self, name: str):
        return getattr(get_client(), name)


sb = _SBProxy()
