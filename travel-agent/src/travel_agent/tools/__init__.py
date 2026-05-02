"""Tool registry — the public surface every node uses to call tools."""
from __future__ import annotations

from typing import Any, Awaitable, Callable

from . import flights, fx, places, weather, web_search

ToolFn = Callable[..., Awaitable[dict[str, Any]]]

_REGISTRY: dict[str, ToolFn] = {
    "weather.get_forecast": weather.get_forecast,
    "flights.search": flights.search,
    "places.nearby": places.nearby,
    "fx.convert": fx.convert,
    "web_search.query": web_search.query,
}


def list_tools() -> list[str]:
    return list(_REGISTRY)


def get_tool(name: str) -> ToolFn:
    if name not in _REGISTRY:
        raise KeyError(f"unknown tool: {name}")
    return _REGISTRY[name]


__all__ = ["list_tools", "get_tool", "ToolFn"]
