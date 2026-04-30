"""Markdown exporter for completed runs."""
from __future__ import annotations

from datetime import UTC, datetime

from src.schemas import CaseResultRead, RunDetail

# Map a score 1..5 to a sparkline-ish bar
_BAR_FULL = "█"
_BAR_EMPTY = "░"
_BAR_WIDTH = 24


def _human_dt(dt: datetime | None) -> str:
    if dt is None:
        return "n/a"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    # e.g. "2026-04-30 13:53 UTC"
    return dt.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")


def _human_duration(start: datetime | None, end: datetime | None) -> str:
    if start is None or end is None:
        return "n/a"
    total = int((end - start).total_seconds())
    if total < 60:
        return f"{total}s"
    m, s = divmod(total, 60)
    if m < 60:
        return f"{m}m {s}s"
    h, m = divmod(m, 60)
    return f"{h}h {m}m {s}s"


def _bar(value: float, total: int) -> str:
    if total <= 0:
        return _BAR_EMPTY * _BAR_WIDTH
    filled = round((value / total) * _BAR_WIDTH)
    filled = max(0, min(_BAR_WIDTH, filled))
    return _BAR_FULL * filled + _BAR_EMPTY * (_BAR_WIDTH - filled)


def _truncate(s: str | None, n: int = 1000) -> str:
    if not s:
        return ""
    s = s.strip()
    if len(s) <= n:
        return s
    return s[:n].rstrip() + "…"


def _quote_block(text: str) -> str:
    """Render `text` as a Markdown blockquote."""
    if not text:
        return "> _(empty)_"
    return "\n".join(f"> {line}" if line else ">" for line in text.split("\n"))


def _verdict(pass_rate: float, errored: int) -> str:
    if errored > 0 and pass_rate < 0.5:
        return "Needs work — high error rate and low pass rate."
    if pass_rate >= 0.9:
        return "Strong — most cases pass cleanly."
    if pass_rate >= 0.75:
        return "Solid — some cases need attention."
    if pass_rate >= 0.5:
        return "Mixed — about half passing."
    return "Weak — most cases failed the rubric."


