"""LangGraph orchestration for the travel agent.

Graph:
    plan ──► route ──► execute ──► reflect ──► (replan | next | compose)

Each transition records an event on the shared `TraceBus`, which is what the
CLI (`rich`) and Gradio UI subscribe to.

We intentionally avoid LangGraph's experimental parallel features so the state
transitions are easy to visualize."""
from __future__ import annotations

import asyncio
from typing import Any

from langgraph.graph import END, StateGraph

from .executor import execute_step
from .llm import LLMClient, parse_goal
from .planner import run_planner
from .reflector import MAX_REPLANS, run_reflector
from .state import AgentState
from .tracing import TraceBus, TraceEvent


async def _node_plan(state: AgentState, *, llm: LLMClient, bus: TraceBus) -> AgentState:
    return run_planner(state, llm, bus)


async def _node_execute(state: AgentState, *, llm: LLMClient, bus: TraceBus) -> AgentState:
    return await execute_step(state, llm, bus=bus)


async def _node_reflect(state: AgentState, *, llm: LLMClient, bus: TraceBus) -> AgentState:
    run_reflector(state, llm, bus)
    # decide routing based on the latest reflection
    last = state.reflections[-1] if state.reflections else None
    if last is None:
        state.last_route = "advance"
    elif last.decision == "replan" and state.replan_count < MAX_REPLANS:
        state.replan_count += 1
        state.last_route = "replan"
    elif last.decision == "abort":
        state.finished = True
        state.last_route = "abort"
    else:
        state.current_step_idx += 1
        pending = any(s.status != "done" for s in state.plan[state.current_step_idx:])
        state.last_route = "advance" if pending else "compose"
    bus.emit(TraceEvent(kind="route", node="router",
                        data={"decision": state.last_route,
                              "current_step_idx": state.current_step_idx,
                              "replan_count": state.replan_count}))
    return state


async def _node_compose(state: AgentState, *, llm: LLMClient, bus: TraceBus) -> AgentState:
    parsed = state.parsed_goal or parse_goal(state.user_goal)
    header = f"# {parsed.get('city', '目的地')} {parsed.get('days', 3)} 天行程"
    subtitle_bits = []
    if parsed.get("budget"):
        subtitle_bits.append(f"预算 {parsed['budget']}")
    subtitle_bits.append(f"原始需求：{state.user_goal}")
    lines = [header, "> " + "，".join(subtitle_bits), ""]
    for s in state.plan:
        if s.draft:
            lines.append(s.draft)
            lines.append("")
    # day-by-day mock aggregation if MOCK LLM is used (keeps tests stable)
    if llm.use_mock:
        lines.append("## 逐日行程")
        days = int(parsed.get("days", 3) or 3)
        attractions = _pluck_places(state)
        weathers = _pluck_weather(state)
        for d in range(days):
            day_w = weathers[d] if d < len(weathers) else None
            spots = attractions[d * 2:d * 2 + 2] or ["自由活动"]
            w = f"（{day_w['weather']} {day_w['temp_min']}~{day_w['temp_max']}°C）" if day_w else ""
            lines.append(f"- **Day {d + 1}**{w}：{'、'.join(spots)}")
    text = "\n".join(lines).strip() + "\n"
    state.final_itinerary = text
    state.finished = True
    bus.emit(TraceEvent(kind="final", node="compose",
                        data={"itinerary_len": len(text)}))
    return state


def _pluck_places(state: AgentState) -> list[str]:
    for tc in state.tool_calls:
        if tc.name == "places.nearby" and tc.result.get("ok"):
            return [p["name"] for p in tc.result["result"].get("places", [])][:10]
    return []


def _pluck_weather(state: AgentState) -> list[dict[str, Any]]:
    for tc in state.tool_calls:
        if tc.name == "weather.get_forecast" and tc.result.get("ok"):
            return list(tc.result["result"].get("forecast", []))
    return []


def _route_after_reflect(state: AgentState) -> str:
    return state.last_route


def build_graph(llm: LLMClient, bus: TraceBus):
    sg: StateGraph = StateGraph(AgentState)

    async def _plan(s: AgentState) -> AgentState:
        return await _node_plan(s, llm=llm, bus=bus)

    async def _execute(s: AgentState) -> AgentState:
        return await _node_execute(s, llm=llm, bus=bus)

    async def _reflect(s: AgentState) -> AgentState:
        return await _node_reflect(s, llm=llm, bus=bus)

    async def _compose(s: AgentState) -> AgentState:
        return await _node_compose(s, llm=llm, bus=bus)

    sg.add_node("plan", _plan)
    sg.add_node("execute", _execute)
    sg.add_node("reflect", _reflect)
    sg.add_node("compose", _compose)

    sg.set_entry_point("plan")
    sg.add_edge("plan", "execute")
    sg.add_edge("execute", "reflect")
    sg.add_conditional_edges(
        "reflect",
        _route_after_reflect,
        {"advance": "execute", "replan": "plan", "compose": "compose", "abort": "compose"},
    )
    sg.add_edge("compose", END)
    return sg.compile()


async def run_agent(goal: str, *, bus: TraceBus | None = None,
                    llm: LLMClient | None = None) -> AgentState:
    bus = bus or TraceBus()
    llm = llm or LLMClient()
    graph = build_graph(llm, bus)
    state = AgentState(user_goal=goal, parsed_goal=parse_goal(goal))
    final = await graph.ainvoke(state, config={"recursion_limit": 40})
    # langgraph returns a dict if the state is pydantic; coerce back
    if isinstance(final, dict):
        final = AgentState.model_validate(final)
    bus.close()
    return final
