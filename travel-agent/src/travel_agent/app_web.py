"""Gradio web visualization for the travel agent.

Layout:
  ┌─ Goal input ─┐   ┌─ Plan tree ─┐
  │              │   │              │
  ├─ Run button ─┤   ├─ ReAct log  ─┤
  │              │   │              │
  ├─ Reflections ┤   └─ Final markdown ┘
"""
from __future__ import annotations

import asyncio
import json
import threading
from typing import Any

import gradio as gr

from .graph import run_agent
from .llm import LLMClient
from .state import AgentState
from .tracing import TraceBus, TraceEvent


def _fmt_plan(state: AgentState | None) -> str:
    if not state or not state.plan:
        return "_等待计划..._"
    lines = []
    for i, s in enumerate(state.plan):
        icon = {"pending": "⏳", "running": "▶", "done": "✅",
                "failed": "❌", "replanned": "♻️"}.get(s.status, "?")
        cur = "**" if i == state.current_step_idx and not state.finished else ""
        tools = f" · tools: {', '.join(s.needs_tools)}" if s.needs_tools else ""
        lines.append(f"- {icon} {cur}{s.title}{cur}{tools}")
    return "\n".join(lines)


def _fmt_reflections(state: AgentState | None) -> str:
    if not state or not state.reflections:
        return "_无反思记录_"
    return "\n".join(
        f"- step **{r.step_id}** score {r.score:.2f} → `{r.decision}` — {r.note}"
        for r in state.reflections
    )


def _fmt_trace(events: list[TraceEvent]) -> str:
    out = []
    for ev in events[-40:]:
        d = ev.data or {}
        if ev.kind == "plan":
            out.append(f"📋 plan: {len(d.get('steps', []))} steps (replan={d.get('replan_count')})")
        elif ev.kind == "step_start":
            out.append(f"▶ step: **{d.get('step', {}).get('title')}**")
        elif ev.kind == "react_thought":
            out.append(f"💭 {d.get('thought')} _(action: {d.get('action')} {d.get('tool') or ''})_")
        elif ev.kind == "react_observation":
            ob = d.get("observation", {})
            status = "✅" if ob.get("ok") else "❌"
            out.append(f"{status} `{d.get('tool')}` → {_short(ob)}")
        elif ev.kind == "step_end":
            out.append(f"⏹ step `{d.get('step_id')}` — {d.get('status')}")
        elif ev.kind == "reflection":
            out.append(f"🪞 score={d.get('score'):.2f} decision=`{d.get('decision')}` — {d.get('note')}")
        elif ev.kind == "route":
            out.append(f"↪ route: **{d.get('decision')}**")
        elif ev.kind == "final":
            out.append(f"📄 itinerary {d.get('itinerary_len')} chars")
    return "\n\n".join(out) or "_尚无事件_"


def _short(ob: dict[str, Any]) -> str:
    try:
        if ob.get("ok"):
            return f"ok · {json.dumps(ob.get('result', {}), ensure_ascii=False)[:120]}…"
        return f"fail · {ob.get('error')}"
    except Exception:  # noqa: BLE001
        return str(ob)[:120]


async def _run_and_stream(goal: str):
    bus = TraceBus()
    llm = LLMClient()

    events: list[TraceEvent] = []

    async def collector():
        async for ev in bus.stream():
            events.append(ev)

    collect_task = asyncio.create_task(collector())
    agent_task = asyncio.create_task(run_agent(goal, bus=bus, llm=llm))

    last_state: AgentState | None = None
    while not agent_task.done():
        yield (_fmt_plan(last_state), _fmt_trace(events),
               _fmt_reflections(last_state), "_运行中..._",
               json.dumps({"events": len(events)}, ensure_ascii=False))
        await asyncio.sleep(0.25)

    last_state = agent_task.result()
    bus.close()
    await collect_task
    summary = {
        "token_usage": llm.token_usage.to_dict(),
        "tool_calls": len(last_state.tool_calls),
        "replans": last_state.replan_count,
    }
    yield (_fmt_plan(last_state), _fmt_trace(events),
           _fmt_reflections(last_state),
           last_state.final_itinerary or "_空_",
           json.dumps(summary, ensure_ascii=False, indent=2))


def build_interface() -> gr.Blocks:
    with gr.Blocks(title="Travel Agent — Plan/ReAct/Reflect") as demo:
        gr.Markdown("# 🧭 旅行规划 Agent\nPlan-and-Execute + ReAct + Reflexion 的融合示例。")
        with gr.Row():
            goal = gr.Textbox(label="旅行目标", value="杭州 3 天，预算 3000，偏好美食",
                              lines=2, interactive=True)
        run_btn = gr.Button("🚀 开始规划", variant="primary")
        with gr.Row():
            with gr.Column():
                plan_md = gr.Markdown("_等待启动..._", label="计划")
                reflect_md = gr.Markdown("_无反思记录_", label="Reflexion")
            trace_md = gr.Markdown("_事件流_", label="ReAct Trace")
        final_md = gr.Markdown("_最终行程_", label="最终行程")
        summary = gr.Code(label="Summary", value="{}", language="json")

        run_btn.click(
            _run_and_stream,
            inputs=[goal],
            outputs=[plan_md, trace_md, reflect_md, final_md, summary],
        )
    return demo


def main() -> None:
    build_interface().launch(server_name="0.0.0.0", server_port=7860, share=False,
                              show_error=True)


if __name__ == "__main__":
    main()
