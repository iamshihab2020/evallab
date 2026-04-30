"""Verify judge_response retries once on bad JSON, raises after two failures."""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import patch

import pytest

from src.services import judge as judge_mod


def _mk_call_llm(responses: list[tuple[str, int]]):
    it: AsyncIterator[tuple[str, int]]
    idx = {"i": 0}

    async def fake(**kwargs: Any) -> tuple[str, int]:
        i = idx["i"]
        idx["i"] += 1
        return responses[i]

    return fake


@pytest.mark.asyncio
async def test_judge_parse_retry_recovers() -> None:
    fake = _mk_call_llm([
        ("not json at all", 100),
        ('{"score": 4, "reasoning": "good response"}', 120),
    ])
    with patch.object(judge_mod, "call_llm", fake):
        score, reasoning, full_prompt, latency = await judge_mod.judge_response(
            model="x", input="hi", agent_output="hello", expected_behavior="greet",
        )
    assert score == 4
    assert reasoning == "good response"
    assert "SYSTEM:" in full_prompt and "USER:" in full_prompt
    assert latency == 120


@pytest.mark.asyncio
async def test_judge_raises_after_two_bad_responses() -> None:
    fake = _mk_call_llm([("garbage", 50), ("still garbage", 60)])
    with patch.object(judge_mod, "call_llm", fake):
        with pytest.raises(RuntimeError, match="judge JSON parse failed"):
            await judge_mod.judge_response(
                model="x", input="hi", agent_output="hello", expected_behavior="greet",
            )


@pytest.mark.asyncio
async def test_judge_rejects_out_of_range_score() -> None:
    fake = _mk_call_llm([
        ('{"score": 9, "reasoning": "boom"}', 50),
        ('{"score": 3, "reasoning": "ok"}', 60),
    ])
    with patch.object(judge_mod, "call_llm", fake):
        score, _, _, _ = await judge_mod.judge_response(
            model="x", input="hi", agent_output="hello", expected_behavior="greet",
        )
    assert score == 3
