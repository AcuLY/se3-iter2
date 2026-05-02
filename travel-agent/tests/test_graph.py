"""Smoke test for the full LangGraph pipeline (MOCK mode end-to-end)."""
import pytest

from travel_agent.graph import run_agent


@pytest.mark.asyncio
async def test_end_to_end_mock_produces_itinerary():
    state = await run_agent("北京 3 天，预算 3000")
    assert state.finished
    assert state.final_itinerary
    assert "北京" in state.final_itinerary
    assert "Day 1" in state.final_itinerary
    assert state.plan, "expected at least one plan step"
    # ReAct happened
    assert state.tool_calls, "expected at least one tool call"
    # Reflexion happened
    assert state.reflections, "expected at least one reflection"


@pytest.mark.asyncio
async def test_replan_is_capped():
    state = await run_agent("杭州 2 天")
    assert state.replan_count <= 2
