"""Create a reusable city-coordinate cache for CBRE market names.

Uses OpenStreetMap's Nominatim search service at one request per second. It deliberately
skips national and semicolon-delimited multi-market reports, which should stay regional.
"""
from __future__ import annotations

import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "cbre-market-report-index-with-pdfs.csv"
OUT = ROOT / "data" / "market_coordinates.json"
HEADERS = {"User-Agent": "CBRE-Market-Atlas/1.0 (local catalog geocoding)"}
sys.stdout.reconfigure(encoding="utf-8")


def query(place: str, country: str) -> tuple[float, float] | None:
    search = place if country in {"", "Global"} else f"{place}, {country}"
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": search, "format": "jsonv2", "limit": 1}
    )
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=20) as response:
        result = json.loads(response.read().decode("utf-8"))
    if not result:
        return None
    return float(result[0]["lat"]), float(result[0]["lon"])


existing = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
pairs: set[tuple[str, str]] = set()
with SOURCE.open(encoding="utf-8-sig", newline="") as handle:
    for row in csv.DictReader(handle):
        market = row["market"].strip()
        country = row["country"].strip() or "Global"
        if market and market != country and ";" not in market:
            pairs.add((market, country))

pending = sorted((market, country) for market, country in pairs if f"{market}|{country}" not in existing)
print(f"{len(existing)} cached, {len(pending)} markets to geocode", flush=True)
for index, (market, country) in enumerate(pending, 1):
    key = f"{market}|{country}"
    try:
        coordinate = query(market, country)
        if coordinate:
            existing[key] = coordinate
            OUT.parent.mkdir(parents=True, exist_ok=True)
            OUT.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[{index}/{len(pending)}] {key} -> {coordinate}", flush=True)
        else:
            print(f"[{index}/{len(pending)}] no result: {key}", flush=True)
    except Exception as error:
        print(f"[{index}/{len(pending)}] failed: {key}: {error}", flush=True)
    time.sleep(1.05)

print(f"Finished with {len(existing)} market coordinates", flush=True)
