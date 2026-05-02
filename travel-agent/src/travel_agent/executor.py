"""ReAct executor — runs one plan step to completion via tool calls.

Each step is given up to `max_iters` ReAct cycles (Thought → Action → Observation).
The executor picks a tool from the step's `needs_tools` list (or synthesizes a
choice via the LLM).  Tool failures are caught by `errors.with_tool_retry` and
surfaced as structured observations so the LLM (or MOCK) can decide to retry
with different arguments or give up on this step."""
from __future__ import annotations

import asyncio
import json
from typing import Any

from .errors import ToolExecutionError
from .llm import LLMClient
from .state import AgentState, PlanStep, ReActTrace, ToolCallRecord
from .tools import get_tool, list_tools
from .tracing import TraceBus, TraceEvent


_EXECUTE_SYS = (
    "You drive a ReAct loop.  For the current step, decide the next action.  "
    "Valid actions: 'call_tool' (choose a tool from the registry) or 'finish'. "
    "Respond JSON {thought, action, tool, args, finish_reason}."
)


def _mock_react_decision(step: PlanStep, parsed: dict[str, Any], iter_idx: int) -> dict[str, Any]:
    """Deterministic ReAct policy used when no LLM key is available.

    Strategy: on first iteration call the primary tool listed in the step;
    if the observation already exists for that tool, finish."""
    if iter_idx == 0 and step.needs_tools:
        tool = step.needs_tools[0]
        city = parsed.get("city", "目的地")
        days = parsed.get("days", 3)
        budget = parsed.get("budget") or 3000
        args: dict[str, Any] = {}
        if tool == "weather.get_forecast":
            args = {"city": city, "days": days}
        elif tool == "places.nearby":
            args = {"city": city, "category": "interesting_places", "limit": 6}
        elif tool == "flights.search":
            args = {"origin": "SHA", "destination": _city_to_iata(city),
                    "depart_date": _iso_today_plus(1)}
        elif tool == "fx.convert":
            args = {"amount": float(budget), "from_currency": "USD", "to_currency": "CNY"}
        elif tool == "web_search.query":
            args = {"q": f"{city} 旅行攻略", "max_results": 3}
        return {"thought": f"按计划调用 {tool}",
                "action": "call_tool", "tool": tool, "args": args}
    return {"thought": "信息已收集，进入下一步", "action": "finish",
            "finish_reason": "observation_collected"}


def _iso_today_plus(days: int) -> str:
    from datetime import date, timedelta
    return (date.today() + timedelta(days=days)).isoformat()


_IATA_MAP = {
    "杭州": "HGH", "北京": "PEK", "上海": "PVG", "成都": "CTU",
    "西安": "XIY", "广州": "CAN", "深圳": "SZX", "三亚": "SYX",
}


def _city_to_iata(city: str) -> str:
    return _IATA_MAP.get(city, "CAN")


