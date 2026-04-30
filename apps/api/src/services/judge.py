"""LLM-as-judge: scores an agent response 1-5 against the expected behavior."""
from __future__ import annotations

from .llm import call_llm_json

JUDGE_SYSTEM = """You are an expert evaluator of customer-support AI agents.
Your job is to score the agent's response against the expected behavior on a 1-5 scale.

SCORING RUBRIC:
1 = Bad. Wrong, harmful, rude, ignores the message, or fails the expected behavior entirely.
2 = Poor. Addresses the message but misses important aspects of the expected behavior.
3 = Okay. Addresses the message and meets some expected behavior, but has notable issues.
4 = Good. Meets the expected behavior with minor issues (tone, completeness).
5 = Excellent. Fully meets the expected behavior. Tone, accuracy, and completeness are all good.

Return ONLY a JSON object with exactly two fields, no other text:
{
  "score": <integer 1-5>,
  "reasoning": "<one short sentence explaining the score>"
}"""

JUDGE_USER_TEMPLATE = """CUSTOMER MESSAGE:
{input}

AGENT'S RESPONSE:
{agent_output}

EXPECTED BEHAVIOR (what a good response should do):
{expected_behavior}"""


async def judge_response(
    *,
    model: str,
    input: str,
    agent_output: str,
    expected_behavior: str,
) -> tuple[int, str, str, int]:
    """Score an agent response. Returns (score, reasoning, full_prompt_sent, latency_ms).

    Retries once if JSON parsing fails. Raises RuntimeError after both attempts fail.
    """
    user = JUDGE_USER_TEMPLATE.format(
        input=input, agent_output=agent_output, expected_behavior=expected_behavior,
    )
    full_prompt = f"SYSTEM:\n{JUDGE_SYSTEM}\n\nUSER:\n{user}"

    data, latency_ms = await call_llm_json(
        model=model,
        system=JUDGE_SYSTEM,
        user=user,
        temperature=0.0,
        max_tokens=200,
    )
    try:
        score = int(data["score"])
        reasoning = str(data["reasoning"])
    except (KeyError, ValueError, TypeError) as e:
        raise RuntimeError(f"judge response missing fields: {e}; got: {data}") from e
    if not 1 <= score <= 5:
        raise RuntimeError(f"judge score out of range: {score}")
    return score, reasoning, full_prompt, latency_ms
