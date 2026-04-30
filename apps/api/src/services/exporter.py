"""Markdown exporter for completed runs."""
from __future__ import annotations

from src.schemas import RunDetail


def export_run_md(run: RunDetail) -> str:
    s = run.stats
    if s is None:
        return f"# EvalLab Run Report\n\nRun `{run.id}` is not completed yet."

    lines: list[str] = [
        "# EvalLab Run Report",
        "",
        f"**Run ID:** `{run.id}`",
        f"**Test Set:** {run.test_set_name}",
        f"**Agent:** {run.agent_name}",
        f"**Judge:** {run.judge_model}",
        f"**Started:** {run.started_at.isoformat()}",
        f"**Completed:** {run.completed_at.isoformat() if run.completed_at else 'n/a'}",
        "",
        "## Summary",
        "",
        f"- **Pass rate:** {s.pass_rate:.1%}",
        f"- **Average score:** {s.avg_score:.2f}",
        f"- **Cases:** {s.total_cases} total, {s.successful_cases} scored, "
        f"{s.errored_cases} errored",
        "",
        "## Score Distribution",
        "",
        "| Score | Count |",
        "|-------|-------|",
    ]
    for score in sorted(s.score_distribution):
        lines.append(f"| {score} | {s.score_distribution[score]} |")

    lines += [
        "",
        "## Per-Category Breakdown",
        "",
        "| Category | Count | Pass Rate | Avg Score |",
        "|----------|-------|-----------|-----------|",
    ]
    for cat, st in s.per_category.items():
        lines.append(
            f"| {cat} | {st.count} | {st.pass_rate:.1%} | {st.avg_score:.2f} |",
        )

    lines += ["", "## Worst 5 Cases", ""]
    cr_by_id = {cr.id: cr for cr in run.case_results}
    for w in s.worst_cases:
        cr = cr_by_id.get(w.case_result_id)
        agent_output = cr.agent_output if cr else ""
        lines += [
            f"### Score {w.judge_score}",
            "",
            f"**Input:** {w.input}",
            "",
            f"**Agent output:** {agent_output}",
            "",
            f"**Judge reasoning:** {w.judge_reasoning or ''}",
            "",
        ]

    return "\n".join(lines)
