"""exchangerate.host — currency conversion (no key required)."""
from __future__ import annotations

from typing import Any

import httpx

from ..errors import with_tool_retry


_FALLBACK_RATES = {
    ("USD", "CNY"): 7.15, ("CNY", "USD"): 0.14,
    ("EUR", "CNY"): 7.80, ("CNY", "EUR"): 0.128,
    ("JPY", "CNY"): 0.046, ("CNY", "JPY"): 21.7,
    ("HKD", "CNY"): 0.92, ("CNY", "HKD"): 1.09,
}


@with_tool_retry("fx.convert")
async def convert(*, amount: float, from_currency: str, to_currency: str) -> dict[str, Any]:
    if from_currency == to_currency:
        return {"ok": True, "tool": "fx.convert",
                "result": {"amount": amount, "from": from_currency, "to": to_currency,
                           "rate": 1.0, "converted": amount, "source": "identity"}}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(
                "https://api.exchangerate.host/convert",
                params={"from": from_currency, "to": to_currency, "amount": amount},
            )
            if r.status_code == 200:
                data = r.json()
                if data.get("success") and data.get("info"):
                    return {"ok": True, "tool": "fx.convert",
                            "result": {"amount": amount, "from": from_currency,
                                       "to": to_currency,
                                       "rate": data["info"]["rate"],
                                       "converted": data["result"],
                                       "source": "exchangerate.host"}}
    except httpx.HTTPError:
        pass

    # synthetic fallback
    rate = _FALLBACK_RATES.get((from_currency, to_currency))
    if rate is None:
        rate = 1.0
        note = "unknown pair, identity rate"
    else:
        note = "fallback rate"
    return {"ok": True, "tool": "fx.convert",
            "result": {"amount": amount, "from": from_currency, "to": to_currency,
                       "rate": rate, "converted": round(amount * rate, 2),
                       "source": "mock", "note": note}}
