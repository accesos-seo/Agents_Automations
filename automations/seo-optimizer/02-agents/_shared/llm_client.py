"""LLM client wrapper around Anthropic SDK (via OpenRouter).

Uses prompt caching for system prompts (Anthropic feature, supported by
OpenRouter passthrough). This is critical for cost — analyst + writer
share large system prompts that we want cached.

The model is chosen via env SEO_OPTIMIZER_MODEL (default:
anthropic/claude-sonnet-4.5).

Usage:

    from _shared.llm_client import generate, generate_json

    text = generate(
        system="You are a senior SEO consultant.",
        user="Analyze this article: ...",
        cache_system=True,
        max_tokens=2000,
    )

    parsed = generate_json(
        system="...",
        user="...",
        schema={"type": "object", ...},
    )
"""
from __future__ import annotations

import json
import os
from typing import Any

import structlog
from anthropic import Anthropic
from anthropic.types import TextBlock
from tenacity import (
    retry, retry_if_exception_type, stop_after_attempt, wait_exponential,
)


log = structlog.get_logger()

DEFAULT_MODEL = "anthropic/claude-sonnet-4.5"


def _client() -> Anthropic:
    """Anthropic client configured for OpenRouter passthrough."""
    if hasattr(_client, "_cached"):
        return _client._cached  # type: ignore[attr-defined]

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not set")

    # OpenRouter is OpenAI-compatible AND Anthropic-compatible. For prompt
    # caching to actually work we use the Anthropic SDK pointing to OpenRouter's
    # /anthropic/ proxy endpoint.
    client = Anthropic(
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1",
    )
    _client._cached = client  # type: ignore[attr-defined]
    return client


def _model() -> str:
    return os.environ.get("SEO_OPTIMIZER_MODEL", DEFAULT_MODEL)


@retry(
    retry=retry_if_exception_type((Exception,)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=16),
    reraise=True,
)
def _call_llm(
    *,
    system: str | list[dict],
    user: str,
    max_tokens: int,
    temperature: float,
) -> tuple[str, dict]:
    """Low-level call; returns (text, usage_dict)."""
    client = _client()

    # Build system blocks (with cache_control if requested via list form)
    if isinstance(system, str):
        system_blocks = [{"type": "text", "text": system}]
    else:
        system_blocks = system

    resp = client.messages.create(
        model=_model(),
        max_tokens=max_tokens,
        temperature=temperature,
        system=system_blocks,
        messages=[{"role": "user", "content": user}],
    )

    text = "".join(
        block.text for block in resp.content if isinstance(block, TextBlock)
    )
    usage = {
        "input_tokens": getattr(resp.usage, "input_tokens", 0),
        "output_tokens": getattr(resp.usage, "output_tokens", 0),
        "cache_creation_input_tokens": getattr(resp.usage, "cache_creation_input_tokens", 0),
        "cache_read_input_tokens": getattr(resp.usage, "cache_read_input_tokens", 0),
    }
    return text, usage


def generate(
    *,
    system: str,
    user: str,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    cache_system: bool = True,
) -> str:
    """Generate text. Returns just the text."""
    if cache_system:
        system_arg: str | list[dict] = [
            {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}},
        ]
    else:
        system_arg = system

    text, usage = _call_llm(
        system=system_arg, user=user, max_tokens=max_tokens, temperature=temperature,
    )
    log.info("llm_generate", usage=usage, output_chars=len(text))
    return text


def generate_json(
    *,
    system: str,
    user: str,
    max_tokens: int = 4000,
    temperature: float = 0.1,
    cache_system: bool = True,
) -> dict[str, Any]:
    """Generate JSON output. Parses and returns dict.

    Robust to LLM wrapping JSON in code fences. Raises ValueError if no parseable
    JSON found.
    """
    text = generate(
        system=system,
        user=user + "\n\nRespond with ONLY a valid JSON object. No code fences, no commentary.",
        max_tokens=max_tokens,
        temperature=temperature,
        cache_system=cache_system,
    )
    # Strip code fences if present
    cleaned = text.strip()
    if cleaned.startswith("```"):
        # Drop first and last fence lines
        lines = cleaned.splitlines()
        cleaned = "\n".join(lines[1:-1]) if len(lines) >= 2 else cleaned

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        log.error("llm_json_parse_failed", text=text[:500], error=str(exc))
        # Try to extract first {...} block
        import re
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
        raise ValueError(f"LLM returned non-JSON: {text[:200]}") from exc


def call_with_usage(
    *,
    system: str,
    user: str,
    max_tokens: int = 2000,
    temperature: float = 0.3,
    cache_system: bool = True,
) -> tuple[str, dict]:
    """Like generate() but also returns the usage dict.

    Used by /writer to record tokens_input/output in opportunity_rewrites.
    """
    if cache_system:
        system_arg: str | list[dict] = [
            {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}},
        ]
    else:
        system_arg = system

    text, usage = _call_llm(
        system=system_arg, user=user, max_tokens=max_tokens, temperature=temperature,
    )
    return text, usage
