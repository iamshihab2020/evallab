"""Groq client wrapper: token-bucket rate limiter + retry on 429."""
from __future__ import annotations

import asyncio
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


async def call_llm(
    *,
    model: str,
    system: str,
    user: str,
    temperature: float = 0.7,
    max_tokens: int = 512,
    response_format: dict[str, Any] | None = None,
) -> tuple[str, int]:
    """Rate-limited Groq chat-completion. Returns (content, latency_ms)."""
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
            logger.info(
                "call_llm ok model=%s attempt=%d latency_ms=%d",
                model, attempt, latency_ms,
            )
            return content, latency_ms
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
