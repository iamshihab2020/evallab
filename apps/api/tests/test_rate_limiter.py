"""Verify the RateLimiter blocks the 4th acquire when rpm=3."""
from __future__ import annotations

import asyncio
import time
from unittest.mock import patch

import pytest

from src.services.llm import RateLimiter


@pytest.mark.asyncio
async def test_rate_limiter_blocks_fourth_acquire() -> None:
    """rpm=3, four concurrent acquires: the 4th waits ~60s of simulated time."""
    rl = RateLimiter(rpm=3)

    fake_now = [0.0]
    sleeps: list[float] = []

    def fake_monotonic() -> float:
        return fake_now[0]

    async def fake_sleep(s: float) -> None:
        sleeps.append(s)
        fake_now[0] += s

    with patch("src.services.llm.time.monotonic", fake_monotonic), \
         patch("src.services.llm.asyncio.sleep", fake_sleep):
        await rl.acquire()  # t=0
        await rl.acquire()  # t=0
        await rl.acquire()  # t=0
        await rl.acquire()  # must sleep ~60s

    assert sleeps, "4th acquire should have slept"
    assert abs(sum(sleeps) - 60.0) < 1.0, f"expected ~60s wait, got {sum(sleeps)}"


@pytest.mark.asyncio
async def test_rate_limiter_allows_burst_within_limit() -> None:
    rl = RateLimiter(rpm=5)
    start = time.monotonic()
    await asyncio.gather(*[rl.acquire() for _ in range(5)])
    elapsed = time.monotonic() - start
    assert elapsed < 1.0, f"5 acquires within rpm=5 should be fast, got {elapsed}s"
