"""Pytest fixtures."""
import os
import pytest


@pytest.fixture(autouse=True)
def _force_mock_mode(monkeypatch):
    """All tests run with empty API keys → MOCK paths everywhere."""
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("OPENWEATHER_API_KEY", "")
    monkeypatch.setenv("AMADEUS_CLIENT_ID", "")
    monkeypatch.setenv("AMADEUS_CLIENT_SECRET", "")
    monkeypatch.setenv("OPENTRIPMAP_API_KEY", "")
    monkeypatch.setenv("TAVILY_API_KEY", "")
    # reset cached settings
    from travel_agent import config
    config._settings = None
    yield
    config._settings = None
