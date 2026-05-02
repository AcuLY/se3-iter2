"""OpenWeatherMap — daily forecast for a city.

Falls back to deterministic synthetic data when no API key is configured."""
from __future__ import annotations

import hashlib
from datetime import date, timedelta
from typing import Any

import httpx

from ..config import get_settings
from ..errors import with_tool_retry


@with_tool_retry("weather.get_forecast")
async def get_forecast(*, city: str, days: int = 3) -> dict[str, Any]:
    settings = get_settings()
    if not settings.openweather_api_key:
        return _mock(city, days)

    async with httpx.AsyncClient(timeout=10.0) as client:
        # geocode first
        geo = await client.get(
            "https://api.openweathermap.org/geo/1.0/direct",
            params={"q": city, "limit": 1, "appid": settings.openweather_api_key},
        )
        geo.raise_for_status()
        rows = geo.json()
        if not rows:
            return _mock(city, days, note="city not found, returning synthetic")
        lat, lon = rows[0]["lat"], rows[0]["lon"]

        fc = await client.get(
            "https://api.openweathermap.org/data/2.5/forecast/daily",
            params={"lat": lat, "lon": lon, "cnt": days, "units": "metric",
                    "appid": settings.openweather_api_key},
        )
        if fc.status_code == 401:
            # plan tier may not include daily endpoint; fallback synthetic
            return _mock(city, days, note="key lacks daily endpoint")
        fc.raise_for_status()
        data = fc.json()
        out = []
        for i, day in enumerate(data.get("list", [])):
            out.append({
                "date": (date.today() + timedelta(days=i)).isoformat(),
                "temp_min": day["temp"]["min"],
                "temp_max": day["temp"]["max"],
                "weather": day["weather"][0]["main"] if day.get("weather") else "Unknown",
            })
        return {"ok": True, "tool": "weather.get_forecast",
                "result": {"city": city, "forecast": out, "source": "openweathermap"}}


def _mock(city: str, days: int, *, note: str = "synthetic forecast") -> dict[str, Any]:
    h = int(hashlib.md5(city.encode()).hexdigest(), 16)
    bases = [(15, 24), (10, 20), (20, 30), (5, 15), (25, 33)]
    lo, hi = bases[h % len(bases)]
    weathers = ["Clear", "Clouds", "Rain", "Clouds", "Clear"]
    forecast = []
    today = date.today()
    for i in range(days):
        forecast.append({
            "date": (today + timedelta(days=i)).isoformat(),
            "temp_min": lo + (i % 3) - 1,
            "temp_max": hi - (i % 2),
            "weather": weathers[(h + i) % len(weathers)],
        })
    return {"ok": True, "tool": "weather.get_forecast",
            "result": {"city": city, "forecast": forecast, "source": "mock", "note": note}}
