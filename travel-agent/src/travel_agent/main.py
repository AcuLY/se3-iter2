"""CLI entry point with a live `rich` visualization of the agent's state."""
from __future__ import annotations

import asyncio
import json
import sys
from typing import Any

import click
from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.layout import Layout
from rich.markdown import Markdown

from .graph import run_agent
from .llm import LLMClient
from .state import AgentState
from .tracing import TraceBus, TraceEvent


def _build_layout() -> Layout:
    layout = Layout()
    layout.split_column(
        Layout(name="header", size=3),
        Layout(name="body"),
        Layout(name="footer", size=8),
    )
    layout["body"].split_row(
        Layout(name="plan", ratio=1),
        Layout(name="trace", ratio=2),
    )
    return layout


def _render(layout: Layout, events: list[TraceEvent], state: AgentState | None) -> None:
    layout["header"].update(Panel(
        Text.from_markup(
            f"[bold cyan]Travel Agent[/]  goal: [white]{state.user_goal if state else ''}[/]  "
            f"replans: {state.replan_count if state else 0}  "
            f"step: {state.current_step_idx + 1 if state else 0}/{len(state.plan) if state else 0}"
        ),
    ))

    plan_table = Table(title="计划", expand=True, show_lines=False)
    plan_table.add_column("#", width=3)
    plan_table.add_column("title", overflow="fold")
    plan_table.add_column("status", width=10)
    if state:
        for i, s in enumerate(state.plan):
            marker = "▶" if i == state.current_step_idx and not state.finished else " "
            plan_table.add_row(f"{marker} {i + 1}", s.title, s.status)
    layout["plan"].update(Panel(plan_table, title="Plan-and-Execute"))

    trace_table = Table(title="ReAct Trace", expand=True)
    trace_table.add_column("ts", width=10)
    trace_table.add_column("node", width=10)
    trace_table.add_column("detail", overflow="fold")
    for ev in events[-18:]:
        trace_table.add_row(f"{ev.ts % 1000:.2f}", f"{ev.node}", _fmt_event(ev))
    layout["trace"].update(Panel(trace_table, title="Reasoning stream"))

    reflections = Table(expand=True)
    reflections.add_column("step", width=6)
    reflections.add_column("score", width=6)
    reflections.add_column("decision", width=10)
    reflections.add_column("note", overflow="fold")
    if state:
        for r in state.reflections[-4:]:
            reflections.add_row(r.step_id, f"{r.score:.2f}", r.decision, r.note)
    layout["footer"].update(Panel(reflections, title="Reflexion"))


def _fmt_event(ev: TraceEvent) -> str:
    d = ev.data or {}
    if ev.kind == "plan":
        return f"plan: {len(d.get('steps', []))} steps (replan={d.get('replan_count', 0)})"
    if ev.kind == "step_start":
        return f"▶ step {d.get('step', {}).get('title')}"
    if ev.kind == "react_thought":
        return f"💭 {d.get('thought')[:90]} → {d.get('action')} {d.get('tool') or ''}"
    if ev.kind == "react_observation":
        ob = d.get("observation", {})
        marker = "✅" if ob.get("ok") else "❌"
        return f"{marker} {d.get('tool')} latency={ob.get('latency_ms', '-')}ms"
    if ev.kind == "step_end":
        return f"⏹ step {d.get('step_id')} → {d.get('status')}"
    if ev.kind == "reflection":
        return f"🪞 score={d.get('score'):.2f} decision={d.get('decision')} — {d.get('note')}"
    if ev.kind == "route":
        return f"↪ {d.get('decision')} (step_idx={d.get('current_step_idx')})"
    if ev.kind == "final":
        return f"📄 itinerary {d.get('itinerary_len')} chars"
    return json.dumps(d, ensure_ascii=False)[:140]


async def _run_cli(goal: str, emit_json: bool) -> AgentState:
    bus = TraceBus()
    llm = LLMClient()
    console = Console()
    events: list[TraceEvent] = []
    current_state: AgentState | None = None

    # Run agent in background and update the live view as events arrive.
    layout = _build_layout()
    stop = asyncio.Event()

    async def drain_events():
        async for ev in bus.stream():
            events.append(ev)
            if ev.kind == "plan":
                # rebuild state synthetic view; real state updates happen via return value
                pass

    agent_task = asyncio.create_task(run_agent(goal, bus=bus, llm=llm))
    drain_task = asyncio.create_task(drain_events())

    with Live(layout, refresh_per_second=6, console=console) as live:
        while not agent_task.done():
            _render(layout, events, current_state)
            live.refresh()
            try:
                await asyncio.wait_for(asyncio.shield(agent_task), timeout=0.2)
            except asyncio.TimeoutError:
                continue
        current_state = agent_task.result()
        _render(layout, events, current_state)
        live.refresh()

    stop.set()
    bus.close()
    await drain_task

    console.rule("[bold green]Final Itinerary[/]")
    console.print(Markdown(current_state.final_itinerary or "_empty_"))
    if emit_json:
        print(json.dumps({
            "itinerary": current_state.final_itinerary,
            "plan": [s.model_dump() for s in current_state.plan],
            "tool_calls": [t.model_dump() for t in current_state.tool_calls],
            "reflections": [r.model_dump() for r in current_state.reflections],
            "token_usage": llm.token_usage.to_dict(),
        }, ensure_ascii=False, indent=2))
    return current_state


@click.command()
@click.option("--goal", "-g", default="杭州 3 天，预算 3000，偏好美食",
              help="Natural-language travel goal.")
@click.option("--json/--no-json", "emit_json", default=False,
              help="Also emit a machine-readable JSON summary at the end.")
def cli(goal: str, emit_json: bool):
    """Run the travel planning agent with live CLI visualization."""
    state = asyncio.run(_run_cli(goal, emit_json))
    if not state.final_itinerary:
        sys.exit(2)


if __name__ == "__main__":
    cli()
