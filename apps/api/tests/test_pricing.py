"""Verify pricing.estimate_cost lookup."""
from src.services.pricing import RATES_PER_M_TOKENS, estimate_cost


def test_known_model_charges_input_and_output_separately() -> None:
    cost = estimate_cost("llama-3.3-70b-versatile", 1_000_000, 1_000_000)
    rates = RATES_PER_M_TOKENS["llama-3.3-70b-versatile"]
    assert abs(cost - (rates[0] + rates[1])) < 1e-9


def test_unknown_model_returns_zero() -> None:
    assert estimate_cost("not-a-real-model", 999_999, 999_999) == 0.0


def test_zero_tokens_zero_cost() -> None:
    assert estimate_cost("llama-3.3-70b-versatile", 0, 0) == 0.0
