"""Groq client wrapper: token-bucket rate limiter + retry on 429."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from openai import AsyncOpenAI, RateLimitError

from ..config import settings

logger = logging.getLogger(__name__)


class RateLimiter:
    """Trailing 60s token bucket. Globally caps Groq calls to ``rpm`` per minute."""

    def __init__(self, rpm: int) -> None:
        self.rpm = rpm
        self._timestamps: list[float] = []
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        while True:
            async with self._lock:
                now = time.monotonic()
                cutoff = now - 60.0
                self._timestamps = [t for t in self._timestamps if t > cutoff]
                if len(self._timestamps) < self.rpm:
                    self._timestamps.append(now)
                    return
                wait_for = 60.0 - (now - self._timestamps[0]) + 0.01
            logger.info("rate_limiter: sleeping %.2fs (rpm=%d)", wait_for, self.rpm)
            await asyncio.sleep(max(wait_for, 0.05))


_rate_limiter = RateLimiter(rpm=28)
_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not set")
        _client = AsyncOpenAI(
            api_key=settings.GROQ_API_KEY,
            base_url="https://api.groq.com/openai/v1",
        )
    return _client


Usage = dict[str, int]


def _empty_usage() -> Usage:
    return {"prompt_tokens": 0, "completion_tokens": 0}


def _extract_usage(resp: Any) -> Usage:
    """Lift prompt/completion token counts off an OpenAI-shaped response.

    Defaults to zeros when the SDK omits ``usage`` (rare, but possible on some
    streaming or error paths) so callers can sum unconditionally.
    """
    u = getattr(resp, "usage", None)
    if u is None:
        return _empty_usage()
    return {
        "prompt_tokens": int(getattr(u, "prompt_tokens", 0) or 0),
        "completion_tokens": int(getattr(u, "completion_tokens", 0) or 0),
    }


async def call_llm(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.7,
    max_tokens: int = 512,
    response_format: dict[str, Any] | None = None,
) -> tuple[str, int, Usage]:
    """Rate-limited Groq chat-completion.

    Returns ``(content, latency_ms, usage)`` where ``usage`` is
    ``{"prompt_tokens": int, "completion_tokens": int}``.
    """
    await _rate_limiter.acquire()
    client = _get_client()

    last_err: Exception | None = None
    for attempt in range(4):
        start = time.monotonic()
        try:
            kwargs: dict[str, Any] = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if response_format is not None:
                kwargs["response_format"] = response_format
            resp = await client.chat.completions.create(**kwargs)
            latency_ms = int((time.monotonic() - start) * 1000)
            content = resp.choices[0].message.content or ""
            usage = _extract_usage(resp)
            logger.info(
                "call_llm ok model=%s attempt=%d latency_ms=%d in=%d out=%d",
                model, attempt, latency_ms,
                usage["prompt_tokens"], usage["completion_tokens"],
            )
            return content, latency_ms, usage
        except RateLimitError as e:
            last_err = e
            backoff = 2 ** attempt  # 1, 2, 4, 8
            logger.warning(
                "call_llm 429 model=%s attempt=%d backoff_s=%d",
                model, attempt, backoff,
            )
            if attempt == 3:
                break
            await asyncio.sleep(backoff)

    raise RuntimeError(f"call_llm failed after 4 attempts: {last_err}")


async def call_llm_json(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.0,
    max_tokens: int = 800,
) -> tuple[dict[str, Any], int, Usage]:
    """Call Groq with response_format=json_object, parse-retry once on bad JSON.

    Returns ``(parsed_dict, latency_ms_of_successful_call, total_usage)``. Token
    counts are summed across BOTH attempts because both attempts hit the wire
    even when the first one returned bad JSON. Raises RuntimeError after both
    attempts fail.
    """
    cumulative: Usage = _empty_usage()
    last_error: str | None = None
    for attempt in range(2):
        sys_prompt = (
            system
            if attempt == 0
            else system + "\n\nREMINDER: Return ONLY valid JSON, no markdown fences, no preamble."
        )
        content, latency_ms, usage = await call_llm(
            model=model,
            system=sys_prompt,
            user=user,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        cumulative["prompt_tokens"] += usage["prompt_tokens"]
        cumulative["completion_tokens"] += usage["completion_tokens"]
        try:
            data = json.loads(content)
            if not isinstance(data, dict):
                raise ValueError(f"expected JSON object, got {type(data).__name__}")
            return data, latency_ms, cumulative
        except (json.JSONDecodeError, ValueError) as e:
            last_error = f"json parse failed: {e}; content was: {content[:200]}"
            continue

    raise RuntimeError(last_error or "call_llm_json failed without specific error")


def domain_context_block(domain_context: str | None) -> str:
    """Render the optional DOMAIN CONTEXT block injected into judge/cluster/diff prompts.

    Returns empty string when unset so the surrounding prompt stays domain-neutral.
    When set, anchors the LLM's interpretation of the rubric to the agent's domain.
    """
    if not domain_context or not domain_context.strip():
        return ""
    return (
        "DOMAIN CONTEXT:\n"
        f"{domain_context.strip()}\n"
        "Interpret the dimensions above in light of this context. For example, "
        "\"tone\" depends on what is appropriate for this agent's purpose; "
        "\"safety\" depends on what is out-of-scope for this agent.\n\n"
    )
