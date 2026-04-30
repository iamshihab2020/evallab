"""Tests for compute_agreement: percent agreement + Cohen's kappa + confusion matrix."""
from __future__ import annotations

from src.services.calibration import compute_agreement


def test_perfect_agreement_returns_pa_1_kappa_1() -> None:
    pairs = [(s, s) for s in (1, 2, 3, 4, 5, 1, 2, 3)]
    out = compute_agreement(pairs)
    assert out["scored_cases"] == 8
    assert out["percent_agreement"] == 1.0
    # When all judges and all humans span at least 2 categories AND fully agree,
    # p_e < 1 so kappa is defined and equals 1.0.
    assert out["cohens_kappa"] == 1.0


def test_total_disagreement_returns_kappa_le_zero() -> None:
    # Judge always 5, human always 1. % agreement = 0, kappa = 0 (p_o == p_e).
    pairs = [(5, 1)] * 10
    out = compute_agreement(pairs)
    assert out["percent_agreement"] == 0.0
    # p_e == 0 here (only one category each, products of marginals zero out
    # off-diagonal). With p_o=p_e=0, kappa = 0 / 1 = 0.
    assert out["cohens_kappa"] == 0.0


def test_known_kappa_value() -> None:
    """Hand-computed kappa for a small mixed dataset.

    pairs (judge, human):
      (4,4) (4,4) (5,5) (3,4) (5,3) (4,5)  → 6 items
    agreements = 3 → p_o = 0.5

    judge counts: 3=1, 4=3, 5=2 → marginals 1/6, 3/6, 2/6
    human counts: 3=1, 4=3, 5=2 → marginals 1/6, 3/6, 2/6

    p_e = (1/6)(1/6) + (3/6)(3/6) + (2/6)(2/6)
        = 1/36 + 9/36 + 4/36 = 14/36 ≈ 0.3889
    kappa = (0.5 - 14/36) / (1 - 14/36) = (4/36) / (22/36) = 4/22 ≈ 0.1818
    """
    pairs = [(4, 4), (4, 4), (5, 5), (3, 4), (5, 3), (4, 5)]
    out = compute_agreement(pairs)
    assert out["scored_cases"] == 6
    assert abs(out["percent_agreement"] - 0.5) < 1e-9
    assert out["cohens_kappa"] is not None
    assert abs(out["cohens_kappa"] - (4 / 22)) < 1e-9


def test_kappa_undefined_when_only_one_category() -> None:
    """Both raters always pick the same single value → p_e = 1, kappa undefined."""
    pairs = [(4, 4)] * 5
    out = compute_agreement(pairs)
    assert out["percent_agreement"] == 1.0
    assert out["cohens_kappa"] is None  # degenerate; can't correct for chance


def test_empty_input_returns_zeros() -> None:
    out = compute_agreement([])
    assert out["scored_cases"] == 0
    assert out["percent_agreement"] == 0.0
    assert out["cohens_kappa"] is None
    # Confusion matrix is 5x5, all zeros.
    for j in range(1, 6):
        for h in range(1, 6):
            assert out["confusion_matrix"][j][h] == 0


def test_confusion_matrix_counts() -> None:
    pairs = [(4, 4), (4, 5), (3, 3), (5, 4)]
    out = compute_agreement(pairs)
    cm = out["confusion_matrix"]
    assert cm[4][4] == 1
    assert cm[4][5] == 1
    assert cm[3][3] == 1
    assert cm[5][4] == 1
    # Other cells empty.
    assert cm[1][1] == 0
    assert cm[2][3] == 0


def test_invalid_scores_filtered() -> None:
    """Scores outside 1..5 are dropped, not crashed on."""
    pairs = [(4, 4), (7, 4), (4, 0), (3, 3)]
    out = compute_agreement(pairs)
    # Only the (4,4) and (3,3) pairs are valid → both agree.
    assert out["scored_cases"] == 2
    assert out["percent_agreement"] == 1.0
