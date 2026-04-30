"""Tests for execute_run: per-case error isolation + concurrency cap.

The runner's DB ops are mocked rather than using a real session. The behavior
under test is the orchestration logic (semaphore, error fan-out, status
transitions), not SQLAlchemy itself.
"""
from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest

from src.services import runner as runner_mod


class _FakeRun:
    def __init__(self, run_id: UUID) -> None:
        self.id = run_id
        self.test_set_id = uuid4()
        self.agent_id = uuid4()
        self.agent_version_id = uuid4()
        self.judge_model = "judge-x"
        self.status = "pending"
        self.total_cases = 0
        self.completed_cases = 0
        self.errored_cases = 0
        self.error: str | None = None
        self.completed_at = None


class _FakeAgent:
    name = "fake-agent"


class _FakeVersion:
    system_prompt = "you are a test agent"
    model = "test-model"
    temperature = 0.5
    max_tokens = 100


class _FakeCase:
    def __init__(self, idx: int) -> None:
        self.id = uuid4()
        self.input = f"case-{idx}"
        self.expected_behavior = f"expected-{idx}"


class _FakeTestSet:
    def __init__(self, n: int) -> None:
        self.cases = [_FakeCase(i) for i in range(n)]


class _FakeSession:
    """Tracks added CaseResult kwargs and run mutations across all calls."""

    def __init__(self, run: _FakeRun, test_set: _FakeTestSet) -> None:
        self._run = run
        self._test_set = test_set
        self._agent = _FakeAgent()
        self._version = _FakeVersion()
        self.added_case_results: list[dict[str, Any]] = []

    async def __aenter__(self) -> "_FakeSession":
        return self

    async def __aexit__(self, *_: Any) -> None:
        return None

    async def get(self, model: Any, _id: Any) -> Any:
        from src.models import Agent, AgentVersion, Run

        if model is Run:
            return self._run
        if model is Agent:
            return self._agent
        if model is AgentVersion:
            return self._version
        return None

    async def scalar(self, _stmt: Any) -> _FakeTestSet:
        # The runner's only scalar() call loads the test set with cases.
        return self._test_set

    async def execute(self, _stmt: Any) -> Any:
        # Runner uses execute() to apply the increment update on Run.
        # Apply the equivalent mutation manually so completed_cases/errored_cases stay accurate.
        # Stmt is opaque here, so we just bump counters by one each call.
        # The test checks final counters, so we don't reason about stmt structure.
        self._run.completed_cases += 1
        return None

    def add(self, obj: Any) -> None:
        # Capture CaseResult inserts.
        if obj.__class__.__name__ == "CaseResult":
            self.added_case_results.append(obj.__dict__.copy())

    async def commit(self) -> None:
        return None

    async def flush(self) -> None:
        return None


def _factory_for(session: _FakeSession):
    def factory() -> _FakeSession:
        return session

    return factory


@pytest.mark.asyncio
async def test_runner_happy_path_marks_completed() -> None:
    run = _FakeRun(uuid4())
    ts = _FakeTestSet(n=3)
    sess = _FakeSession(run, ts)

    async def fake_call_llm(**_: Any) -> tuple[str, int]:
        return "ok-output", 50

    async def fake_judge(**_: Any) -> tuple[int, str, str, int]:
        return 4, "good", "PROMPT", 60

    # Override the runner's update path: Session.execute is too opaque for the
    # default fake to know whether the case errored. Patch the increment by
    # hand via a wrapper.
    erroreds: list[bool] = []

    real_execute = sess.execute

    async def tracking_execute(stmt: Any) -> Any:
        # The increment statement contains errored_cases; we can't read it
        # robustly. Instead, the test asserts via case_result kwargs.
        return await real_execute(stmt)

    sess.execute = tracking_execute  # type: ignore[method-assign]

    with (
        patch("src.services.runner.call_llm", fake_call_llm),
        patch("src.services.runner.judge_response", fake_judge),
    ):
        await runner_mod.execute_run(run.id, _factory_for(sess))

    _ = erroreds
    assert run.status == "completed"
    assert run.completed_at is not None
    assert run.total_cases == 3
    assert len(sess.added_case_results) == 3
    # All three cases got a judge_score; none errored.
    for cr in sess.added_case_results:
        assert cr.get("judge_score") == 4
        assert cr.get("error") is None


@pytest.mark.asyncio
async def test_runner_per_case_errors_dont_fail_the_run() -> None:
    run = _FakeRun(uuid4())
    ts = _FakeTestSet(n=3)
    sess = _FakeSession(run, ts)

    call_count = {"i": 0}

    async def fake_call_llm(**_: Any) -> tuple[str, int]:
        i = call_count["i"]
        call_count["i"] += 1
        if i == 1:  # second case (index 1) blows up in agent call
            raise RuntimeError("network fart")
        return "ok-output", 50

    async def fake_judge(**_: Any) -> tuple[int, str, str, int]:
        return 5, "great", "PROMPT", 60

    with (
        patch("src.services.runner.call_llm", fake_call_llm),
        patch("src.services.runner.judge_response", fake_judge),
    ):
        await runner_mod.execute_run(run.id, _factory_for(sess))

    assert run.status == "completed", "one bad case should not fail the run"
    assert len(sess.added_case_results) == 3
    errored = [cr for cr in sess.added_case_results if cr.get("error")]
    succeeded = [cr for cr in sess.added_case_results if cr.get("judge_score") is not None]
    assert len(errored) == 1
    assert "network fart" in errored[0]["error"]
    assert len(succeeded) == 2


@pytest.mark.asyncio
async def test_runner_caps_concurrency_at_max_concurrent_cases() -> None:
    """At any moment, at most MAX_CONCURRENT_CASES agent calls are in flight."""
    run = _FakeRun(uuid4())
    n_cases = runner_mod.MAX_CONCURRENT_CASES * 3
    ts = _FakeTestSet(n=n_cases)
    sess = _FakeSession(run, ts)

    in_flight = 0
    peak = 0
    lock = asyncio.Lock()

    async def fake_call_llm(**_: Any) -> tuple[str, int]:
        nonlocal in_flight, peak
        async with lock:
            in_flight += 1
            peak = max(peak, in_flight)
        try:
            await asyncio.sleep(0.02)
            return "ok", 10
        finally:
            async with lock:
                in_flight -= 1

    async def fake_judge(**_: Any) -> tuple[int, str, str, int]:
        return 5, "ok", "P", 5

    with (
        patch("src.services.runner.call_llm", fake_call_llm),
        patch("src.services.runner.judge_response", fake_judge),
    ):
        await runner_mod.execute_run(run.id, _factory_for(sess))

    assert peak <= runner_mod.MAX_CONCURRENT_CASES, (
        f"peak concurrency {peak} exceeded cap {runner_mod.MAX_CONCURRENT_CASES}"
    )
    assert run.status == "completed"
    assert len(sess.added_case_results) == n_cases
