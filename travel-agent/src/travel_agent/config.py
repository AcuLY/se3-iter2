"""Runtime configuration."""
from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"

    openweather_api_key: str = ""
    amadeus_client_id: str = ""
    amadeus_client_secret: str = ""
    opentripmap_api_key: str = ""
    tavily_api_key: str = ""

    server_port: int = 8088

    @property
    def use_mock_llm(self) -> bool:
        return not self.openai_api_key

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            openai_api_key=os.getenv("OPENAI_API_KEY", "").strip(),
            openai_base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip(),
            openai_model=os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip(),
            openweather_api_key=os.getenv("OPENWEATHER_API_KEY", "").strip(),
            amadeus_client_id=os.getenv("AMADEUS_CLIENT_ID", "").strip(),
            amadeus_client_secret=os.getenv("AMADEUS_CLIENT_SECRET", "").strip(),
            opentripmap_api_key=os.getenv("OPENTRIPMAP_API_KEY", "").strip(),
            tavily_api_key=os.getenv("TAVILY_API_KEY", "").strip(),
            server_port=int(os.getenv("TRAVEL_AGENT_PORT", "8088")),
        )


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings.from_env()
    return _settings


def reset_settings_for_tests(**overrides) -> Settings:
    global _settings
    _settings = Settings(**{**Settings.from_env().__dict__, **overrides})
    return _settings
