"""Unit tests for tools (using their MOCK fallbacks)."""
import pytest

from travel_agent.tools import flights, fx, places, weather, web_search


@pytest.mark.asyncio
async def test_weather_mock_returns_forecast():
    out = await weather.get_forecast(city="杭州", days=3)
    assert out["ok"] is True
    fc = out["result"]["forecast"]
    assert len(fc) == 3
    assert {"date", "weather", "temp_min", "temp_max"} <= fc[0].keys()


@pytest.mark.asyncio
async def test_flights_mock_returns_offers():
    out = await flights.search(origin="SHA", destination="HGH", depart_date="2030-01-01")
    assert out["ok"] is True
    assert len(out["result"]["offers"]) >= 1


@pytest.mark.asyncio
async def test_places_mock_returns_named_attractions():
    out = await places.nearby(city="杭州", limit=4)
    assert out["ok"] is True
    names = [p["name"] for p in out["result"]["places"]]
    assert any("西湖" in n for n in names)


@pytest.mark.asyncio
async def test_fx_identity_and_fallback():
    same = await fx.convert(amount=100.0, from_currency="CNY", to_currency="CNY")
    assert same["result"]["rate"] == 1.0

    pair = await fx.convert(amount=100.0, from_currency="USD", to_currency="CNY")
    assert pair["ok"] is True
    assert pair["result"]["converted"] >= 100.0


@pytest.mark.asyncio
async def test_web_search_mock():
    out = await web_search.query(q="杭州 美食", max_results=3)
    assert out["ok"] is True
    assert len(out["result"]["results"]) >= 1
