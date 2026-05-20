"""FastAPI entrypoint for seo-optimizer.

All 8 agent endpoints + health check are mounted here. Each handler lives
in its own module under 02-agents/<agent>/handler.py.

Auth model: every endpoint (except /health) requires header
`x-internal-secret` matching env SEO_OPTIMIZER_INTERNAL_SECRET. The
verification happens in shared/secret.py via FastAPI dependency.

Deployed on Railway. Triggered by:
  - pg_cron (Light_House) for scheduled runs (monthly, daily reeval, watchdog, outbox)
  - DB trigger on opportunities.status='approved' for /writer
  - Frontend (when built) for manual operations
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, HTTPException

# Configure structured logging early
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(message)s",
)
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.dict_tracebacks,
        structlog.processors.JSONRenderer(),
    ],
)
log = structlog.get_logger()


# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(_app: FastAPI):  # noqa: D401
    """Validate critical env vars at boot — fail fast."""
    required = [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SEO_OPTIMIZER_INTERNAL_SECRET",
        "OPENROUTER_API_KEY",
    ]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        log.error("startup_missing_env", missing=missing)
        # Don't crash — let /health report it. Railway will see unhealthy and restart.
    else:
        log.info("startup_ok", required_env_present=len(required))
    yield
    log.info("shutdown")


app = FastAPI(
    title="seo-optimizer",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None,        # disable Swagger in prod for a tiny security gain
    redoc_url=None,
    openapi_url=None,
)


# ---------------------------------------------------------------------------
# Health check (NO auth — used by Railway healthcheck and external monitors)
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    required = [
        "SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SEO_OPTIMIZER_INTERNAL_SECRET",
        "OPENROUTER_API_KEY",
        "SLACK_BOT_TOKEN",
        "GSC_SERVICE_ACCOUNT_JSON",
    ]
    missing = [k for k in required if not os.environ.get(k)]
    return {
        "status": "ok" if not missing else "degraded",
        "version": app.version,
        "missing_env": missing,
    }


# ---------------------------------------------------------------------------
# Agent endpoints — mounted lazily to give clearer error if a module fails import
# ---------------------------------------------------------------------------
def _mount(path: str, module_path: str, function_name: str = "handle") -> None:
    """Mount a POST endpoint backed by <module_path>.<function_name>.

    All handlers expect a single dict payload and return a dict.
    Auth is enforced inside the handler (via shared/secret.verify).
    """
    try:
        module = __import__(module_path, fromlist=[function_name])
        handler = getattr(module, function_name)
    except Exception as exc:  # noqa: BLE001
        log.error("mount_failed", path=path, module=module_path, error=str(exc))

        async def _failed_handler(payload: dict | None = None):  # noqa: ARG001
            raise HTTPException(
                status_code=503,
                detail=f"Handler {module_path} failed to load: {exc}",
            )

        app.post(path)(_failed_handler)
        return

    app.post(path)(handler)
    log.info("mounted", path=path, module=module_path)


# Order matters only for log readability; FastAPI doesn't care.
_mount("/orchestrator",    "orchestrator.handler")
_mount("/gsc_ingestor",    "gsc_ingestor.handler")
_mount("/article_ingestor","article_ingestor.handler")
_mount("/analyst",         "analyst.handler")
_mount("/writer",          "writer.handler")
_mount("/dispatcher",      "dispatcher.handler")
_mount("/outbox_worker",   "outbox_worker.handler")
_mount("/reeval",          "reeval.handler")
_mount("/reeval/batch",    "reeval.handler", function_name="handle_batch")
