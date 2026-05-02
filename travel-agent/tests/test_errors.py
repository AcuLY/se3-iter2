"""Errors / retry decorator tests."""
import httpx
import pytest

from travel_agent.errors import ToolExecutionError, with_tool_retry


@pytest.mark.asyncio
async def test_retry_then_succeed():
    calls = {"n": 0}

    @with_tool_retry("demo", attempts=3, base_wait=0.0)
    async def flaky():
        calls["n"] += 1
        if calls["n"] < 2:
            raise httpx.ConnectError("boom")
        return {"value": 1}

    out = await flaky()
    assert out["ok"] is True
    assert out["attempts"] == 2
    assert out["result"]["value"] == 1


@pytest.mark.asyncio
async def test_retry_exhausted_raises_tool_error():
    @with_tool_retry("demo", attempts=2, base_wait=0.0)
    async def always_fail():
        raise httpx.ConnectError("nope")

    with pytest.raises(ToolExecutionError) as ei:
        await always_fail()
    assert ei.value.tool == "demo"
    obs = ei.value.to_observation()
    assert obs["ok"] is False
    assert obs["tool"] == "demo"


@pytest.mark.asyncio
async def test_envelope_kept_when_function_returns_envelope():
    @with_tool_retry("demo", base_wait=0.0)
    async def ok():
        return {"ok": True, "tool": "demo", "result": {"x": 1}}

    out = await ok()
    assert out["ok"] is True
    assert out["result"]["x"] == 1
    assert "latency_ms" in out
