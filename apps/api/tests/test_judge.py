"""Verify judge_response handles JSON parse retry + score-range validation."""
from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from src.services import judge as judge_mod


def _stub_call_llm(responses: list[tuple[str, int]]):
    """Build a fake call_llm that returns (content, latency, usage) triples."""
    idx = {"i": 0}

    async def fake(**_: Any) -> tuple[str, int, dict[str, int]]:
        i = idx["i"]
        idx["i"] += 1
        content, latency = responses[i]
        return content, latency, {"prompt_tokens": 10, "completion_tokens": 5}

    return fake


@pytest.mark.asyncio
async def test_judge_parse_retry_recovers() -> None:
    """call_llm_json retries once on bad JSON; judge_response then succeeds."""
    fake = _stub_call_llm([
        ("not json at all", 100),
        (
            '{"score": 4, "reasoning": "good response", '
            '"dimensions": {"accuracy": 4, "completeness": 4, "tone": 5, "safety": 5}}',
            120,
        ),
    ])
    with patch("src.services.llm.call_llm", fake):
        score, dims, reasoning, full_prompt, latency, usage = await judge_mod.judge_response(
            model="x", input="hi", agent_output="hello", expected_behavior="greet",
        )
    assert score == 4
    assert dims == {"accuracy": 4, "completeness": 4, "tone": 5, "safety": 5}
    assert reasoning == "good response"
    assert "SYSTEM:" in full_prompt and "USER:" in full_prompt
    assert latency == 120
    # Two attempts both contribute to cumulative usage.
    assert usage["prompt_tokens"] == 20
    assert usage["completion_tokens"] == 10


@pytest.mark.asyncio
async def test_judge_dim_fallback_when_dimensions_missing() -> None:
    """When the judge omits the dimensions block, fall back to overall score so
    the case still scores — only the breakdown is lost."""
    fake = _stub_call_llm([
        ('{"score": 3, "reasoning": "ok"}', 70),
    ])
    with patch("src.services.llm.call_llm", fake):
        score, dims, *_ = await judge_mod.judge_response(
            model="x", input="hi", agent_output="hello", expected_behavior="greet",
        )
    assert score == 3
    assert dims == {"accuracy": 3, "completeness": 3, "tone": 3, "safety": 3}


@pytest.mark.asyncio
async def test_judge_dim_fallback_when_one_dim_out_of_range() -> None:
    """A single bad dim value disqualifies the whole breakdown — fall back."""
    fake = _stub_call_llm([
        (
            '{"score": 5, "reasoning": "good", '
            '"dimensions": {"accuracy": 5, "completeness": 5, "tone": 5, "safety": 9}}',
            70,
        ),
    ])
    with patch("src.services.llm.call_llm", fake):
        score, dims, *_ = await judge_mod.judge_response(
            model="x", input="hi", agent_output="hello", expected_behavior="greet",
        )
    assert score == 5
    assert dims == {"accuracy": 5, "completeness": 5, "tone": 5, "safety": 5}


@pytest.mark.asyncio
async def test_judge_raises_after_two_bad_responses() -> None:
    fake = _stub_call_llm([("garbage", 50), ("still garbage", 60)])
    with patch("src.services.llm.call_llm", fake):
        with pytest.raises(RuntimeError, match="json parse failed"):
            await judge_mod.judge_response(
                model="x", input="hi", agent_output="hello", expected_behavior="greet",
            )


@pytest.mark.asyncio
async def test_judge_rejects_out_of_range_score() -> None:
    """Score 9 is out of 1-5; judge_response raises (no retry layer for this)."""
    fake = _stub_call_llm([
        ('{"score": 9, "reasoning": "boom"}', 50),
    ])
    with patch("src.services.llm.call_llm", fake):
        with pytest.raises(RuntimeError, match="out of range"):
            await judge_mod.judge_response(
                model="x", input="hi", agent_output="hello", expected_behavior="greet",
            )


@pytest.mark.asyncio
async def test_judge_rejects_missing_fields() -> None:
    """Valid JSON but missing 'score' or 'reasoning' fails fast."""
    fake = _stub_call_llm([
        ('{"verdict": "good"}', 50),
    ])
    with patch("src.services.llm.call_llm", fake):
        with pytest.raises(RuntimeError, match="missing fields"):
            await judge_mod.judge_response(
                model="x", input="hi", agent_output="hello", expected_behavior="greet",
            )
