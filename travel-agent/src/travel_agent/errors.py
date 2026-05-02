"""Unified errors and retry/observability decorator for tool calls."""
from __future__ import annotations

import functools
import logging
import time
from typing import Any, Awaitable, Callable

import httpx
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)


class ToolExecutionError(Exception):
    """Raised when a tool fails after retries.

    Carries the originating tool name and a structured payload that can be
    surfaced to the reasoning loop (so the LLM/reflector can recover)."""

    def __init__(self, tool: str, message: str, *, cause: Exception | None = None,
                 attempts: int = 1, payload: dict | None = None):
        super().__init__(f"[{tool}] {message}")
        self.tool = tool
        self.cause = cause
        self.attempts = attempts
        self.payload = payload or {}

    def to_observation(self) -> dict[str, Any]:
        return {
            "ok": False,
            "tool": self.tool,
            "error": str(self),
            "attempts": self.attempts,
            "cause": type(self.cause).__name__ if self.cause else None,
            **self.payload,
        }


_RETRYABLE = (httpx.TransportError, httpx.HTTPStatusError, httpx.TimeoutException)


def with_tool_retry(tool_name: str, *, attempts: int = 3, base_wait: float = 0.4):
    """Decorate an async tool function with retry + error normalization."""

    def decorator(fn: Callable[..., Awaitable[dict[str, Any]]]):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs) -> dict[str, Any]:
            start = time.perf_counter()
            attempt = 0
            try:
                async for retry in AsyncRetrying(
                    stop=stop_after_attempt(attempts),
                    wait=wait_exponential(multiplier=base_wait, min=base_wait, max=4.0),
                    retry=retry_if_exception_type(_RETRYABLE),
                    reraise=True,
                ):
                    with retry:
                        attempt = retry.retry_state.attempt_number
                        result = await fn(*args, **kwargs)
                        latency_ms = int((time.perf_counter() - start) * 1000)
                        # Always wrap success into the same envelope.
                        if isinstance(result, dict) and "ok" in result:
                            result.setdefault("latency_ms", latency_ms)
                            result.setdefault("attempts", attempt)
                            return result
                        return {
                            "ok": True,
                            "tool": tool_name,
                            "result": result,
                            "attempts": attempt,
                            "latency_ms": latency_ms,
                        }
            except RetryError as re:  # pragma: no cover — tenacity wraps the last exception
                cause = re.last_attempt.exception() if re.last_attempt else None
                raise ToolExecutionError(tool_name, str(cause), cause=cause, attempts=attempt) from cause
            except _RETRYABLE as exc:
                raise ToolExecutionError(tool_name, str(exc), cause=exc, attempts=attempt) from exc
            except ToolExecutionError:
                raise
            except Exception as exc:  # noqa: BLE001
                raise ToolExecutionError(tool_name, str(exc), cause=exc, attempts=attempt) from exc

            # unreachable — AsyncRetrying always returns or raises
            raise ToolExecutionError(tool_name, "exited retry loop unexpectedly")

        return wrapper

    return decorator
