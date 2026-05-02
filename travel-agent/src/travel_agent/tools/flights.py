"""Amadeus Self-Service — Flight Offers Search (test environment)."""
from __future__ import annotations

import time
from typing import Any

import httpx

from ..config import get_settings
from ..errors import with_tool_retry

_TOKEN_CACHE: dict[str, Any] = {"value": None, "expires_at": 0.0}


async def _get_token() -> str | None:
    s = get_settings()
    if not (s.amadeus_client_id and s.amadeus_client_secret):
        return None
    if _TOKEN_CACHE["value"] and _TOKEN_CACHE["expires_at"] > time.time() + 30:
        return _TOKEN_CACHE["value"]
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(
            "https://test.api.amadeus.com/v1/security/oauth2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": s.amadeus_client_id,
                "client_secret": s.amadeus_client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        r.raise_for_status()
        data = r.json()
        _TOKEN_CACHE["value"] = data["access_token"]
        _TOKEN_CACHE["expires_at"] = time.time() + int(data.get("expires_in", 1500))
        return _TOKEN_CACHE["value"]


@with_tool_retry("flights.search")
async def search(*, origin: str, destination: str, depart_date: str,
                 adults: int = 1) -> dict[str, Any]:
    token = await _get_token()
    if not token:
        return _mock(origin, destination, depart_date)
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(
            "https://test.api.amadeus.com/v2/shopping/flight-offers",
            params={"originLocationCode": origin, "destinationLocationCode": destination,
                    "departureDate": depart_date, "adults": adults, "max": 5},
            headers={"Authorization": f"Bearer {token}"},
        )
        if r.status_code in (400, 404):
            return _mock(origin, destination, depart_date, note="amadeus returned no offers")
        r.raise_for_status()
        offers = r.json().get("data", [])
        flights = []
        for o in offers[:5]:
            price = float(o["price"]["total"])
            currency = o["price"]["currency"]
            seg = o["itineraries"][0]["segments"][0]
            flights.append({
                "carrier": seg.get("carrierCode", "??"),
                "flight": seg.get("number", "?"),
                "depart": seg["departure"]["at"],
                "arrive": seg["arrival"]["at"],
                "price": price,
                "currency": currency,
            })
        return {"ok": True, "tool": "flights.search",
                "result": {"origin": origin, "destination": destination,
                           "date": depart_date, "offers": flights, "source": "amadeus"}}


def _mock(origin: str, destination: str, depart_date: str,
          *, note: str = "synthetic offers") -> dict[str, Any]:
    base = abs(hash((origin, destination))) % 600 + 400
    offers = [
        {"carrier": "MU", "flight": "5101", "depart": f"{depart_date}T08:30",
         "arrive": f"{depart_date}T10:50", "price": float(base), "currency": "CNY"},
        {"carrier": "CA", "flight": "1858", "depart": f"{depart_date}T14:10",
         "arrive": f"{depart_date}T16:30", "price": float(base + 120), "currency": "CNY"},
        {"carrier": "CZ", "flight": "3104", "depart": f"{depart_date}T20:05",
         "arrive": f"{depart_date}T22:25", "price": float(base - 80), "currency": "CNY"},
    ]
    return {"ok": True, "tool": "flights.search",
            "result": {"origin": origin, "destination": destination,
                       "date": depart_date, "offers": offers, "source": "mock", "note": note}}
