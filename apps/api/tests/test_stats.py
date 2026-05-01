"""Verify compute_stats over hand-built fixtures."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from src.services.stats import compute_stats


@dataclass
class FakeCase:
    input: str
    category: str | None


@dataclass
class FakeResult:
    judge_score: int | None
    judge_reasoning: str | None
    error: str | None
    test_case: Any
    test_case_id: uuid.UUID
    id: uuid.UUID
    agent_input_tokens: int | None = None
    agent_output_tokens: int | None = None
    judge_input_tokens: int | None = None
    judge_output_tokens: int | None = None
    dim_accuracy: int | None = None
    dim_completeness: int | None = None
    dim_tone: int | None = None
    dim_safety: int | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def make(
        cls,
        score: int | None,
        category: str | None = None,
        error: str | None = None,
        *,
        dims: tuple[int, int, int, int] | None = None,
        tokens: tuple[int, int, int, int] | None = None,
    ) -> FakeResult:
        a, c, t, s = dims if dims else (None, None, None, None)
        ai, ao, ji, jo = tokens if tokens else (None, None, None, None)
        return cls(
            judge_score=score,
            judge_reasoning="r",
            error=error,
            test_case=FakeCase(input="hi", category=category),
            test_case_id=uuid.uuid4(),
            id=uuid.uuid4(),
            agent_input_tokens=ai,
            agent_output_tokens=ao,
            judge_input_tokens=ji,
            judge_output_tokens=jo,
            dim_accuracy=a,
            dim_completeness=c,
            dim_tone=t,
            dim_safety=s,
        )


def test_compute_stats_basic() -> None:
    results = [
        FakeResult.make(5, "refund"),
        FakeResult.make(5, "refund"),
        FakeResult.make(3, "complaint"),
        FakeResult.make(1, None),
        FakeResult.make(None, None, error="Timeout"),
    ]
    s = compute_stats(results)  # type: ignore[arg-type]
    assert s.total_cases == 5
    assert s.successful_cases == 4
    assert s.errored_cases == 1
    assert s.pass_rate == 0.5  # 2 of 4 ≥ 4
    assert s.avg_score == 3.5  # (5+5+3+1)/4
    assert s.score_distribution == {1: 1, 2: 0, 3: 1, 4: 0, 5: 2}
    assert "refund" in s.per_category
    assert "complaint" in s.per_category
    assert "uncategorized" in s.per_category
    assert s.per_category["refund"].count == 2
    assert s.per_category["refund"].pass_rate == 1.0


def test_compute_stats_no_successful() -> None:
    results = [FakeResult.make(None, None, error="boom")]
    s = compute_stats(results)  # type: ignore[arg-type]
    assert s.total_cases == 1
    assert s.successful_cases == 0
    assert s.errored_cases == 1
    assert s.pass_rate == 0.0
    assert s.avg_score == 0.0
    assert s.score_distribution == {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    assert s.per_category == {}
    assert s.worst_cases == []


def test_compute_stats_worst_cases_capped_at_5() -> None:
    results = [FakeResult.make(i % 5 + 1, "x") for i in range(20)]
    s = compute_stats(results)  # type: ignore[arg-type]
    assert len(s.worst_cases) == 5
    assert all(w.judge_score <= 2 for w in s.worst_cases)


# --- New: dimensions + tokens + cost ---


def test_per_dimension_none_when_no_dims_populated() -> None:
    results = [FakeResult.make(5, "x"), FakeResult.make(4, "x")]
    s = compute_stats(results)  # type: ignore[arg-type]
    assert s.per_dimension is None


def test_per_dimension_averaged_over_qualified_subset() -> None:
    results = [
        FakeResult.make(5, "x", dims=(5, 5, 5, 5)),
        FakeResult.make(3, "x", dims=(3, 4, 5, 1)),
        # Partially-populated case must be excluded — even one None disqualifies it
        FakeResult.make(4, "x"),
    ]
    s = compute_stats(results)  # type: ignore[arg-type]
    assert s.per_dimension is not None
    assert s.per_dimension["accuracy"] == 4.0  # (5+3)/2
    assert s.per_dimension["completeness"] == 4.5
    assert s.per_dimension["tone"] == 5.0
    assert s.per_dimension["safety"] == 3.0
    assert set(s.per_dimension) == {"accuracy", "completeness", "tone", "safety"}


def test_token_totals_sum_across_all_results_including_errored() -> None:
    results = [
        FakeResult.make(5, "x", tokens=(100, 50, 200, 30)),
        # Errored case: agent ran (tokens spent) but judge failed
        FakeResult.make(None, "x", error="judge bad json", tokens=(80, 40, 0, 0)),
    ]
    s = compute_stats(results)  # type: ignore[arg-type]
    assert s.tokens_in == 100 + 200 + 80 + 0
    assert s.tokens_out == 50 + 30 + 40 + 0
    assert s.tokens_total == s.tokens_in + s.tokens_out


def test_estimated_cost_uses_pricing_module() -> None:
    results = [FakeResult.make(5, "x", tokens=(1_000_000, 500_000, 0, 0))]
    s = compute_stats(
        results,  # type: ignore[arg-type]
        agent_model="llama-3.3-70b-versatile",
        judge_model="llama-3.3-70b-versatile",
    )
    # 1M agent input × $0.59 + 500k agent output × $0.79 = 0.59 + 0.395 = 0.985
    assert abs(s.estimated_cost_usd - 0.985) < 1e-9


def test_estimated_cost_zero_for_unknown_model() -> None:
    results = [FakeResult.make(5, "x", tokens=(1_000_000, 1_000_000, 0, 0))]
    s = compute_stats(
        results,  # type: ignore[arg-type]
        agent_model="some-unknown-model",
        judge_model="another-unknown",
    )
    assert s.estimated_cost_usd == 0.0
