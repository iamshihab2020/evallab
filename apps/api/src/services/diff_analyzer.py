"""Explain why two runs (same test set, different agents/prompts) diverged."""
from __future__ import annotations

import logging

from src.models import Agent, CaseResult
from src.schemas import CompareInsightContent

from .llm import call_llm_json, domain_context_block

logger = logging.getLogger(__name__)

DIFF_SYSTEM_TEMPLATE = """You are an expert at analyzing prompt-engineering changes.

You will receive two AI agents (Prompt A and Prompt B) evaluated against the
same test set, plus aggregate stats and a sample of cases that improved or
regressed between them. Explain the BEHAVIORAL difference between the two
prompts and how it shows up in scores.

Focus on:
- Concrete behavioral patterns (tone, structure, what the agent does/skips)
- The connection between prompt changes and case outcomes
- NOT just restating the score numbers

__DOMAIN_CONTEXT_BLOCK__Return ONLY a JSON object of this exact shape, no other text:
{
  "summary": "<one paragraph, 2-4 sentences, explaining the overall change>",
  "improved_themes": ["<short noun phrase>", ...],
  "regressed_themes": ["<short noun phrase>", ...]
}

Rules:
- Each theme is a short noun phrase, max 8 words.
- 0-4 items per theme list. Empty list is fine.
- If no improvements or regressions, return an empty list for that side.
"""


def build_diff_system(domain_context: str | None) -> str:
    """Inject the optional DOMAIN CONTEXT block into the diff system prompt."""
    return DIFF_SYSTEM_TEMPLATE.replace(
        "__DOMAIN_CONTEXT_BLOCK__", domain_context_block(domain_context),
    )


def _format_cases(label: str, cases: list[tuple[CaseResult, CaseResult]]) -> str:
    if not cases:
        return f"{label}: (none)"
    blocks = [f"{label}:"]
    for ca, cb in cases:
        ti = ca.test_case
        blocks.append(
            f"INPUT: {(ti.input if ti else '').strip()[:300]}\n"
            f"  A_SCORE={ca.judge_score} B_SCORE={cb.judge_score}\n"
            f"  A_OUTPUT: {(ca.agent_output or '').strip()[:300]}\n"
            f"  B_OUTPUT: {(cb.agent_output or '').strip()[:300]}",
        )
    return "\n".join(blocks)


async def explain_diff(
    *,
    model: str,
    agent_a: Agent,
    agent_b: Agent,
    pass_rate_a: float,
    pass_rate_b: float,
    avg_score_a: float,
    avg_score_b: float,
    improved_pairs: list[tuple[CaseResult, CaseResult]],
    regressed_pairs: list[tuple[CaseResult, CaseResult]],
    domain_context: str | None = None,
) -> CompareInsightContent:
    """Generate an LLM explanation of why scores diverged. Caches at the route layer."""
    user = (
        f"PROMPT A ({agent_a.name}):\n{agent_a.system_prompt}\n\n"
        f"PROMPT B ({agent_b.name}):\n{agent_b.system_prompt}\n\n"
        f"AGGREGATE STATS:\n"
        f"  A: pass_rate={pass_rate_a:.0%} avg_score={avg_score_a:.2f}\n"
        f"  B: pass_rate={pass_rate_b:.0%} avg_score={avg_score_b:.2f}\n\n"
        f"{_format_cases('IMPROVED CASES (B > A)', improved_pairs)}\n\n"
        f"{_format_cases('REGRESSED CASES (B < A)', regressed_pairs)}"
    )

    data, _latency = await call_llm_json(
        model=model,
        system=build_diff_system(domain_context),
        user=user,
        temperature=0.2,
        max_tokens=800,
    )

    def _themes(raw: object) -> list[str]:
        if not isinstance(raw, list):
            return []
        return [s for s in (str(x).strip() for x in raw if isinstance(x, str)) if s]

    summary = str(data.get("summary", "")).strip()
    return CompareInsightContent(
        summary=summary,
        improved_themes=_themes(data.get("improved_themes")),
        regressed_themes=_themes(data.get("regressed_themes")),
    )
