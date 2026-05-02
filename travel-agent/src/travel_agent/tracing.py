"""Async event bus for surfacing internal state to CLI/Web visualizers."""
from __future__ import annotations

import asyncio
import json
import time
from dataclasses import asdict, dataclass, field
from typing import Any, AsyncIterator, Optional


@dataclass
class TraceEvent:
    kind: str
    node: str
    data: dict[str, Any] = field(default_factory=dict)
    ts: float = field(default_factory=lambda: time.time())

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)


class TraceBus:
    """Multi-subscriber pub/sub. Used by both the CLI panel and Gradio UI."""

    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue[Optional[TraceEvent]]] = []
        self._history: list[TraceEvent] = []
        self._closed = False

    def subscribe(self) -> asyncio.Queue[Optional[TraceEvent]]:
        q: asyncio.Queue[Optional[TraceEvent]] = asyncio.Queue()
        for ev in self._history:
            q.put_nowait(ev)
        self._subscribers.append(q)
        return q

    def emit(self, event: TraceEvent) -> None:
        if self._closed:
            return
        self._history.append(event)
        for q in self._subscribers:
            q.put_nowait(event)

    def close(self) -> None:
        self._closed = True
        for q in self._subscribers:
            q.put_nowait(None)

    @property
    def history(self) -> list[TraceEvent]:
        return list(self._history)

    async def stream(self) -> AsyncIterator[TraceEvent]:
        q = self.subscribe()
        while True:
            ev = await q.get()
            if ev is None:
                return
            yield ev
