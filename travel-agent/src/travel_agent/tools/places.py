"""OpenTripMap — search nearby points of interest."""
from __future__ import annotations

import hashlib
from typing import Any

import httpx

from ..config import get_settings
from ..errors import with_tool_retry


@with_tool_retry("places.nearby")
async def nearby(*, city: str, category: str = "interesting_places",
                 limit: int = 8) -> dict[str, Any]:
    s = get_settings()
    if not s.opentripmap_api_key:
        return _mock(city, category, limit)
    async with httpx.AsyncClient(timeout=10.0) as client:
        geo = await client.get(
            "https://api.opentripmap.com/0.1/en/places/geoname",
            params={"name": city, "apikey": s.opentripmap_api_key},
        )
        if geo.status_code == 404:
            return _mock(city, category, limit, note="city not in opentripmap")
        geo.raise_for_status()
        pos = geo.json()
        radius = await client.get(
            "https://api.opentripmap.com/0.1/en/places/radius",
            params={"radius": 8000, "lon": pos["lon"], "lat": pos["lat"],
                    "kinds": category, "limit": limit, "rate": 2,
                    "format": "json", "apikey": s.opentripmap_api_key},
        )
        radius.raise_for_status()
        rows = radius.json()
        places = [{"name": r.get("name") or r.get("xid"), "kind": r.get("kinds"),
                   "lat": r.get("point", {}).get("lat"), "lon": r.get("point", {}).get("lon")}
                  for r in rows if r.get("name")]
        return {"ok": True, "tool": "places.nearby",
                "result": {"city": city, "category": category, "places": places,
                           "source": "opentripmap"}}


_DEFAULT_PLACES: dict[str, list[str]] = {
    "杭州": ["西湖", "灵隐寺", "雷峰塔", "宋城", "西溪湿地", "南宋御街"],
    "北京": ["故宫", "天坛", "颐和园", "南锣鼓巷", "什刹海", "雍和宫", "长城"],
    "上海": ["外滩", "豫园", "南京路", "迪士尼乐园", "田子坊", "东方明珠"],
    "成都": ["宽窄巷子", "武侯祠", "锦里", "大熊猫繁育基地", "杜甫草堂"],
    "西安": ["兵马俑", "大雁塔", "回民街", "钟楼", "华清池"],
}


def _mock(city: str, category: str, limit: int,
          *, note: str = "synthetic places") -> dict[str, Any]:
    seeds = _DEFAULT_PLACES.get(city)
    if not seeds:
        h = int(hashlib.md5(city.encode()).hexdigest(), 16)
        keys = list(_DEFAULT_PLACES)
        seeds = _DEFAULT_PLACES[keys[h % len(keys)]]
    places = [{"name": f"{city}-{n}", "kind": category, "lat": None, "lon": None}
              for n in seeds[:limit]]
    return {"ok": True, "tool": "places.nearby",
            "result": {"city": city, "category": category, "places": places,
                       "source": "mock", "note": note}}
