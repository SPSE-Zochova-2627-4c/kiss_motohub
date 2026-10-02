"""
routes/auth.py – registrácia, prihlásenie a odhlásenie.

Adresy:
  GET  /registracia   ... formulár registrácie
  POST /registracia   ... vytvorenie účtu
  GET  /prihlasenie   ... formulár prihlásenia
  POST /prihlasenie   ... overenie mena a hesla
  POST /odhlasenie    ... odhlásenie (POST + CSRF, aby ťa cudzí web nemohol odhlásiť)

Bezpečnostné pomôcky (hash hesla, CSRF, limit pokusov...) sú v security.py.
"""

from datetime import datetime, timezone

from flask import Blueprint, flash, redirect, render_template, request, url_for
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError

from extensions import db
from models import User
from security import (
    fake_password_check,
    get_current_user,
    login_limiter,
    login_user,
    logout_user,
    safe_next_url,
    validate_email,
    validate_password,
    validate_username,
)

bp = Blueprint("auth", __name__)


# -----------------------------------------------------------------------------
# REGISTRÁCIA
# -----------------------------------------------------------------------------


@bp.route("/registracia", methods=["GET", "POST"])
def register():
    # Prihlásený používateľ sa už registrovať nepotrebuje
    if get_current_user():
        return redirect(url_for("main.home"))

    next_url = request.values.get("next", "")

    if request.method == "GET":
        return render_template("auth/register.html", errors={}, values={}, next_url=next_url)

    # 1) Načítanie údajov z formulára (.strip() odstráni medzery na okrajoch)
    username = request.form.get("username", "").strip()
    email = request.form.get("email", "").strip().lower()  # e-mail vždy malými písmenami
    password = request.form.get("password", "")
    password2 = request.form.get("password2", "")

    # 2) Kontrola každého poľa – chyby zbierame do slovníka {pole: text chyby},
    #    aby sa pri formulári zobrazili všetky naraz
    errors = {}
    for field, error in (
        ("username", validate_username(username)),
        ("email", validate_email(email)),
        ("password", validate_password(password, username)),
    ):
        if error:
            errors[field] = error

    if not errors.get("password") and password != password2:
        errors["password2"] = "Heslá sa nezhodujú."

    # 3) Je meno / e-mail voľný? (porovnávame bez ohľadu na veľké a malé písmená,
    #    aby nemohli existovať účty "Jano" aj "jano")
    if "username" not in errors and User.query.filter(func.lower(User.username) == username.lower()).first():
        errors["username"] = "Toto používateľské meno je už obsadené."
    if "email" not in errors and User.query.filter(func.lower(User.email) == email).first():
        errors["email"] = "Účet s týmto e-mailom už existuje."

    if errors:
        # Heslá späť do formulára NEPOSIELAME – používateľ ich zadá znova
        return (
            render_template(
                "auth/register.html",
                errors=errors,
                values={"username": username, "email": email},
                next_url=next_url,
            ),
            400,
        )

    # 4) Uloženie nového používateľa – heslo sa uloží iba ako hash
    user = User(username=username, email=email)
    user.set_password(password)
    db.session.add(user)
    try:
        db.session.commit()
    except IntegrityError:
        # Niekto si to isté meno zaregistroval o zlomok sekundy skôr
        db.session.rollback()
        errors["username"] = "Toto meno alebo e-mail sa práve zaregistroval. Skús iné."
        return (
            render_template("auth/register.html", errors=errors, values={"username": username, "email": email}, next_url=next_url),
            400,
        )

    # 5) Po registrácii rovno prihlásiť
    login_user(user)
    flash(f"Vitaj v MotoHube, {user.username}! Účet bol úspešne vytvorený.", "success")
    return redirect(safe_next_url(next_url))


# -----------------------------------------------------------------------------
# PRIHLÁSENIE
# -----------------------------------------------------------------------------


@bp.route("/prihlasenie", methods=["GET", "POST"])
def login():
    if get_current_user():
        return redirect(url_for("main.home"))

    next_url = request.values.get("next", "")

    if request.method == "GET":
        return render_template("auth/login.html", error=None, identifier="", next_url=next_url)

    identifier = request.form.get("identifier", "").strip()  # meno ALEBO e-mail
    password = request.form.get("password", "")
    remember = request.form.get("remember") == "on"

    def fail(message, status=401):
        return render_template("auth/login.html", error=message, identifier=identifier, next_url=next_url), status

    # 1) Ochrana pred hádaním hesla – je táto IP adresa dočasne zablokovaná?
    client_ip = request.remote_addr or "neznáma"
    wait = login_limiter.seconds_until_unlock(client_ip)
    if wait:
        minutes = max(1, round(wait / 60))
        return fail(f"Príliš veľa neúspešných pokusov. Skús to znova o {minutes} min.", 429)

    if not identifier or not password:
        return fail("Zadaj meno alebo e-mail a heslo.", 400)

    # 2) Nájdenie používateľa podľa mena alebo e-mailu
    user = User.query.filter(
        or_(func.lower(User.username) == identifier.lower(), func.lower(User.email) == identifier.lower())
    ).first()

    # 3) Overenie hesla
    if user is None:
        fake_password_check()  # rovnako dlhá odpoveď ako pri existujúcom účte
        ok = False
    else:
        ok = user.check_password(password)

    if not ok:
        login_limiter.register_failure(client_ip)
        # Zámerne NEPREZRADÍME, či neexistuje účet alebo je zlé heslo –
        # útočník by si tak vedel overiť, ktoré e-maily sú zaregistrované.
        return fail("Nesprávne meno/e-mail alebo heslo.")

    # 4) Úspech – vynulovať počítadlo, zapísať čas prihlásenia, prihlásiť
    login_limiter.reset(client_ip)
    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()
    login_user(user, remember=remember)
    flash(f"Vitaj späť, {user.username}!", "success")
    return redirect(safe_next_url(next_url))


# -----------------------------------------------------------------------------
# ODHLÁSENIE
# -----------------------------------------------------------------------------


@bp.route("/odhlasenie", methods=["POST"])
def logout():
    # CSRF token sa kontroluje globálne v app.py pre každý POST
    logout_user()
    flash("Bol si úspešne odhlásený.", "info")
    return redirect(url_for("main.home"))
