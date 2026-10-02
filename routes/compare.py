"""
routes/compare.py – porovnanie motoriek.

Adresy:
  GET  /porovnanie             ... stránka porovnania (vidí každý)
  POST /api/compare/prices     ... AI odhad cien a dostupnosti (iba prihlásení)
  POST /api/compare/verdict    ... AI verdikt po kúskoch – stream (iba prihlásení)

Technické parametre načítava prehliadač cez /api/motorcycles (API Ninjas),
porovnanie a grafy počíta JavaScript (static/js/compare.js).

API Ninjas NEPOSKYTUJE CENY. Preto ceny odhaduje AI a na stránke sú jasne
označené ako orientačné. Pre skutočné ceny stránka ponúka odkazy na inzeráty.
"""

import json
import re
import time

from flask import Blueprint, jsonify, render_template, request

import ai_client
from routes.ai import event_stream_response
from security import get_current_user, login_required

bp = Blueprint("compare", __name__)

MAX_BIKES = 4

# Jednoduchá vyrovnávacia pamäť (cache) pre odhady cien: rovnaká motorka sa
# za 24 hodín nepýta AI znova – šetrí to limity bezplatných modelov.
PRICE_CACHE = {}  # kľúč "yamaha|mt-07|2021" -> (čas uloženia, výsledok)
CACHE_SECONDS = 24 * 60 * 60


@bp.route("/porovnanie")
def page():
    # Popis jazdca z profilu – AI verdikt potom odporúča "na mieru"
    user = get_current_user()
    rider = ""
    if user:
        parts = []
        if user.license_category and user.license_category != "none":
            parts.append(f"vodičské oprávnenie {user.license_category}")
        elif user.license_category == "none":
            parts.append("zatiaľ bez vodičského oprávnenia")
        if user.style_label:
            parts.append(f"obľúbený štýl: {user.style_label}")
        if user.years_riding is not None:
            parts.append(f"jazdí {user.years_riding} rokov")
        rider = ", ".join(parts)
    return render_template("compare.html", active="porovnanie", max_bikes=MAX_BIKES, rider=rider)


# -----------------------------------------------------------------------------
# Pomocné funkcie
# -----------------------------------------------------------------------------


def _clean_bikes(data):
    """Z požiadavky vyberie max. 4 motorky a iba povolené, skrátené údaje.
    Text od používateľa ide do promptu AI – preto ho obmedzíme na dĺžku."""
    bikes = []
    for raw in (data.get("bikes") or [])[:MAX_BIKES]:
        if not isinstance(raw, dict):
            continue
        bike = {k: str(raw.get(k) or "").strip()[:80] for k in ("make", "model", "year", "type", "power", "displacement", "weight")}
        if bike["make"] and bike["model"]:
            bikes.append(bike)
    return bikes


def _bike_key(b):
    return f"{b['make']}|{b['model']}|{b['year']}".lower()


def _describe(b):
    """Krátky popis motorky pre AI, napr. 'Yamaha MT-07 (2021), Naked bike, 689 ccm, 73 HP'."""
    extra = ", ".join(v for v in (b["type"], b["displacement"], b["power"], b["weight"]) if v)
    return f"{b['make']} {b['model']} ({b['year'] or 'rok neuvedený'})" + (f", {extra}" if extra else "")


def _range(value):
    """Overí rozsah cien od AI: [od, do] ako celé čísla v rozumných hraniciach."""
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return None
    try:
        low, high = sorted(int(float(v)) for v in value)
    except (TypeError, ValueError):
        return None
    if not (200 <= low <= 300_000 and 200 <= high <= 300_000):
        return None
    return [low, high]


def _parse_json(text):
    """AI občas pridá k JSON-u text alebo ```json značky – vyberieme iba {...}."""
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ValueError("V odpovedi nie je JSON.")
    return json.loads(match.group(0))


# -----------------------------------------------------------------------------
# AI odhad cien a dostupnosti
# -----------------------------------------------------------------------------