async def execute_step(state: AgentState, llm: LLMClient, *,
                       bus: TraceBus | None = None, max_iters: int = 3) -> AgentState:
    step = state.latest_step()
    if step is None:
        return state
    step.status = "running"
    if bus:
        bus.emit(TraceEvent(kind="step_start", node="executor",
                            data={"step": step.model_dump()}))

    for it in range(max_iters):
        # --- ReAct: decide next action ---
        context = _build_context(state, step)
        decision = llm.complete_json(
            system=_EXECUTE_SYS,
            user=(f"Current step: {step.title}\n"
                  f"Rationale: {step.rationale}\n"
                  f"Tools available: {list_tools()}\n"
                  f"Observations so far:\n{context}"),
            mock_factory=lambda: _mock_react_decision(step, state.parsed_goal, it),
        )
        thought = str(decision.get("thought", ""))
        action = str(decision.get("action", "finish"))
        tool = str(decision.get("tool", ""))
        args = decision.get("args") or {}
        trace = ReActTrace(step_id=step.id, thought=thought, action=action,
                           action_input={"tool": tool, **args} if tool else {})
        if bus:
            bus.emit(TraceEvent(kind="react_thought", node="executor",
                                data={"step_id": step.id, "iter": it, "thought": thought,
                                      "action": action, "tool": tool, "args": args}))

        if action == "finish" or not tool:
            state.react_traces.append(trace)
            break

        # --- Act: invoke tool ---
        try:
            fn = get_tool(tool)
        except KeyError as exc:
            trace.error = str(exc)
            state.react_traces.append(trace)
            state.errors.append(f"unknown tool {tool!r} at step {step.id}")
            continue

        try:
            envelope = await fn(**args)
        except ToolExecutionError as err:
            trace.error = str(err)
            envelope = err.to_observation()
        except Exception as exc:  # noqa: BLE001 — last-resort guard
            trace.error = f"unexpected: {exc}"
            envelope = {"ok": False, "tool": tool, "error": str(exc)}

        trace.observation = envelope
        state.react_traces.append(trace)
        state.tool_calls.append(ToolCallRecord(
            step_id=step.id, name=tool, args=args,
            result=envelope, latency_ms=int(envelope.get("latency_ms", 0)),
            attempts=int(envelope.get("attempts", 1)),
            error=envelope.get("error") if not envelope.get("ok") else None,
        ))
        if bus:
            bus.emit(TraceEvent(kind="react_observation", node="executor",
                                data={"step_id": step.id, "iter": it,
                                      "tool": tool, "observation": envelope}))

    # --- Compose a short per-step draft from collected observations ---
    step_obs = [t for t in state.react_traces if t.step_id == step.id and t.observation]
    step.draft = _compose_step_draft(step, step_obs, state.parsed_goal)
    step.status = "done" if step_obs or not step.needs_tools else "failed"
    if bus:
        bus.emit(TraceEvent(kind="step_end", node="executor",
                            data={"step_id": step.id, "status": step.status,
                                  "draft": step.draft}))
    return state


def _build_context(state: AgentState, step: PlanStep) -> str:
    lines: list[str] = []
    for t in state.react_traces[-6:]:
        ob = t.observation
        if not ob:
            continue
        ok = ob.get("ok")
        lines.append(f"step {t.step_id} tool={ob.get('tool')} ok={ok} "
                     f"summary={_short(ob)}")
    return "\n".join(lines) or "(none)"


def _short(ob: dict[str, Any]) -> str:
    try:
        return json.dumps(ob.get("result") or ob.get("error") or {}, ensure_ascii=False)[:160]
    except Exception:  # noqa: BLE001
        return str(ob)[:160]


def _compose_step_draft(step: PlanStep, traces: list[ReActTrace],
                        parsed: dict[str, Any]) -> str:
    lines = [f"### {step.title}"]
    if step.rationale:
        lines.append(f"> {step.rationale}")
    for t in traces:
        ob = t.observation
        if not ob.get("ok"):
            lines.append(f"- ⚠️ {ob.get('tool')} 失败: {ob.get('error')}")
            continue
        tool = ob.get("tool")
        res = ob.get("result") or {}
        if tool == "weather.get_forecast":
            for d in res.get("forecast", [])[:5]:
                lines.append(f"- {d['date']}: {d['weather']} {d['temp_min']}~{d['temp_max']}°C")
        elif tool == "places.nearby":
            names = ", ".join(p["name"] for p in res.get("places", [])[:6])
            lines.append(f"- 推荐景点：{names}")
        elif tool == "flights.search":
            for o in res.get("offers", [])[:3]:
                lines.append(f"- 航班 {o['carrier']}{o['flight']} {o['depart']}→{o['arrive']} "
                             f"{o['price']} {o['currency']}")
        elif tool == "fx.convert":
            lines.append(f"- {res['amount']} {res['from']} ≈ {res['converted']} {res['to']}"
                         f" (rate={res['rate']})")
        elif tool == "web_search.query":
            for r in res.get("results", [])[:3]:
                lines.append(f"- [{r['title']}]({r['url']})")
    return "\n".join(lines)
