"""LangGraph state."""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class PlanStep(BaseModel):
    id: str
    title: str
    rationale: str = ""
    needs_tools: list[str] = Field(default_factory=list)
    depends_on: list[str] = Field(default_factory=list)
    status: Literal["pending", "running", "done", "failed", "replanned"] = "pending"
    draft: str = ""


class ReActTrace(BaseModel):
    step_id: str
    thought: str = ""
    action: str = ""
    action_input: dict[str, Any] = Field(default_factory=dict)
    observation: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class Reflection(BaseModel):
    step_id: str
    score: float
    note: str
    decision: Literal["continue", "replan", "abort"] = "continue"


class ToolCallRecord(BaseModel):
    step_id: str
    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] = Field(default_factory=dict)
    latency_ms: int = 0
    attempts: int = 1
    error: str | None = None


class AgentState(BaseModel):
    user_goal: str
    parsed_goal: dict[str, Any] = Field(default_factory=dict)
    constraints: dict[str, Any] = Field(default_factory=dict)

    plan: list[PlanStep] = Field(default_factory=list)
    current_step_idx: int = 0
    react_traces: list[ReActTrace] = Field(default_factory=list)
    reflections: list[Reflection] = Field(default_factory=list)
    tool_calls: list[ToolCallRecord] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)

    replan_count: int = 0
    final_itinerary: str = ""
    finished: bool = False

    # routing decision recorded so test/visualization can introspect
    last_route: str = ""

    def latest_step(self) -> PlanStep | None:
        if 0 <= self.current_step_idx < len(self.plan):
            return self.plan[self.current_step_idx]
        return None
