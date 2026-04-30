"""Judge-vs-human calibration metrics.

Cohen's kappa is the standard agreement-beyond-chance metric for two raters
on a categorical scale. We use the unweighted form (1-5 scores treated as
nominal categories) — simple to interpret and matches how the judge actually
behaves.
"""
from __future__ import annotations

from collections.abc import Iterable

SCORES = (1, 2, 3, 4, 5)


def empty_confusion_matrix() -> dict[int, dict[int, int]]:
    return {j: {h: 0 for h in SCORES} for j in SCORES}


def compute_agreement(pairs: Iterable[tuple[int, int]]) -> dict:
    """Compute agreement metrics from (judge_score, human_score) pairs.

    Returns a dict with percent_agreement, cohens_kappa (None when degenerate),
    and a 5x5 confusion matrix keyed by judge score then human score.
    """
    pairs_list = [(j, h) for j, h in pairs if j in SCORES and h in SCORES]
    n = len(pairs_list)

    matrix = empty_confusion_matrix()
    if n == 0:
        return {
            "scored_cases": 0,
            "percent_agreement": 0.0,
            "cohens_kappa": None,
            "confusion_matrix": matrix,
        }

    agreements = 0
    judge_totals = dict.fromkeys(SCORES, 0)
    human_totals = dict.fromkeys(SCORES, 0)
    for j, h in pairs_list:
        matrix[j][h] += 1
        judge_totals[j] += 1
        human_totals[h] += 1
        if j == h:
            agreements += 1

    p_o = agreements / n
    p_e = sum((judge_totals[s] / n) * (human_totals[s] / n) for s in SCORES)
    kappa: float | None
    if n < 2 or abs(1.0 - p_e) < 1e-12:
        kappa = None
    else:
        kappa = (p_o - p_e) / (1.0 - p_e)

    return {
        "scored_cases": n,
        "percent_agreement": p_o,
        "cohens_kappa": kappa,
        "confusion_matrix": matrix,
    }
