"""HTTP server exposing the agent so the evaluation platform can hit it.

Exposes:
    GET  /healthz             → {"ok": true}
    POST /v1/run              → {"input": "..."} → {"output", "trace",
                                  "tool_calls", "latency_ms", "token_usage"}
"""
from __future__ import annotations

import asyncio
import time

from fastapi import FastAPI
from pydantic import BaseModel

from .config import get_settings
from .graph import run_agent
from .llm import LLMClient
from .tracing import TraceBus


class RunRequest(BaseModel):
    input: str
    meta: dict | None = None


class RunResponse(BaseModel):
    output: str
    trace: list[dict]
    tool_calls: list[dict]
    latency_ms: int
    token_usage: dict


app = FastAPI(title="travel-agent")


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}


@app.post("/v1/run", response_model=RunResponse)
async def run(req: RunRequest) -> RunResponse:
    bus = TraceBus()
    llm = LLMClient()
    t0 = time.perf_counter()
    final = await run_agent(req.input, bus=bus, llm=llm)
    latency = int((time.perf_counter() - t0) * 1000)
    return RunResponse(
        output=final.final_itinerary,
        trace=[ev.to_dict() for ev in bus.history],
        tool_calls=[tc.model_dump() for tc in final.tool_calls],
        latency_ms=latency,
        token_usage=llm.token_usage.to_dict(),
    )


def main() -> None:
    import uvicorn

    port = get_settings().server_port
    uvicorn.run("travel_agent.server:app", host="0.0.0.0", port=port, reload=False)


if __name__ == "__main__":
    main()