def export_run_md(run: RunDetail) -> str:
    s = run.stats
    if s is None:
        return f"# EvalLab Run Report\n\nRun `{run.id}` is not completed yet."

    cr_by_id = {cr.id: cr for cr in run.case_results}
    duration = _human_duration(run.started_at, run.completed_at)

    # Latency stats over successful cases only
    agent_lats = [
        cr.agent_latency_ms for cr in run.case_results
        if cr.agent_latency_ms is not None and cr.error is None
    ]
    judge_lats = [
        cr.judge_latency_ms for cr in run.case_results
        if cr.judge_latency_ms is not None and cr.error is None
    ]
    avg_agent = sum(agent_lats) / len(agent_lats) if agent_lats else 0
    avg_judge = sum(judge_lats) / len(judge_lats) if judge_lats else 0

    # Best 3 cases (top scores), only if we have any successful
    successful = [
        cr for cr in run.case_results
        if cr.judge_score is not None and cr.error is None
    ]
    best_cases = sorted(successful, key=lambda c: -(c.judge_score or 0))[:3]

    lines: list[str] = []

    # === Header ============================================================
    lines += [
        f"# {run.test_set_name} × {run.agent_name}",
        "",
        f"_EvalLab run report · {_human_dt(run.completed_at)}_",
        "",
        "---",
        "",
    ]

    # === TL;DR =============================================================
    pass_pct = s.pass_rate * 100
    lines += [
        "## TL;DR",
        "",
        f"**{pass_pct:.0f}% pass rate** · "
        f"avg score **{s.avg_score:.2f}** · "
        f"**{s.successful_cases}/{s.total_cases}** cases scored"
        + (f" · **{s.errored_cases}** errored" if s.errored_cases else ""),
        "",
        f"> {_verdict(s.pass_rate, s.errored_cases)}",
        "",
    ]

    # === Configuration =====================================================
    lines += [
        "## Configuration",
        "",
        "| Field | Value |",
        "|-------|-------|",
        f"| Run ID | `{run.id}` |",
        f"| Test set | {run.test_set_name} |",
        f"| Agent | {run.agent_name} |",
        f"| Judge model | `{run.judge_model}` |",
        f"| Started | {_human_dt(run.started_at)} |",
        f"| Completed | {_human_dt(run.completed_at)} |",
        f"| Duration | {duration} |",
        f"| Avg agent latency | {avg_agent:,.0f} ms |",
        f"| Avg judge latency | {avg_judge:,.0f} ms |",
        "",
    ]

    # === Score distribution (visual) =======================================
    lines += [
        "## Score distribution",
        "",
        "```",
    ]
    for score in sorted(s.score_distribution):
        count = s.score_distribution[score]
        bar = _bar(count, s.successful_cases)
        lines.append(f"  {score}  {bar}  {count}")
    lines += ["```", ""]

    # === Per-category breakdown ============================================
    if s.per_category:
        lines += [
            "## Per-category breakdown",
            "",
            "| Category | N | Pass rate | Avg score |",
            "|----------|--:|----------:|----------:|",
        ]
        # Sort by avg score descending so strongest categories are at the top
        for cat, st in sorted(
            s.per_category.items(), key=lambda kv: -kv[1].avg_score,
        ):
            lines.append(
                f"| {cat} | {st.count} | {st.pass_rate:.0%} | {st.avg_score:.2f} |",
            )
        lines.append("")

    # === Worst cases =======================================================
    if s.worst_cases:
        lines += [
            f"## {min(5, len(s.worst_cases))} cases that need attention",
            "",
            "_Sorted lowest score first. Use these to find prompt weaknesses._",
            "",
        ]
        for i, w in enumerate(s.worst_cases, start=1):
            cr = cr_by_id.get(w.case_result_id)
            lines += _render_case_section(
                heading=f"### {i}. Score {w.judge_score} — {_truncate(w.input, 80)}",
                input_text=w.input,
                cr=cr,
                judge_reasoning=w.judge_reasoning,
            )

    # === Best cases (context) ==============================================
    if best_cases and best_cases[0].judge_score and best_cases[0].judge_score >= 4:
        lines += [
            "## What the agent does well",
            "",
            "_The 3 highest-scoring cases — keep prompting in this direction._",
            "",
        ]
        for i, cr in enumerate(best_cases, start=1):
            input_text = _extract_user_input(cr) or "(unknown input)"
            lines += _render_case_section(
                heading=f"### {i}. Score {cr.judge_score} — {_truncate(input_text, 80)}",
                input_text=input_text,
                cr=cr,
                judge_reasoning=cr.judge_reasoning,
            )

    # === Errors ============================================================
    errored = [cr for cr in run.case_results if cr.error]
    if errored:
        lines += [
            f"## Errors ({len(errored)})",
            "",
            "_Cases that threw before getting a judge score. Excluded from stats._",
            "",
        ]
        for i, cr in enumerate(errored, start=1):
            lines += [
                f"**{i}.** `{cr.error}`",
                "",
            ]

    # === Footer ============================================================
    lines += [
        "---",
        "",
        f"_Generated by EvalLab · run `{run.id}`_",
        "",
    ]

    return "\n".join(lines)


def _render_case_section(
    *,
    heading: str,
    input_text: str,
    cr: CaseResultRead | None,
    judge_reasoning: str | None,
) -> list[str]:
    """Render one case (input / output / reasoning) as Markdown."""
    out: list[str] = [heading, ""]

    out += ["**User input**", "", _quote_block(_truncate(input_text, 600)), ""]

    if cr and cr.agent_output:
        out += [
            "**Agent output**",
            "",
            "```",
            _truncate(cr.agent_output, 1200),
            "```",
            "",
        ]

    if judge_reasoning:
        out += [
            "**Judge reasoning**",
            "",
            f"_{_truncate(judge_reasoning, 400)}_",
            "",
        ]

    if cr and (cr.agent_latency_ms or cr.judge_latency_ms):
        meta_bits = []
        if cr.agent_latency_ms:
            meta_bits.append(f"agent {cr.agent_latency_ms:,} ms")
        if cr.judge_latency_ms:
            meta_bits.append(f"judge {cr.judge_latency_ms:,} ms")
        out += [f"<sub>`{' · '.join(meta_bits)}`</sub>", ""]

    return out


def _extract_user_input(cr: CaseResultRead) -> str:
    """The case input is buried inside agent_prompt_sent under `USER:\\n...`."""
    if not cr.agent_prompt_sent:
        return ""
    marker = "USER:\n"
    idx = cr.agent_prompt_sent.find(marker)
    if idx < 0:
        return cr.agent_prompt_sent
    return cr.agent_prompt_sent[idx + len(marker):].strip()