@bp.route("/api/compare/prices", methods=["POST"])
@login_required
def prices():
    bikes = _clean_bikes(request.get_json(silent=True) or {})
    if not bikes:
        return jsonify({"error": "Vyber aspoň jednu motorku."}), 400

    now = time.time()
    results = {}
    missing = []
    for b in bikes:
        cached = PRICE_CACHE.get(_bike_key(b))
        if cached and now - cached[0] < CACHE_SECONDS:
            results[_bike_key(b)] = cached[1]
        else:
            missing.append(b)

    if missing:
        listing = "\n".join(f"{i + 1}. {_describe(b)}" for i, b in enumerate(missing))
        messages = [
            {
                "role": "system",
                "content": (
                    "Si odborník na trh s motorkami na Slovensku. Odpovedáš VÝHRADNE platným JSON-om "
                    "bez akéhokoľvek ďalšieho textu. Texty v JSON-e píš spisovnou slovenčinou."
                ),
            },
            {
                "role": "user",
                "content": (
                    "Odhadni orientačné ceny v eurách na Slovensku pre tieto motorky:\n"
                    f"{listing}\n\n"
                    "Vráť JSON v tvare:\n"
                    '{"bikes": [{"index": 1, "new_eur": [od, do] alebo null, "used_eur": [od, do] alebo null, '
                    '"availability": "new" | "used" | "rare", "note": "max. 110 znakov"}]}\n'
                    "- new_eur = cena novej motorky u predajcu (null, ak sa už nevyrába ani nepredáva nová)\n"
                    "- used_eur = bežná cena ojazdeného kusu daného ročníka v inzerátoch\n"
                    "- availability: new = dá sa kúpiť nová, used = už iba ojazdená, rare = ťažko zohnateľná\n"
                    "- note = jedna praktická poznámka (napr. drahší servis, dobrá zostatková hodnota)\n"
                    "Ak si nie si istý, daj širší rozsah. Nevymýšľaj presné čísla."
                ),
            },
        ]
        try:
            text, model = ai_client.complete(messages, reasoning=False, temperature=0.2)
            parsed = _parse_json(text)
        except ai_client.AIError as exc:
            return jsonify({"error": str(exc)}), 502
        except (ValueError, json.JSONDecodeError):
            return jsonify({"error": "AI vrátila odpoveď v zlom formáte. Skús to znova."}), 502

        for item in parsed.get("bikes") or []:
            try:
                b = missing[int(item.get("index")) - 1]
            except (TypeError, ValueError, IndexError):
                continue
            # Odpovedi AI tiež neveríme naslepo – každú hodnotu skontrolujeme
            availability = item.get("availability")
            entry = {
                "new_eur": _range(item.get("new_eur")),
                "used_eur": _range(item.get("used_eur")),
                "availability": availability if availability in ("new", "used", "rare") else None,
                "note": str(item.get("note") or "")[:140],
                "model": model,
            }
            results[_bike_key(b)] = entry
            PRICE_CACHE[_bike_key(b)] = (now, entry)

    return jsonify({"prices": [results.get(_bike_key(b)) for b in bikes]})


# -----------------------------------------------------------------------------
# AI verdikt (streamovaný – píše sa postupne ako v chate)
# -----------------------------------------------------------------------------


@bp.route("/api/compare/verdict", methods=["POST"])
@login_required
def verdict():
    data = request.get_json(silent=True) or {}
    bikes = _clean_bikes(data)
    if len(bikes) < 2:
        return event_stream_response(iter([ai_client.sse({"error": "Na verdikt vyber aspoň dve motorky."}), ai_client.sse("[DONE]")]))

    # Voliteľne: pre koho porovnanie je (skupina vodičáku, štýl) – z profilu
    rider = str(data.get("rider") or "").strip()[:200]
    listing = "\n".join(f"- {_describe(b)}" for b in bikes)

    messages = [
        {
            "role": "system",
            "content": (
                "Si MotoAI, skúsený motocyklový novinár. Píš VÝHRADNE spisovnou slovenčinou (nie po česky), "
                "vecne a zrozumiteľne. Nevymýšľaj technické údaje, ktoré nepoznáš."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Porovnaj tieto motorky:\n{listing}\n"
                + (f"\nJazdec: {rider}\n" if rider else "")
                + "\nŠtruktúra odpovede (použi nadpisy ###):\n"
                "### Stručne\n2–3 vety, v čom sa najviac líšia.\n"
                "### Pre koho je ktorá\nPre každú motorku jedna odrážka.\n"
                "### Silné a slabé stránky\nPre každú motorku krátko plusy a mínusy.\n"
                "### Moje odporúčanie\nKtorú by si vybral a prečo" + (" pre tohto jazdca" if rider else "") + ".\n"
                "Spolu najviac 250 slov."
            ),
        },
    ]
    return event_stream_response(ai_client.stream_events(messages))
