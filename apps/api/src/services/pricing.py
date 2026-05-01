"""Token-cost estimation.

Rates target Groq's published per-token pricing so the dollar figure means
something even when actually running on Groq's free tier (where the bill is
$0). Unknown models silently return 0.0 — the run still works; the UI just
shows ``~$0.00`` and the user knows it's an unmapped model.
"""
from __future__ import annotations

# (input_usd_per_million, output_usd_per_million)
RATES_PER_M_TOKENS: dict[str, tuple[float, float]] = {
    "llama-3.3-70b-versatile": (0.59, 0.79),
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Return USD cost for one model call given its token counts."""
    rates = RATES_PER_M_TOKENS.get(model)
    if rates is None:
        return 0.0
    in_rate, out_rate = rates
    return (input_tokens / 1_000_000) * in_rate + (output_tokens / 1_000_000) * out_rate
