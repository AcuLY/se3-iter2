"""Planner node — Plan-and-Execute strategy.

Given the user goal (and optionally prior reflections), produce a list of
ordered steps.  Each step declares which tool(s) it expects to use and a
short rationale.  Deterministic MOCK path ensures the entire graph runs
without any external API keys."""
from __future__ import annotations

import uuid
from typing import Any

from .llm import LLMClient, parse_goal
from .state import AgentState, PlanStep, Reflection
from .tracing import TraceBus, TraceEvent


_PLAN_SYS = (
    "You are a meticulous travel planner.  Break the user goal into "
    "3-6 ordered steps.  Each step should call at most two tools from: "
    "weather.get_forecast, flights.search, places.nearby, fx.convert, web_search.query. "
    "Return JSON with key 'steps' (array).  Each step: {id, title, rationale, needs_tools, depends_on}."
)


def _plan_schema_hint() -> str:
    return (
        'Schema: {"steps":[{"id":"s1","title":"...","rationale":"...",'
        '"needs_tools":["weather.get_forecast"],"depends_on":[]}]}'
    )


def _mock_plan(parsed: dict[str, Any], reflections: list[Reflection]) -> dict[str, Any]:
    city = parsed.get("city", "目的地")
    days = parsed.get("days", 3)
    steps = [
        {"id": "s1", "title": f"了解 {city} 未来 {days} 天天气",
         "rationale": "行程安排需要结合天气", "needs_tools": ["weather.get_forecast"],
         "depends_on": []},
        {"id": "s2", "title": f"筛选 {city} 值得一去的景点",
         "rationale": "基于用户偏好给出兴趣点清单",
         "needs_tools": ["places.nearby"], "depends_on": ["s1"]},
        {"id": "s3", "title": "预估交通方案",
         "rationale": "检索起点到 {city} 的航班/车次".replace("{city}", city),
         "needs_tools": ["flights.search"], "depends_on": []},
        {"id": "s4", "title": "汇总预算与货币换算",
         "rationale": "若用户指定了外币预算则换算到人民币",
         "needs_tools": ["fx.convert"], "depends_on": ["s3"]},
        {"id": "s5", "title": "综合信息并撰写逐日行程",
         "rationale": "整合前序步骤产出最终行程",
         "needs_tools": [], "depends_on": ["s1", "s2", "s3", "s4"]},
    ]
    # Reflection-aware replan — if the latest reflection recommended replan,
    # prepend a diagnostic step so the change is visible.
    if reflections and reflections[-1].decision == "replan":
        steps.insert(0, {
            "id": f"r{len(reflections)}",
            "title": "根据反思调整资料来源",
            "rationale": reflections[-1].note,
            "needs_tools": ["web_search.query"],
            "depends_on": [],
        })
    return {"steps": steps}


def run_planner(state: AgentState, llm: LLMClient, bus: TraceBus | None = None) -> AgentState:
    parsed = state.parsed_goal or parse_goal(state.user_goal)
    user_msg = (
        f"Goal: {state.user_goal}\n"
        f"Parsed: city={parsed['city']} days={parsed['days']} budget={parsed['budget']}\n"
        f"Prior reflections ({len(state.reflections)}):\n"
        + "\n".join(f"- step {r.step_id}: {r.note} (score={r.score:.2f}, decision={r.decision})"
                    for r in state.reflections[-3:])
    )
    data = llm.complete_json(
        system=_PLAN_SYS,
        user=user_msg,
        schema_hint=_plan_schema_hint(),
        mock_factory=lambda: _mock_plan(parsed, state.reflections),
    )

    raw_steps = data.get("steps") or data.get("plan") or []
    if not isinstance(raw_steps, list) or not raw_steps:
        raw_steps = _mock_plan(parsed, state.reflections)["steps"]
    steps: list[PlanStep] = []
    for raw in raw_steps:
        if not isinstance(raw, dict):
            continue
        sid = str(raw.get("id") or f"s{uuid.uuid4().hex[:4]}")
        steps.append(PlanStep(
            id=sid,
            title=str(raw.get("title") or "step"),
            rationale=str(raw.get("rationale") or ""),
            needs_tools=[str(t) for t in raw.get("needs_tools") or []],
            depends_on=[str(d) for d in raw.get("depends_on") or []],
        ))

    # preserve any already-completed steps when replanning
    done_by_id = {s.id: s for s in state.plan if s.status == "done"}
    merged: list[PlanStep] = []
    for s in steps:
        if s.id in done_by_id:
            merged.append(done_by_id[s.id])
        else:
            merged.append(s)

    state.parsed_goal = parsed
    state.plan = merged
    # jump to first pending step
    idx = next((i for i, s in enumerate(merged) if s.status != "done"), len(merged))
    state.current_step_idx = idx
    if bus:
        bus.emit(TraceEvent(kind="plan", node="planner",
                            data={"steps": [s.model_dump() for s in merged],
                                  "start_idx": idx,
                                  "replan_count": state.replan_count}))
    return state
