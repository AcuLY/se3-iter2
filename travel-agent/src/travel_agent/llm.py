"""LLM client with OpenAI-compatible API + deterministic MOCK fallback.

The MOCK mode lets the entire graph + tests run without any API keys, which
is essential for CI and offline demos.  It deterministically generates a
travel-themed plan, ReAct steps, reflections, and a final itinerary."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Iterable

from .config import get_settings


@dataclass
class TokenUsage:
    prompt: int = 0
    completion: int = 0

    @property
    def total(self) -> int:
        return self.prompt + self.completion

    def add(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(self.prompt + other.prompt, self.completion + other.completion)

    def to_dict(self) -> dict[str, int]:
        return {"prompt": self.prompt, "completion": self.completion, "total": self.total}


class LLMClient:
    """Minimal LLM client.  Exposes a single `complete_json` and `complete_text` method.

    All graph nodes route through this so that the MOCK path can deterministically
    produce structurally valid responses.
    """

    def __init__(self, *, model: str | None = None) -> None:
        s = get_settings()
        self.model = model or s.openai_model
        self.use_mock = s.use_mock_llm
        self._client = None
        self._token_usage = TokenUsage()
        if not self.use_mock:
            try:
                from openai import OpenAI

                self._client = OpenAI(api_key=s.openai_api_key, base_url=s.openai_base_url)
            except Exception:  # pragma: no cover
                self.use_mock = True

    @property
    def token_usage(self) -> TokenUsage:
        return self._token_usage

    def reset_usage(self) -> None:
        self._token_usage = TokenUsage()

    # ------------------------------------------------------------------
    def complete_text(self, system: str, user: str, *, temperature: float = 0.2) -> str:
        if self.use_mock:
            text = _mock_text(system, user)
            self._account_mock(system, user, text)
            return text
        resp = self._client.chat.completions.create(  # type: ignore[union-attr]
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=temperature,
        )
        choice = resp.choices[0].message.content or ""
        usage = getattr(resp, "usage", None)
        if usage:
            self._token_usage = self._token_usage.add(
                TokenUsage(prompt=usage.prompt_tokens, completion=usage.completion_tokens)
            )
        return choice

    def complete_json(
        self,
        system: str,
        user: str,
        *,
        schema_hint: str = "",
        temperature: float = 0.0,
        mock_factory=None,
    ) -> dict[str, Any]:
        if self.use_mock:
            data = mock_factory() if mock_factory else {"text": _mock_text(system, user)}
            self._account_mock(system, user, json.dumps(data))
            return data
        prompt = user + ("\n\n" + schema_hint if schema_hint else "") + \
                 "\n\nRespond with strict JSON only, no prose."
        resp = self._client.chat.completions.create(  # type: ignore[union-attr]
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            temperature=temperature,
            response_format={"type": "json_object"},
        )
        usage = getattr(resp, "usage", None)
        if usage:
            self._token_usage = self._token_usage.add(
                TokenUsage(prompt=usage.prompt_tokens, completion=usage.completion_tokens)
            )
        text = resp.choices[0].message.content or "{}"
        return _safe_json(text)

    # ------------------------------------------------------------------
    def _account_mock(self, system: str, user: str, output: str) -> None:
        prompt_tokens = max(1, len(system) // 4 + len(user) // 4)
        completion_tokens = max(1, len(output) // 4)
        self._token_usage = self._token_usage.add(
            TokenUsage(prompt=prompt_tokens, completion=completion_tokens)
        )


# ----------------------------------------------------------------------
def _safe_json(s: str) -> dict[str, Any]:
    s = s.strip()
    # tolerate ```json ... ``` fenced output
    fenced = re.match(r"```(?:json)?\s*(.*?)\s*```", s, re.DOTALL)
    if fenced:
        s = fenced.group(1)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        # try to find the outermost JSON object
        m = re.search(r"\{.*\}", s, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
    return {"_raw": s}


# ----------------------------------------------------------------------
_CITY_GUESS = re.compile(r"([一-鿿A-Za-z]{2,})")
_DAYS_GUESS = re.compile(r"(\d+)\s*天")
_BUDGET_GUESS = re.compile(r"预算\s*(\d+)|budget\s*(\d+)", re.IGNORECASE)


def parse_goal(goal: str) -> dict[str, Any]:
    days_m = _DAYS_GUESS.search(goal)
    days = int(days_m.group(1)) if days_m else 3
    budget_m = _BUDGET_GUESS.search(goal)
    budget = int(next((g for g in (budget_m.groups() if budget_m else []) if g), 0)) or None
    # crude city guess: first 2-4 char Chinese token, fallback "目的地"
    city = "目的地"
    for tok in _CITY_GUESS.findall(goal):
        if 2 <= len(tok) <= 6 and tok not in {"预算", "天", "偏好", "美食"}:
            city = tok
            break
    return {"city": city, "days": days, "budget": budget, "raw": goal}


def _mock_text(system: str, user: str) -> str:
    return f"[mock-llm] {user[:80]}"
