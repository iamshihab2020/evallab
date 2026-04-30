"""SMS Customer Support v1 seed dataset.

30 test cases across four categories (refund, complaint, qa, nonsense),
plus two agents that should behave differently on emotional / complaint
cases — gives the Compare view something interesting on day one.

Run as a CLI:    uv run python -m src.seeds.sms_support_v1
Hit endpoint:    POST /api/v1/seeds/sms-support-v1
Both are idempotent (checked by test set name).
"""

from __future__ import annotations

import asyncio
from typing import TypedDict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import AsyncSessionLocal
from src.models import Agent, AgentVersion, TestCase, TestSet
from src.schemas import SeedLoadResult

SEED_TEST_SET_NAME = "SMS Customer Support v1"
SEED_TEST_SET_DESCRIPTION = (
    "30 SMS-style customer support cases covering refunds, complaints, "
    "Q&A, and nonsense inputs. Tone varies (polite ↔ rude), length varies, "
    "and typos are common."
)


class SeedCase(TypedDict):
    input: str
    category: str
    expected_behavior: str


SEED_CASES: list[SeedCase] = [
    # --- REFUND (10) ---
    {
        "input": "I want a refund for order #12345 it arrived broken",
        "category": "refund",
        "expected_behavior": (
            "Acknowledge the issue, ask for a photo as proof, explain the refund process at "
            "a high level, do NOT promise a refund unilaterally, polite tone."
        ),
    },
    {
        "input": "where my refund?? you said 5 days its been 2 weeks",
        "category": "refund",
        "expected_behavior": (
            "Acknowledge the delay, apologize, ask for the order number, offer to escalate "
            "to a human, do NOT make excuses, do NOT promise a specific timeline."
        ),
    },
    {
        "input": "Hi, I'd like to return order 88421 which I bought yesterday. The size doesn't fit. Thanks!",
        "category": "refund",
        "expected_behavior": (
            "Respond warmly, confirm the order number, explain the return process, mention "
            "return window if standard, ask about reason for return."
        ),
    },
    {
        "input": "can i get my money back the headphones stopped working after 3 days",
        "category": "refund",
        "expected_behavior": (
            "Empathize with the issue, ask for order number and a brief description of the "
            "fault, explain the warranty/return options, offer human handoff if needed."
        ),
    },
    {
        "input": "i ordered the blue one and got the red. refund please",
        "category": "refund",
        "expected_behavior": (
            "Apologize for the wrong item, ask for the order number, explain the exchange "
            "or refund options, do NOT make promises about replacements arriving by a date."
        ),
    },
    {
        "input": "is it possible to refund a gift i was sent if i don't have the order number?",
        "category": "refund",
        "expected_behavior": (
            "Acknowledge the unusual situation, explain that gift refunds typically need "
            "the giver's order number or email, offer to escalate to a human."
        ),
    },
    {
        "input": "REFUND NOW",
        "category": "refund",
        "expected_behavior": (
            "Stay polite, ask which order they're referring to and what happened, do NOT "
            "match the curt tone, do NOT promise a refund without context."
        ),
    },
    {
        "input": "hello, my partner ordered something on my account by mistake. how do i cancel and get refunded for order #99020? it hasnt shipped yet",
        "category": "refund",
        "expected_behavior": (
            "Acknowledge politely, confirm the order number, explain that pre-shipment "
            "cancellation is usually possible, offer to connect to a human to confirm and process."
        ),
    },
    {
        "input": "the discount code didnt apply at checkout, i want the difference refunded. order 11203",
        "category": "refund",
        "expected_behavior": (
            "Apologize for the friction, confirm the order number, explain that partial "
            "refunds for missed promo codes typically require human review, offer escalation."
        ),
    },
    {
        "input": "got two of the same shirt only ordered one. need to send one back",
        "category": "refund",
        "expected_behavior": (
            "Apologize for the duplicate, ask for the order number, explain the return-for-"
            "refund process, offer a prepaid label if the policy supports it (otherwise note "
            "you'll connect them to a human to confirm)."
        ),
    },
    # --- COMPLAINT (8) ---
    {
        "input": "u guys r scammers worst service ever",
        "category": "complaint",
        "expected_behavior": (
            "De-escalate, apologize for the experience, offer to connect to a human, do NOT "
            "match hostile tone, do NOT be defensive, do NOT make promises."
        ),
    },
    {
        "input": "this is the third time I've contacted you about my missing package and nobody is helping me",
        "category": "complaint",
        "expected_behavior": (
            "Acknowledge the frustration explicitly, apologize sincerely for repeated contacts, "
            "escalate to a human, ask for an order/reference number."
        ),
    },
    {
        "input": "your driver left my package in the rain. its destroyed.",
        "category": "complaint",
        "expected_behavior": (
            "Apologize, acknowledge the damage, ask for the order number and a photo, "
            "explain that a replacement or refund will be reviewed, offer human handoff."
        ),
    },
    {
        "input": "i waited on chat for 40 minutes and the agent disconnected. unbelievable.",
        "category": "complaint",
        "expected_behavior": (
            "Apologize for the wait and disconnection, acknowledge the frustration, ask "
            "what they originally needed help with, offer to handle it now or escalate."
        ),
    },
    {
        "input": "really disappointed. the product photos look NOTHING like what arrived",
        "category": "complaint",
        "expected_behavior": (
            "Empathize, apologize for the mismatch, ask for the order number and (optionally) "
            "a photo, explain the return options, offer to escalate."
        ),
    },
    {
        "input": "you charged my card twice. fix it.",
        "category": "complaint",
        "expected_behavior": (
            "Apologize, take it seriously (billing issues are sensitive), ask for the order "
            "number and the last 4 of the card, explain a human will review and reverse "
            "the duplicate charge, do NOT promise a specific refund timeline."
        ),
    },
    {
        "input": "tried to call but only got a robot. can ANYONE actually help me here???",
        "category": "complaint",
        "expected_behavior": (
            "Acknowledge frustration, apologize for the IVR experience, offer to help here "
            "directly OR connect to a human, ask what the underlying issue is."
        ),
    },
    {
        "input": "I've been a customer for 6 years and this is how you treat loyal buyers? thanks.",
        "category": "complaint",
        "expected_behavior": (
            "Acknowledge the long-term relationship and the disappointment, apologize, ask "
            "what specifically went wrong, offer human escalation."
        ),
    },
    # --- QA (8) ---
    {
        "input": "what are your business hours",
        "category": "qa",
        "expected_behavior": (
            "Give a factual answer if known, OR politely note it doesn't have that info "
            "and offer to connect to a human. Reply should be short and direct."
        ),
    },
    {
        "input": "do you ship to canada",
        "category": "qa",
        "expected_behavior": (
            "Answer factually if known, otherwise offer to connect to a human. Should NOT "
            "invent shipping info."
        ),
    },
    {
        "input": "whats the return window?",
        "category": "qa",
        "expected_behavior": (
            "Answer factually if known (otherwise note no info and offer human handoff). "
            "Do NOT make up specific day counts."
        ),
    },
    {
        "input": "are gift cards refundable",
        "category": "qa",
        "expected_behavior": (
            "Answer factually if policy is known; otherwise note that gift card policies "
            "are case-by-case and offer human handoff. Do NOT invent."
        ),
    },
    {
        "input": "how long does standard shipping usually take in the US?",
        "category": "qa",
        "expected_behavior": (
            "Either give a factual range if known, or honestly say it depends on the "
            "carrier/region and offer to check the order status with a human."
        ),
    },
    {
        "input": "can I change the shipping address after I've placed the order?",
        "category": "qa",
        "expected_behavior": (
            "Note that pre-shipment address changes are usually possible but require human "
            "confirmation, ask for the order number, offer escalation."
        ),
    },
    {
        "input": "do you have the X-200 in stock",
        "category": "qa",
        "expected_behavior": (
            "Note that real-time stock isn't visible to the agent, offer to connect to a "
            "human or point them to the website. Do NOT invent stock status."
        ),
    },
    {
        "input": "is the warranty extendable past 1 year?",
        "category": "qa",
        "expected_behavior": (
            "Answer factually if policy is known; otherwise note that extended warranty is "
            "case-by-case and offer human handoff."
        ),
    },
    # --- NONSENSE (4) ---
    {
        "input": "asdfgh",
        "category": "nonsense",
        "expected_behavior": (
            "Politely ask for clarification. Should NOT hallucinate a topic, should NOT "
            "make assumptions about what the user meant."
        ),
    },
    {
        "input": "🙄🙄🙄",
        "category": "nonsense",
        "expected_behavior": (
            "Politely ask the customer how it can help. Should NOT interpret the emojis as "
            "a complaint or compliment."
        ),
    },
    {
        "input": "test 123",
        "category": "nonsense",
        "expected_behavior": (
            "Treat as a non-substantive message, politely ask what they need help with."
        ),
    },
    {
        "input": "...",
        "category": "nonsense",
        "expected_behavior": (
            "Politely prompt the customer to share what they need. Should NOT guess or "
            "fabricate a topic."
        ),
    },
]


