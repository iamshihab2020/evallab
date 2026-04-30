"""Group low-scoring case results into thematic failure clusters via LLM."""
from __future__ import annotations

import logging
from uuid import UUID

from src.models import CaseResult
from src.schemas import FailureCluster

from .llm import call_llm_json

logger = logging.getLogger(__name__)

CLUSTER_SYSTEM = """You are an expert at analyzing AI agent failures.

You will receive a list of failed cases (each with an ID, the user's input, the
agent's output, and the judge's reasoning for the low score). Group them into
3-5 thematic clusters by ROOT CAUSE — not by surface text similarity.

Examples of good cluster themes:
- "Missing empathy in complaints"
- "Failed to ask for order ID"
- "Hallucinated policy details"

Return ONLY a JSON object of this exact shape, no other text:
{
  "clusters": [
    {
      "theme": "<short noun phrase, max 6 words>",
      "summary": "<one sentence explaining the shared failure mode>",
      "case_result_ids": ["<uuid>", "<uuid>", ...]
    },
    ...
  ]
}

Rules:
- Every case_result_id must come from the input. Never invent IDs.
- Every input case must appear in exactly one cluster.
- Aim for 3-5 clusters. Fewer is fine if the failures are homogeneous.
- If only 1-2 cases, you may return a single cluster.
"""


def _build_user_prompt(failures: list[CaseResult]) -> str:
    blocks = []
    for cr in failures:
        ti = cr.test_case
        blocks.append(
            f"--- case_result_id: {cr.id} ---\n"
            f"INPUT: {ti.input if ti else '(unknown)'}\n"
            f"AGENT_OUTPUT: {(cr.agent_output or '').strip()[:600]}\n"
            f"JUDGE_SCORE: {cr.judge_score}\n"
            f"JUDGE_REASONING: {(cr.judge_reasoning or '').strip()}",
        )
    return "FAILED CASES:\n\n" + "\n\n".join(blocks)


async def cluster_failures(
    *,
    model: str,
    failures: list[CaseResult],
) -> list[FailureCluster]:
    """Cluster low-scoring cases. Returns empty list if no failures."""
    if not failures:
        return []

    valid_ids = {cr.id for cr in failures}
    user_prompt = _build_user_prompt(failures)

    data, _latency = await call_llm_json(
        model=model,
        system=CLUSTER_SYSTEM,
        user=user_prompt,
        temperature=0.2,
        max_tokens=1200,
    )

    raw_clusters = data.get("clusters", [])
    if not isinstance(raw_clusters, list):
        raise RuntimeError(f"clustering: 'clusters' is not a list, got {type(raw_clusters)}")

    out: list[FailureCluster] = []
    for c in raw_clusters:
        if not isinstance(c, dict):
            continue
        theme = str(c.get("theme", "")).strip()
        summary = str(c.get("summary", "")).strip()
        raw_ids = c.get("case_result_ids", [])
        if not theme or not isinstance(raw_ids, list):
            continue
        kept_ids: list[UUID] = []
        for rid in raw_ids:
            try:
                uid = UUID(str(rid))
            except (ValueError, TypeError):
                continue
            if uid in valid_ids:
                kept_ids.append(uid)
        if not kept_ids:
            continue
        out.append(FailureCluster(theme=theme, summary=summary, case_result_ids=kept_ids))

    return out
