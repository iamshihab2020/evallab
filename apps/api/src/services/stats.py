"""Pure stats computation over a list of CaseResult rows."""
from __future__ import annotations

from collections.abc import Iterable

from src.models import CaseResult
from src.schemas import CategoryStat, RunStats, WorstCase


def compute_stats(case_results: Iterable[CaseResult]) -> RunStats:
    results = list(case_results)
    successful = [r for r in results if r.judge_score is not None and r.error is None]
    errored = [r for r in results if r.error is not None]

    distribution: dict[int, int] = {i: 0 for i in range(1, 6)}

    if not successful:
        return RunStats(
            total_cases=len(results),
            successful_cases=0,
            errored_cases=len(errored),
            pass_rate=0.0,
            avg_score=0.0,
            score_distribution=distribution,
            per_category={},
            worst_cases=[],
        )

    n = len(successful)
    pass_rate = sum(1 for r in successful if (r.judge_score or 0) >= 4) / n
    avg_score = sum(r.judge_score or 0 for r in successful) / n
    for i in range(1, 6):
        distribution[i] = sum(1 for r in successful if r.judge_score == i)

    by_cat: dict[str, list[CaseResult]] = {}
    for r in successful:
        cat = (r.test_case.category if r.test_case is not None else None) or "uncategorized"
        by_cat.setdefault(cat, []).append(r)

    per_category: dict[str, CategoryStat] = {}
    for cat, items in by_cat.items():
        m = len(items)
        per_category[cat] = CategoryStat(
            count=m,
            pass_rate=sum(1 for r in items if (r.judge_score or 0) >= 4) / m,
            avg_score=sum(r.judge_score or 0 for r in items) / m,
        )

    worst_sorted = sorted(successful, key=lambda r: r.judge_score or 0)[:5]
    worst_cases = [
        WorstCase(
            case_result_id=r.id,
            test_case_id=r.test_case_id,
            input=r.test_case.input if r.test_case is not None else "",
            judge_score=r.judge_score or 0,
            judge_reasoning=r.judge_reasoning,
        )
        for r in worst_sorted
    ]

    return RunStats(
        total_cases=len(results),
        successful_cases=n,
        errored_cases=len(errored),
        pass_rate=pass_rate,
        avg_score=avg_score,
        score_distribution=distribution,
        per_category=per_category,
        worst_cases=worst_cases,
    )
