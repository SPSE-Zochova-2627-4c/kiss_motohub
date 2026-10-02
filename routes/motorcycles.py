"""
routes/motorcycles.py – API pre databázu motoriek.

Náš server funguje ako "sprostredkovateľ": prehliadač sa pýta nás
(/api/motorcycles?make=yamaha&model=r1), my sa opýtame API Ninjas
s tajným API kľúčom a výsledok vrátime. Kľúč tak nikdy neopustí server
a nikto ho nevidí v zdrojovom kóde stránky.
"""

import re

import requests
from flask import Blueprint, jsonify, request

import config

bp = Blueprint("motorcycles", __name__)

NINJA_MOTORCYCLES_URL = "https://api.api-ninjas.com/v1/motorcycles"


@bp.route("/api/motorcycles")
def api_motorcycles():
    """Prehľadáva databázu motoriek cez API Ninjas.

    Query parametre napr.: ?make=yamaha&model=r1&year=2024
    """
    if not config.NINJA_API_KEY:
        return jsonify({"error": "Chýba NINJA_API_KEY v config.py / .env"}), 400

    params = {
        key: value
        for key, value in request.args.items()
        if key in ("make", "model", "year", "limit", "offset") and value
    }
    if not params.get("make"):
        return jsonify({"error": "Zadaj aspoň značku (make)."}), 400

    try:
        resp = requests.get(
            NINJA_MOTORCYCLES_URL,
            headers={"X-Api-Key": config.NINJA_API_KEY},
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        detail = ""
        if getattr(exc, "response", None) is not None:
            detail = f" ({exc.response.status_code}: {exc.response.text[:300]})"
        return jsonify({"error": f"API Ninjas zlyhalo: {exc}{detail}"}), 502

    bikes = resp.json()
    if not isinstance(bikes, list):
        return jsonify(bikes)

    return jsonify(_filter_bikes(bikes, params.get("make", ""), params.get("model", "")))


def _norm(text):
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def _filter_bikes(bikes, make, model):
    """API Ninjas hľadá podľa čiastočnej zhody, takže 'r1' vráti aj R1200GS,
    R125 a podobne. Tu necháme len modely, kde hľadaný výraz stojí
    samostatne (napr. 'YZF-R1', 'YZF-R1M', 'R1 SP'), nie ako časť čísla."""
    make_n = _norm(make)
    result = []
    if model:
        tokens = re.findall(r"[a-z]+|[0-9]+", model.lower())
        q = r"[\s\-_/]*".join(re.escape(t) for t in tokens)
        pattern = re.compile(r"(?<![a-z0-9])" + q + r"(?![0-9])")
    for bike in bikes:
        if make_n and make_n not in _norm(bike.get("make")):
            continue
        if model and not pattern.search((bike.get("model") or "").lower()):
            continue
        result.append(bike)

    # zoradiť: najnovšie ročníky prvé, najkratší (najpresnejší) názov modelu prvý
    def year_of(b):
        try:
            return int(str(b.get("year") or 0)[:4])
        except ValueError:
            return 0

    result.sort(key=lambda b: (-year_of(b), len(b.get("model") or "")))
    return result


# =============================================================================
# "Páči sa mi" a "Uložiť" – iba pre prihlásených
# =============================================================================

from extensions import db  # noqa: E402
from models import BikeMark  # noqa: E402
from security import get_current_user, login_required  # noqa: E402


@bp.route("/api/bikes/marks")
@login_required
def bike_marks():
    """Vráti všetky motorky, ktoré si prihlásený používateľ označil.
    motorky.js podľa toho vyplní srdiečka a záložky pri výsledkoch."""
    marks = get_current_user().bike_marks.all()
    return jsonify({"marks": [m.to_dict() for m in marks]})


@bp.route("/api/bikes/mark", methods=["POST"])
@login_required
def toggle_bike_mark():
    """Prepne označenie motorky: ak ešte nie je označená, označí ju, inak
    označenie zruší. Telo požiadavky: {"kind": "like"|"save", "make", "model", "year"}"""
    data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    make = str(data.get("make") or "").strip()[:60]
    model = str(data.get("model") or "").strip()[:80]
    year = str(data.get("year") or "").strip()[:10]

    if kind not in ("like", "save") or not make or not model:
        return jsonify({"error": "Neplatné údaje o motorke."}), 400

    user = get_current_user()
    existing = user.bike_marks.filter_by(kind=kind, make=make, model=model, year=year).first()
    if existing:
        db.session.delete(existing)
        active = False
    else:
        db.session.add(BikeMark(user_id=user.id, kind=kind, make=make, model=model, year=year))
        active = True
    db.session.commit()
    return jsonify({"active": active, "kind": kind})
