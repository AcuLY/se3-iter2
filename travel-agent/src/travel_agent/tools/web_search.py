"""Tavily search — fallback web search for ReAct."""
from __future__ import annotations

from typing import Any

import httpx

from ..config import get_settings
from ..errors import with_tool_retry


@with_tool_retry("web_search.query")
async def query(*, q: str, max_results: int = 5) -> dict[str, Any]:
    s = get_settings()
    if not s.tavily_api_key:
        return _mock(q, max_results)
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(
            "https://api.tavily.com/search",
            json={"api_key": s.tavily_api_key, "query": q, "max_results": max_results},
        )
        r.raise_for_status()
        data = r.json()
        results = [{"title": x.get("title"), "url": x.get("url"),
                    "snippet": x.get("content")} for x in data.get("results", [])]
        return {"ok": True, "tool": "web_search.query",
                "result": {"query": q, "results": results, "source": "tavily"}}


def _mock(q: str, max_results: int) -> dict[str, Any]:
    results = [
        {"title": f"{q} 攻略 (示例 {i + 1})",
         "url": f"https://example.com/{i + 1}",
         "snippet": f"关于 {q} 的样例搜索片段 {i + 1}。"}
        for i in range(min(max_results, 3))
    ]
    return {"ok": True, "tool": "web_search.query",
            "result": {"query": q, "results": results, "source": "mock"}}
