"""
routes/friends.py – priatelia: vyhľadávanie jazdcov a žiadosti o priateľstvo.

Adresy (iba pre prihlásených):
  GET  /priatelia?q=...                 ... zoznam priateľov, žiadosti a vyhľadávanie
  POST /priatelia/pridat/<user_id>      ... poslať žiadosť (alebo prijať protižiadosť)
  POST /priatelia/prijat/<user_id>      ... prijať žiadosť od používateľa
  POST /priatelia/odobrat/<user_id>     ... odmietnuť / zrušiť žiadosť alebo odobrať priateľa

Ako funguje priateľstvo (tabuľka friendships v models.py):
  1. Jano pošle žiadosť Petrovi  -> riadok (Jano -> Peter, "pending")
  2. Peter ju prijme             -> status sa zmení na "accepted"
  3. Odmietnutie / odobratie     -> riadok sa zmaže
"""

from datetime import datetime, timezone

from flask import Blueprint, flash, redirect, render_template, request, url_for
from sqlalchemy import func, or_

from extensions import db
from models import Friendship, User
from routes.profile import friend_state
from security import get_current_user, login_required, safe_next_url

bp = Blueprint("friends", __name__)


def _back():
    """Vráti používateľa na stránku, z ktorej akciu spustil (profil / priatelia)."""
    return redirect(safe_next_url(request.form.get("next") or url_for("friends.index")))


def _target_user(user_id):
    """Nájde cieľového používateľa; nesmie to byť on sám."""
    other = db.session.get(User, user_id)
    if other is None or other.id == get_current_user().id:
        return None
    return other


@bp.route("/priatelia")
@login_required
def index():
    me = get_current_user()
    query = request.args.get("q", "").strip()[:40]
    results = []

    if len(query) >= 2:
        # Znaky % a _ majú v SQL LIKE špeciálny význam – "zneškodníme" ich,
        # aby hľadanie "%" nevrátilo všetkých používateľov.
        safe = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{safe}%"
        results = (
            User.query.filter(
                User.id != me.id,
                or_(User.username.ilike(pattern, escape="\\"), User.display_name.ilike(pattern, escape="\\")),
            )
            .order_by(func.length(User.username))
            .limit(20)
            .all()
        )

    # Ku každému výsledku zistíme stav vzťahu, aby sa ukázalo správne tlačidlo
    results = [(u, friend_state(me, u)[0]) for u in results]

    return render_template(
        "friends.html",
        active="priatelia",
        query=query,
        results=results,
        friends=Friendship.friends_of(me.id),
        incoming=Friendship.incoming_requests(me.id),
        outgoing=Friendship.outgoing_requests(me.id),
    )


@bp.route("/priatelia/pridat/<int:user_id>", methods=["POST"])
@login_required
def add(user_id):
    me = get_current_user()
    other = _target_user(user_id)
    if other is None:
        flash("Tohto používateľa nemožno pridať.", "error")
        return _back()

    rel = Friendship.between(me.id, other.id)
    if rel is None:
        db.session.add(Friendship(requester_id=me.id, addressee_id=other.id))
        flash(f"Žiadosť o priateľstvo bola odoslaná používateľovi {other.name}.", "success")
    elif rel.status == "pending" and rel.addressee_id == me.id:
        # On už poslal žiadosť mne -> rovno ju prijmeme
        rel.status = "accepted"
        rel.accepted_at = datetime.now(timezone.utc)
        flash(f"Ty a {other.name} ste teraz priatelia.", "success")
    else:
        flash("Žiadosť už existuje alebo ste už priatelia.", "info")
    db.session.commit()
    return _back()


@bp.route("/priatelia/prijat/<int:user_id>", methods=["POST"])
@login_required
def accept(user_id):
    me = get_current_user()
    # Prijať môže iba ADRESÁT žiadosti – nie ten, kto ju poslal
    rel = Friendship.query.filter_by(requester_id=user_id, addressee_id=me.id, status="pending").first()
    if rel is None:
        flash("Žiadosť sa nenašla.", "error")
    else:
        rel.status = "accepted"
        rel.accepted_at = datetime.now(timezone.utc)
        db.session.commit()
        flash(f"Ty a {rel.requester.name} ste teraz priatelia.", "success")
    return _back()


@bp.route("/priatelia/odobrat/<int:user_id>", methods=["POST"])
@login_required
def remove(user_id):
    """Jedna akcia pre: odmietnutie žiadosti, zrušenie mojej žiadosti
    a odobratie priateľa – vo všetkých prípadoch sa vzťah zmaže."""
    me = get_current_user()
    rel = Friendship.between(me.id, user_id)
    if rel is None:
        flash("Takýto vzťah neexistuje.", "error")
        return _back()

    other = rel.addressee if rel.requester_id == me.id else rel.requester
    if rel.status == "accepted":
        message = f"{other.name} bol odobratý z priateľov."
    elif rel.requester_id == me.id:
        message = "Žiadosť bola zrušená."
    else:
        message = "Žiadosť bola odmietnutá."
    db.session.delete(rel)
    db.session.commit()
    flash(message, "info")
    return _back()
