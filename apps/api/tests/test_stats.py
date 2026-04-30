"""Verify compute_stats over hand-built fixtures."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
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

    @classmethod
    def make(
        cls,
        score: int | None,
        category: str | None = None,
        error: str | None = None,
    ) -> "FakeResult":
        return cls(
            judge_score=score,
            judge_reasoning="r",
            error=error,
            test_case=FakeCase(input="hi", category=category),
            test_case_id=uuid.uuid4(),
            id=uuid.uuid4(),
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
