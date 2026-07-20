#!/usr/bin/env python3
"""
Holt aktuelle Spritpreise (E5, E10, Diesel) für eine Liste deutscher Großstädte
über die Tankerkönig-API (list.php, Umkreissuche) und schreibt:

  data/latest.json   -> aktueller Snapshot (wird jedes Mal überschrieben)
  data/history.json  -> Zeitreihe der bundesweiten Durchschnittswerte (wird ergänzt)

Benötigt die Umgebungsvariable TANKERKOENIG_API_KEY.
Datenquelle: https://creativecommons.tankerkoenig.de (CC BY 4.0)
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError

API_BASE = "https://creativecommons.tankerkoenig.de/json/list.php"
FUELS = ["e5", "e10", "diesel"]
HISTORY_MAX_ENTRIES = 720  # ~30 Tage bei stündlichem Lauf

ROOT = Path(__file__).resolve().parent.parent
CITIES_FILE = ROOT / "cities.json"
DATA_DIR = ROOT / "data"
LATEST_FILE = DATA_DIR / "latest.json"
HISTORY_FILE = DATA_DIR / "history.json"


def fetch_city(api_key: str, city: dict, retries: int = 3) -> list:
    """Fragt alle offenen Tankstellen im Umkreis einer Stadt ab."""
    params = {
        "lat": city["lat"],
        "lng": city["lng"],
        "rad": city["radius"],
        "sort": "dist",
        "type": "all",
        "apikey": api_key,
    }
    url = f"{API_BASE}?{urlencode(params)}"

    last_error = None
    for attempt in range(1, retries + 1):
        try:
            with urlopen(url, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            if not payload.get("ok"):
                raise RuntimeError(payload.get("message", "API meldet ok=false"))
            return payload.get("stations", [])
        except (HTTPError, URLError, RuntimeError, json.JSONDecodeError) as exc:
            last_error = exc
            time.sleep(2 * attempt)
    print(f"  [WARN] {city['name']}: Abruf fehlgeschlagen nach {retries} Versuchen ({last_error})",
          file=sys.stderr)
    return []


def average(values: list) -> float | None:
    values = [v for v in values if isinstance(v, (int, float)) and v > 0]
    if not values:
        return None
    return round(sum(values) / len(values), 3)


def summarize_city(city: dict, stations: list) -> dict:
    open_stations = [s for s in stations if s.get("isOpen")]
    summary = {"name": city["name"], "station_count": len(open_stations)}
    for fuel in FUELS:
        prices = [s.get(fuel) for s in open_stations]
        summary[fuel] = average(prices)
        cheapest = None
        cheapest_price = None
        for s in open_stations:
            price = s.get(fuel)
            if isinstance(price, (int, float)) and price > 0:
                if cheapest_price is None or price < cheapest_price:
                    cheapest_price = price
                    cheapest = {
                        "brand": s.get("brand"),
                        "street": s.get("street"),
                        "place": s.get("place"),
                        "price": price,
                    }
        summary[f"{fuel}_cheapest"] = cheapest
    return summary


def national_average(city_summaries: list) -> dict:
    result = {}
    for fuel in FUELS:
        result[fuel] = average([c[fuel] for c in city_summaries if c.get(fuel) is not None])
    return result


def load_json(path: Path, default):
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return default
    return default


def main():
    api_key = os.environ.get("TANKERKOENIG_API_KEY")
    if not api_key:
        print("FEHLER: Umgebungsvariable TANKERKOENIG_API_KEY ist nicht gesetzt.", file=sys.stderr)
        sys.exit(1)

    cities = json.loads(CITIES_FILE.read_text(encoding="utf-8"))
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    city_summaries = []
    for city in cities:
        print(f"Abfrage: {city['name']} ...")
        stations = fetch_city(api_key, city)
        city_summaries.append(summarize_city(city, stations))
        time.sleep(1)  # kein unnötiger Ansturm auf die API

    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    national = national_average(city_summaries)

    latest = {
        "updated_at": timestamp,
        "national_average": national,
        "cities": city_summaries,
    }
    LATEST_FILE.write_text(json.dumps(latest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"latest.json geschrieben ({LATEST_FILE}).")

    history = load_json(HISTORY_FILE, {"entries": []})
    history.setdefault("entries", [])
    history["entries"].append({"timestamp": timestamp, **national})
    history["entries"] = history["entries"][-HISTORY_MAX_ENTRIES:]
    HISTORY_FILE.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"history.json aktualisiert ({len(history['entries'])} Einträge).")


if __name__ == "__main__":
    main()
