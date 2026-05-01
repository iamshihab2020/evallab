"""Code Review v1 seed dataset.

12 short code snippets (Python + JS) with a real defect each, plus two
agents that disagree on review style. The contrast is meant to surface in
the *completeness* and *tone* dimensions of the judge's rubric: both
agents tend to find the actual bug (accuracy ≈ tied), but the pedantic
reviewer buries the real issue under nits and adopts a harsh voice.

Run as a CLI:    uv run python -m src.seeds.code_review_v1
Hit endpoint:    POST /api/v1/seeds/code-review-v1
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

SEED_TEST_SET_NAME = "Code Review v1"
SEED_TEST_SET_DESCRIPTION = (
    "12 short Python and JavaScript snippets, each with a real defect — "
    "bugs, security holes, style issues, perf traps, and edge-case gaps. "
    "Stress-tests an agent's ability to triage what actually matters."
)
SEED_TEST_SET_DOMAIN_CONTEXT = (
    "These are short snippets a junior engineer pasted into chat asking for "
    "review. They want actionable feedback they can apply right away. Tone "
    "should be respectful and educational, never condescending. The agent "
    "should distinguish a blocking issue (a bug, a security hole) from a "
    "minor style suggestion. Out-of-scope: rewriting entire architectures, "
    "renaming things across the codebase."
)


class SeedCase(TypedDict):
    input: str
    category: str
    expected_behavior: str


SEED_CASES: list[SeedCase] = [
    # --- BUG (3) ---
    {
        "input": (
            "review this please:\n"
            "for i in range(len(arr) - 1):\n"
            "    print(arr[i])"
        ),
        "category": "bug",
        "expected_behavior": (
            "Identify the off-by-one: the last element is skipped. Suggest "
            "`range(len(arr))` or, better, iterating directly with `for x in arr`. "
            "This is a real bug — should be flagged as blocking, not buried."
        ),
    },
    {
        "input": (
            "is this fine?\n"
            "def append(item, items=[]):\n"
            "    items.append(item)\n"
            "    return items"
        ),
        "category": "bug",
        "expected_behavior": (
            "Flag the mutable-default-argument trap: the list is shared across "
            "calls. Suggest the `items=None` / `if items is None: items = []` "
            "pattern. Real bug, blocking."
        ),
    },
    {
        "input": (
            "tell me what's wrong:\n"
            "items.forEach(async (item) => {\n"
            "    await save(item);\n"
            "});"
        ),
        "category": "bug",
        "expected_behavior": (
            "Note that `forEach` doesn't await — saves run concurrently and the "
            "outer code doesn't wait. Suggest `for...of` with await for sequential, "
            "or `Promise.all(items.map(save))` if order doesn't matter. Blocking."
        ),
    },
    # --- SECURITY (3) ---
    {
        "input": (
            "this works in my tests:\n"
            "cursor.execute(\"SELECT * FROM users WHERE name = '\" + name + \"'\")"
        ),
        "category": "security",
        "expected_behavior": (
            "SQL injection — must be flagged immediately and clearly as a security "
            "blocker. Suggest a parameterized query: "
            "`cursor.execute(\"SELECT * FROM users WHERE name = %s\", (name,))`. "
            "Should NOT bury this under style nits."
        ),
    },
    {
        "input": (
            "looks ok?\n"
            "API_KEY = \"sk_live_abc123xyz789\"\n"
            "def call(): requests.get(URL, headers={'Authorization': API_KEY})"
        ),
        "category": "security",
        "expected_behavior": (
            "Hardcoded secret — flag as a credential-leak issue. Suggest moving to "
            "an environment variable (`os.environ[\"API_KEY\"]`) or a secret "
            "manager, and rotating the key since it's been committed."
        ),
    },
    {
        "input": (
            "rendering user message:\n"
            "element.innerHTML = userMessage;"
        ),
        "category": "security",
        "expected_behavior": (
            "XSS risk — `innerHTML` with untrusted input executes arbitrary HTML/JS. "
            "Suggest `textContent` for plain text, or a sanitizer (DOMPurify) if "
            "rich content is required."
        ),
    },
    # --- PERF (2) ---
    {
        "input": (
            "is this slow?\n"
            "result = []\n"
            "for x in big_list:\n"
            "    if x not in result:\n"
            "        result.append(x)"
        ),
        "category": "perf",
        "expected_behavior": (
            "Note the O(n²) cost: `not in result` is linear in a list. Suggest a "
            "set for membership checks, or `list(dict.fromkeys(big_list))` if "
            "insertion order matters. Should frame as a suggestion, not a blocker, "
            "and ask about expected list size before insisting."
        ),
    },
    {
        "input": (
            "feels slow on big files:\n"
            "for line in lines:\n"
            "    if re.search(r'^ERROR.*\\d+$', line):\n"
            "        handle(line)"
        ),
        "category": "perf",
        "expected_behavior": (
            "The regex is re-compiled (well, looked up + cached internally) each "
            "iteration. Suggest hoisting `pattern = re.compile(...)` outside the "
            "loop. Minor — frame as a suggestion, not a blocker."
        ),
    },
    # --- STYLE (2) ---
    {
        "input": (
            "any feedback?\n"
            "def calc(a, b, c):\n"
            "    x = a * 0.05\n"
            "    y = b - x\n"
            "    return y * c"
        ),
        "category": "style",
        "expected_behavior": (
            "Logic is fine; the readability is the issue. Suggest meaningful names "
            "(rate, base, quantity) and a docstring. Should explicitly note this "
            "is a SUGGESTION, not a blocker — no behavior change."
        ),
    },
    {
        "input": (
            "review:\n"
            "if status == 3:\n"
            "    process()"
        ),
        "category": "style",
        "expected_behavior": (
            "Magic number. Suggest a named constant or enum (e.g. "
            "`Status.SHIPPED`). Style improvement, not a blocker; ask if a status "
            "enum already exists in the codebase before insisting."
        ),
    },
    # --- EDGE (2) ---
    {
        "input": (
            "what could go wrong?\n"
            "def average(numbers):\n"
            "    return sum(numbers) / len(numbers)"
        ),
        "category": "edge",
        "expected_behavior": (
            "ZeroDivisionError on empty input. Suggest an explicit guard "
            "(`if not numbers: return 0` or raise `ValueError`) or use "
            "`statistics.mean` and let it raise. Real edge-case bug — blocking."
        ),
    },
    {
        "input": (
            "splitting names:\n"
            "first, last = name.split(' ')"
        ),
        "category": "edge",
        "expected_behavior": (
            "Breaks on single-word names, multi-word last names, multiple spaces. "
            "Suggest `name.split(' ', 1)` plus a length check, or treating name as "
            "a single field. Real bug for any non-trivial input — blocking."
        ),
    },
]


SEED_AGENTS: list[dict[str, object]] = [
    {
        "name": "Code Reviewer v1 — Pedantic",
        "system_prompt": (
            "You are a code reviewer. Your job is to find every issue in the snippet, "
            "no matter how small, and demand it be fixed. Be direct, blunt, and uncompromising. "
            "Flag every issue as blocking. Don't soften feedback; the engineer needs to learn. "
            "Always list every nit you can find — naming, formatting, organization. "
            "Do not ask clarifying questions; trust your read of the code."
        ),
        "model": "llama-3.3-70b-versatile",
        "temperature": 0.5,
        "max_tokens": 320,
    },
    {
        "name": "Code Reviewer v2 — Pragmatic",
        "system_prompt": (
            "You are a code reviewer who treats reviews as collaboration, not gatekeeping. "
            "Lead with the most important issue. Distinguish BLOCKERS (bugs, security holes, "
            "data loss risks) from SUGGESTIONS (style, naming, minor perf). Label each clearly. "
            "If the snippet's intent is ambiguous, ask a single clarifying question before "
            "piling on suggestions. Tone is respectful and educational — never condescending."
        ),
        "model": "llama-3.3-70b-versatile",
        "temperature": 0.5,
        "max_tokens": 320,
    },
]


async def seed_code_review_v1(db: AsyncSession) -> SeedLoadResult:
    """Idempotent: checks for an existing test set by name."""

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

    ts = TestSet(
        name=SEED_TEST_SET_NAME,
        description=SEED_TEST_SET_DESCRIPTION,
        domain_context=SEED_TEST_SET_DOMAIN_CONTEXT,
    )
    db.add(ts)
    await db.flush()

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
        result = await seed_code_review_v1(db)
        if result.already_loaded:
            print(f"already loaded — test_set_id={result.test_set_id}")
        else:
            print(
                f"loaded {len(SEED_CASES)} cases + {len(SEED_AGENTS)} agents — "
                f"test_set_id={result.test_set_id}"
            )


if __name__ == "__main__":
    asyncio.run(_run_cli())
