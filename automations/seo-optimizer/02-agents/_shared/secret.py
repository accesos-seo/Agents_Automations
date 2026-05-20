"""Internal-secret verification.

Every agent endpoint verifies the `x-internal-secret` header against the env var
`SEO_OPTIMIZER_INTERNAL_SECRET`. pg_cron and DB triggers include this header;
direct external POSTs are rejected.

Usage (in a handler):

    from fastapi import Header, HTTPException
    from _shared.secret import verify

    async def handle(payload: dict, x_internal_secret: str | None = Header(default=None)):
        verify(x_internal_secret)
        ...
"""
from __future__ import annotations

import hmac
import os

from fastapi import HTTPException


_EXPECTED: str | None = None


def _expected() -> str:
    global _EXPECTED
    if _EXPECTED is None:
        val = os.environ.get("SEO_OPTIMIZER_INTERNAL_SECRET")
        if not val:
            # Don't raise at import time — would crash the whole app.
            # Raise at first call so /health can still report degraded.
            raise HTTPException(
                status_code=500,
                detail="SEO_OPTIMIZER_INTERNAL_SECRET not set in environment",
            )
        _EXPECTED = val
    return _EXPECTED


def verify(header_value: str | None) -> None:
    """Raise 401 if header doesn't match expected secret. Constant-time compare."""
    if not header_value:
        raise HTTPException(status_code=401, detail="missing x-internal-secret header")
    expected = _expected()
    if not hmac.compare_digest(header_value, expected):
        raise HTTPException(status_code=401, detail="invalid x-internal-secret")