SEED_AGENTS: list[dict[str, object]] = [
    {
        "name": "Support Agent v1 — Concise",
        "system_prompt": (
            "You are a customer support agent for an e-commerce store. "
            "Be polite, helpful, and concise. "
            "If you don't have specific information, say so directly and offer to connect them to a human. "
            "Don't make promises about refunds, shipping, or policies — escalate to a human agent for those."
        ),
        "model": "llama-3.3-70b-versatile",
        "temperature": 0.7,
        "max_tokens": 256,
    },
    {
        "name": "Support Agent v2 — With Empathy",
        "system_prompt": (
            "You are an empathetic customer support agent for an e-commerce store. "
            "Always acknowledge the customer's feelings before addressing their issue. "
            "If the customer is frustrated or upset, validate their experience first. "
            "If you don't have specific information, say so and offer to connect to a human. "
            "Don't make promises about refunds, shipping, or policies — say you'll look into it and connect them to a human."
        ),
        "model": "llama-3.3-70b-versatile",
        "temperature": 0.7,
        "max_tokens": 256,
    },
]


async def seed_sms_support_v1(db: AsyncSession) -> SeedLoadResult:
    """Idempotent: checks for an existing test set by name. Returns
    `already_loaded=True` (with the existing IDs) or creates everything."""

    existing_ts = (
        await db.execute(select(TestSet).where(TestSet.name == SEED_TEST_SET_NAME))
    ).scalar_one_or_none()

    if existing_ts is not None:
        existing_agents = (
            await db.execute(
                select(Agent).where(Agent.name.in_([a["name"] for a in SEED_AGENTS]))
            )
        ).scalars().all()
        return SeedLoadResult(
            already_loaded=True,
            test_set_id=existing_ts.id,
            agent_ids=[a.id for a in existing_agents],
        )

    ts = TestSet(name=SEED_TEST_SET_NAME, description=SEED_TEST_SET_DESCRIPTION)
    db.add(ts)
    await db.flush()  # need ts.id

    for position, case in enumerate(SEED_CASES, start=1):
        db.add(
            TestCase(
                test_set_id=ts.id,
                input=case["input"],
                category=case["category"],
                expected_behavior=case["expected_behavior"],
                position=position,
            )
        )

    agent_ids: list[UUID] = []
    for agent_data in SEED_AGENTS:
        agent = Agent(**agent_data)
        db.add(agent)
        await db.flush()
        db.add(
            AgentVersion(
                agent_id=agent.id,
                version=1,
                system_prompt=agent.system_prompt,
                model=agent.model,
                temperature=agent.temperature,
                max_tokens=agent.max_tokens,
            ),
        )
        agent_ids.append(agent.id)

    await db.commit()
    await db.refresh(ts)

    return SeedLoadResult(already_loaded=False, test_set_id=ts.id, agent_ids=agent_ids)


async def _run_cli() -> None:
    async with AsyncSessionLocal() as db:
        result = await seed_sms_support_v1(db)
        if result.already_loaded:
            print(f"already loaded — test_set_id={result.test_set_id}")
        else:
            print(
                f"loaded {len(SEED_CASES)} cases + {len(SEED_AGENTS)} agents — "
                f"test_set_id={result.test_set_id}"
            )


if __name__ == "__main__":
    asyncio.run(_run_cli())
