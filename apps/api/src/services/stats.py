"""Pure stats computation over a list of CaseResult rows."""
from __future__ import annotations

from collections.abc import Iterable

from src.models import CaseResult
from src.schemas import CategoryStat, RunStats, WorstCase

from .judge import DIMENSIONS
from .pricing import estimate_cost


def compute_stats(
    case_results: Iterable[CaseResult],
    *,
    agent_model: str | None = None,
    judge_model: str | None = None,
) -> RunStats:
    results = list(case_results)
    successful = [r for r in results if r.judge_score is not None and r.error is None]
    errored = [r for r in results if r.error is not None]

    distribution: dict[int, int] = {i: 0 for i in range(1, 6)}

    # Token + cost rollups span ALL results — agent spend is logged even on
    # cases where the judge errored later, so the bill reflects reality.
    agent_in = sum((r.agent_input_tokens or 0) for r in results)
    agent_out = sum((r.agent_output_tokens or 0) for r in results)
    judge_in = sum((r.judge_input_tokens or 0) for r in results)
    judge_out = sum((r.judge_output_tokens or 0) for r in results)
    tokens_in = agent_in + judge_in
    tokens_out = agent_out + judge_out
    cost = 0.0
    if agent_model:
        cost += estimate_cost(agent_model, agent_in, agent_out)
    if judge_model:
        cost += estimate_cost(judge_model, judge_in, judge_out)

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
            per_dimension=None,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            tokens_total=tokens_in + tokens_out,
            estimated_cost_usd=cost,
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

    # Per-dimension averages over the subset of successful cases that have
    # ALL 4 dim columns populated. Old rows have NULLs and are skipped; if
    # nothing qualifies we return None so the UI hides the strip cleanly.
    dim_qualified = [
        r for r in successful
        if r.dim_accuracy is not None
        and r.dim_completeness is not None
        and r.dim_tone is not None
        and r.dim_safety is not None
    ]
    per_dimension: dict[str, float] | None
    if dim_qualified:
        k = len(dim_qualified)
        per_dimension = {
            "accuracy": sum(r.dim_accuracy or 0 for r in dim_qualified) / k,
            "completeness": sum(r.dim_completeness or 0 for r in dim_qualified) / k,
            "tone": sum(r.dim_tone or 0 for r in dim_qualified) / k,
            "safety": sum(r.dim_safety or 0 for r in dim_qualified) / k,
        }
        # Confirm every dimension we expose is one of the 4 we promised the UI.
        assert set(per_dimension) == set(DIMENSIONS)
    else:
        per_dimension = None

    return RunStats(
        total_cases=len(results),
        successful_cases=n,
        errored_cases=len(errored),
        pass_rate=pass_rate,
        avg_score=avg_score,
        score_distribution=distribution,
        per_category=per_category,
        worst_cases=worst_cases,
        per_dimension=per_dimension,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        tokens_total=tokens_in + tokens_out,
        estimated_cost_usd=cost,
    )
