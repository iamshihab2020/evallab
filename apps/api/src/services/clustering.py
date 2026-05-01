"""Group low-scoring case results into thematic failure clusters via LLM."""
from __future__ import annotations

import logging
from uuid import UUID

from src.models import CaseResult
from src.schemas import FailureCluster

from .llm import call_llm_json, domain_context_block

logger = logging.getLogger(__name__)

CLUSTER_SYSTEM_TEMPLATE = """You are an expert at analyzing AI agent failures. Your job is to group failed cases by what the AGENT did wrong - not by what the user asked about.

CRITICAL: Cluster by the agent's failure mode, NOT by user topic.
- Bad theme: "Refund inquiries" (this is a user topic - useless for fixing the agent)
- Good theme: "Hallucinated refund amounts" (this is a failure mode - points to a fix)
(The example above is from one possible domain; invent themes that fit the actual failures you see.)

INPUT: Each case includes the user's INPUT, the AGENT_OUTPUT, and the JUDGE_REASONING. The JUDGE_REASONING is your strongest signal - the judge has already identified what failed. Use it as the primary clustering basis; use input/output as supporting context.

THEME GUIDELINES:
- Short noun phrase, max 6 words. Specific beats brief.
- Good shape (illustrative only - invent themes that fit your failures): "Missing empathy in complaints", "Failed to ask for order ID", "Hallucinated policy details"
- Bad: "Tone issues" (too vague), "Refund inquiries" (user topic), "Agent doesn't ask for clarification" (sentence, not noun phrase)

CLUSTERING RULES:
- Aim for one cluster per ~3-5 failures, 1-5 clusters total. Fewer when failures are homogeneous.
- Every input case_result_id must appear in exactly one cluster. Never invent IDs.
- If a case is genuinely unique, place it in the closest-matching cluster - do not create one-off clusters.
- Sort clusters largest-first (most case_result_ids first).

__DOMAIN_CONTEXT_BLOCK__Return ONLY a JSON object of this shape, no other text:
{
  "clusters": [
    {
      "theme": "<short noun phrase, max 6 words>",
      "summary": "<one sentence explaining the shared failure mode AND what the agent should do instead>",
      "case_result_ids": ["<uuid>", "<uuid>", ...]
    }
  ]
}
"""


def build_cluster_system(domain_context: str | None) -> str:
    """Inject the optional DOMAIN CONTEXT block into the cluster system prompt."""
    return CLUSTER_SYSTEM_TEMPLATE.replace(
        "__DOMAIN_CONTEXT_BLOCK__", domain_context_block(domain_context),
    )


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
    domain_context: str | None = None,
) -> list[FailureCluster]:
    """Cluster low-scoring cases. Returns empty list if no failures."""
    if not failures:
        return []

    valid_ids = {cr.id for cr in failures}
    user_prompt = _build_user_prompt(failures)

    data, _latency, _usage = await call_llm_json(
        model=model,
        system=build_cluster_system(domain_context),
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
