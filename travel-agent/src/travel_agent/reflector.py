"""Reflexion node — score the latest step and decide whether to continue,
replan the remaining steps, or abort.

Deterministic rubric is used in MOCK mode: failed step or too many tool
errors ⇒ replan (up to `max_replans`), else continue.  In LLM mode we still
apply the same rubric but annotate with an LLM-generated note for richer
visualization."""
from __future__ import annotations

from .llm import LLMClient
from .state import AgentState, Reflection
from .tracing import TraceBus, TraceEvent


_REFLECT_SYS = (
    "You are an honest reflector.  Given a plan step and its observations, "
    "produce a JSON object {score: 0..1, note: string, decision: 'continue'|'replan'|'abort'}. "
    "High score = step accomplished its goal.  Recommend 'replan' if critical info is missing "
    "or if tool failures prevented the step from completing."
)


MAX_REPLANS = 2


def _rubric(state: AgentState) -> Reflection:
    step = state.latest_step()
    if step is None:
        return Reflection(step_id="-", score=1.0, note="no step", decision="continue")
    step_traces = [t for t in state.react_traces if t.step_id == step.id]
    tool_errs = sum(1 for t in step_traces if t.error or (t.observation and not t.observation.get("ok", True)))
    ok_calls = sum(1 for t in step_traces if t.observation and t.observation.get("ok"))

    if step.status == "failed":
        return Reflection(step_id=step.id, score=0.2,
                          note=f"step failed ({tool_errs} tool errors)",
                          decision="replan" if state.replan_count < MAX_REPLANS else "continue")
    if step.needs_tools and ok_calls == 0:
        return Reflection(step_id=step.id, score=0.4,
                          note="no successful tool calls for a tool-bearing step",
                          decision="replan" if state.replan_count < MAX_REPLANS else "continue")
    if tool_errs > ok_calls:
        return Reflection(step_id=step.id, score=0.55,
                          note=f"errors outnumbered successes ({tool_errs} > {ok_calls})",
                          decision="continue")
    return Reflection(step_id=step.id, score=0.9, note="step OK", decision="continue")


def run_reflector(state: AgentState, llm: LLMClient,
                  bus: TraceBus | None = None) -> AgentState:
    rubric_result = _rubric(state)

    if not llm.use_mock:
        step = state.latest_step()
        ctx = {
            "step": step.model_dump() if step else {},
            "tool_calls": [tc.model_dump() for tc in state.tool_calls if step and tc.step_id == step.id],
        }
        try:
            data = llm.complete_json(
                system=_REFLECT_SYS,
                user=f"Context: {ctx}",
                mock_factory=lambda: rubric_result.model_dump(),
            )
            score = float(data.get("score", rubric_result.score))
            note = str(data.get("note", rubric_result.note))
            decision = data.get("decision", rubric_result.decision)
            if decision not in {"continue", "replan", "abort"}:
                decision = rubric_result.decision
            # Hard rubric overrides the LLM when it contradicts concrete failure state.
            if rubric_result.decision == "replan" and state.replan_count < MAX_REPLANS:
                decision = "replan"
            rubric_result = Reflection(step_id=rubric_result.step_id, score=score,
                                       note=note, decision=decision)
        except Exception:  # noqa: BLE001
            pass

    state.reflections.append(rubric_result)
    if bus:
        bus.emit(TraceEvent(kind="reflection", node="reflector",
                            data=rubric_result.model_dump()))
    return state
