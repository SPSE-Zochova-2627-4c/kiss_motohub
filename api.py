# API pre JavaScript: databáza motoriek, uložené motorky, AI chat a porovnanie
import requests
from flask import Blueprint, Response, jsonify, request, session

import ai
import config
from models import SavedBike, db

api = Blueprint("api", __name__)


def model_matches(model, word):
    name = model.lower().replace(" ", "").replace("-", "")
    pos = name.find(word)
    next_char = name[pos + len(word):pos + len(word) + 1]
    # keď slovo končí číslom, nesmie za ním pokračovať ďalšie číslo ("r1" nemá nájsť "r1200")
    return pos != -1 and not (word[-1].isdigit() and next_char.isdigit())


@api.route("/api/motorky")
def search_bikes():
    """Vyhľadá motorky cez API Ninjas. API kľúč zostáva na serveri."""
    words = request.args.get("model", "").lower().replace("-", " ").split()

    # API hľadá model iba ako súvislý text – "duke 390" by nenašlo "390 Duke".
    # Preto mu pošleme len jedno slovo (najlepšie to s číslom, je najpresnejšie).
    params = {"make": request.args.get("make", ""), "year": request.args.get("year", "")}
    if words:
        params["model"] = next((w for w in words if any(c.isdigit() for c in w)), words[0])

    r = requests.get("https://api.api-ninjas.com/v1/motorcycles", headers={"X-Api-Key": config.NINJA_API_KEY},
                     params={k: v for k, v in params.items() if v}, timeout=15)
    bikes = r.json() if r.ok else []

    # necháme iba motorky, ktoré obsahujú všetky hľadané slová (v ľubovoľnom poradí)
    return jsonify([b for b in bikes if all(model_matches(b["model"], w) for w in words)])


@api.route("/api/ulozene", methods=["GET", "POST"])
def saved_bikes():
    """GET = moje označené motorky, POST = pridať / odobrať označenie (páči sa mi, uložiť)."""
    if "user_id" not in session:
        return jsonify({"error": "login"}), 401
    uid = session["user_id"]

    if request.method == "POST":
        d = request.json
        bike = SavedBike.query.filter_by(user_id=uid, kind=d["kind"], make=d["make"],
                                         model=d["model"], year=str(d["year"])).first()
        if bike:
            db.session.delete(bike)
        else:
            db.session.add(SavedBike(user_id=uid, kind=d["kind"], make=d["make"],
                                     model=d["model"], year=str(d["year"])))
        db.session.commit()

    bikes = SavedBike.query.filter_by(user_id=uid).all()
    return jsonify([{"kind": b.kind, "make": b.make, "model": b.model, "year": b.year} for b in bikes])


@api.route("/api/chat", methods=["POST"])
def chat():
    """MotoAI chat – odpoveď sa posiela po kúskoch (stream)."""
    if "user_id" not in session:
        return "Pre MotoAI sa musíš prihlásiť.", 401
    messages = [{"role": "system", "content": ai.SYSTEM_PROMPT}] + request.json["messages"][-10:]
    return Response(ai.stream(messages), mimetype="text/plain")


@api.route("/api/verdikt", methods=["POST"])
def verdict():
    """AI porovná vybrané motorky a odporučí jednu."""
    if "user_id" not in session:
        return "Pre verdikt sa musíš prihlásiť.", 401
    bikes = ", ".join(request.json["bikes"])
    question = (f"Porovnaj motorky: {bikes}. Napíš krátko, pre koho je ktorá, ich plusy a mínusy "
                f"a ktorú by si odporučil. Najviac 200 slov.")
    messages = [{"role": "system", "content": ai.SYSTEM_PROMPT}, {"role": "user", "content": question}]
    return Response(ai.stream(messages), mimetype="text/plain")


@api.route("/api/ceny", methods=["POST"])
def prices():
    """Odhad cien od AI – API Ninjas ceny neposkytuje."""
    if "user_id" not in session:
        return jsonify({"error": "login"}), 401
    bikes = request.json["bikes"]
    question = ("Odhadni orientačnú cenu v eurách na Slovensku pre tieto motorky: " + ", ".join(bikes) +
                ". Pre každú napíš jeden riadok v tvare: Názov – nová: X €, ojazdená: Y €. Nič iné nepíš.")
    answer = ai.ask([{"role": "system", "content": ai.SYSTEM_PROMPT}, {"role": "user", "content": question}])
    return jsonify({"text": answer or "AI je momentálne preťažená."})
