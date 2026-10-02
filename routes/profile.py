"""
routes/profile.py – profil používateľa.

Adresy (všetky iba pre prihlásených – @login_required):
  GET  /profil                     ... presmeruje na môj profil
  GET  /profil/<meno>              ... zobrazenie profilu (môjho alebo cudzieho)
  GET  /profil/upravit             ... formulár úpravy profilu
  POST /profil/upravit             ... uloženie údajov a preferencií
  POST /profil/fotka               ... nahratie profilovky
  POST /profil/fotka/zmazat        ... odstránenie profilovky
  POST /profil/banner              ... nahratie banneru (hlavička profilu)
  POST /profil/banner/zmazat       ... odstránenie banneru
  POST /profil/banner/tema         ... farebná téma banneru (bez obrázka)
  POST /profil/email               ... zmena e-mailu (vyžaduje heslo)
  POST /profil/heslo               ... zmena hesla (vyžaduje staré heslo)
  POST /profil/zmazat              ... zmazanie účtu (vyžaduje heslo)
  POST /profil/motorka/<id>/zmazat ... odobratie uloženej / obľúbenej motorky
  GET  /avatar/<subor>             ... samotný obrázok profilovky
  GET  /banner/<subor>             ... samotný obrázok banneru
"""

from datetime import datetime, timezone

from flask import Blueprint, abort, flash, redirect, render_template, request, send_from_directory, url_for
from sqlalchemy import func

import config
from extensions import db
from models import BANNER_THEMES, LICENSE_CHOICES, STYLE_CHOICES, BikeMark, Friendship, User
from security import get_current_user, login_required, logout_user, validate_email, validate_password
from uploads import UploadError, delete_avatar, delete_banner, parse_crop, save_avatar, save_banner

bp = Blueprint("profile", __name__)


# -----------------------------------------------------------------------------
# Pomocné funkcie
# -----------------------------------------------------------------------------


def friend_state(viewer, other):
    """Aký je vzťah medzi prihláseným (viewer) a zobrazeným (other) používateľom?

    Vráti jedno z: "self", "friends", "pending_out" (ja som poslal žiadosť),
    "pending_in" (on poslal žiadosť mne), "none". Podľa toho šablóna zobrazí
    správne tlačidlo (Pridať / Zrušiť žiadosť / Prijať / Odobrať).
    """
    if viewer.id == other.id:
        return "self", None
    rel = Friendship.between(viewer.id, other.id)
    if rel is None:
        return "none", None
    if rel.status == "accepted":
        return "friends", rel
    return ("pending_out" if rel.requester_id == viewer.id else "pending_in"), rel


def _clean(value, max_len):
    """Odstráni medzery na okrajoch a oreže text na povolenú dĺžku."""
    return (value or "").strip()[:max_len] or None


# -----------------------------------------------------------------------------
# Zobrazenie profilu
# -----------------------------------------------------------------------------


@bp.route("/profil")
@login_required
def my_profile():
    return redirect(url_for("profile.view", username=get_current_user().username))


@bp.route("/profil/<username>")
@login_required
def view(username):
    # vyhľadanie bez ohľadu na veľké/malé písmená
    user = User.query.filter(func.lower(User.username) == username.lower()).first()
    if user is None:
        flash("Taký používateľ neexistuje.", "error")
        return redirect(url_for("friends.index"))
    viewer = get_current_user()
    state, relation = friend_state(viewer, user)

    # Súkromný profil vidí iba majiteľ a jeho priatelia
    can_see = user.profile_public or state in ("self", "friends")

    saved = liked = friends = []
    if can_see:
        saved = user.bike_marks.filter_by(kind="save").order_by(BikeMark.created_at.desc()).all()
        liked = user.bike_marks.filter_by(kind="like").order_by(BikeMark.created_at.desc()).all()
        friends = Friendship.friends_of(user.id)

    return render_template(
        "profile/view.html",
        active="profil",
        profile=user,
        state=state,
        relation=relation,
        can_see=can_see,
        saved=saved,
        liked=liked,
        friends=friends,
    )


# -----------------------------------------------------------------------------
# Úprava profilu
# -----------------------------------------------------------------------------


@bp.route("/profil/upravit", methods=["GET", "POST"])
@login_required
def edit():
    user = get_current_user()
    errors = {}

    if request.method == "POST":
        form = request.form
        license_values = {v for v, _ in LICENSE_CHOICES}
        style_values = {v for v, _ in STYLE_CHOICES}

        # Výberové polia – povolíme iba hodnoty zo zoznamu (nikdy neveríme prehliadaču)
        license_category = form.get("license_category", "")
        riding_style = form.get("riding_style", "")
        if license_category not in license_values:
            errors["license_category"] = "Neplatná skupina vodičského oprávnenia."
        if riding_style not in style_values:
            errors["riding_style"] = "Neplatný štýl jazdy."

        # Rok, odkedy jazdí – musí to byť rozumné číslo
        riding_since = None
        raw_year = form.get("riding_since", "").strip()
        if raw_year:
            this_year = datetime.now(timezone.utc).year
            if not raw_year.isdigit() or not (1940 <= int(raw_year) <= this_year):
                errors["riding_since"] = f"Zadaj rok medzi 1940 a {this_year}."
            else:
                riding_since = int(raw_year)

        if not errors:
            user.display_name = _clean(form.get("display_name"), 40)
            user.bio = _clean(form.get("bio"), 300)
            user.location = _clean(form.get("location"), 60)
            user.current_bike = _clean(form.get("current_bike"), 60)
            user.license_category = license_category or None
            user.riding_style = riding_style or None
            user.riding_since = riding_since
            user.profile_public = form.get("profile_public") == "on"
            db.session.commit()
            flash("Profil bol uložený.", "success")
            return redirect(url_for("profile.view", username=user.username))

    return render_template(
        "profile/edit.html",
        active="profil",
        user=user,
        errors=errors,
        license_choices=LICENSE_CHOICES,
        style_choices=STYLE_CHOICES,
        banner_themes=BANNER_THEMES,
        max_upload_mb=config.MAX_UPLOAD_MB,
    )


# -----------------------------------------------------------------------------
# Profilovka
# -----------------------------------------------------------------------------


@bp.route("/profil/fotka", methods=["POST"])
@login_required
def upload_avatar():
    user = get_current_user()
    try:
        # kontrola + výrez vybraný v prehliadači + WEBP (uploads.py)
        new_name = save_avatar(request.files.get("avatar"), parse_crop(request.form))
    except UploadError as exc:
        flash(str(exc), "error")
        return redirect(url_for("profile.edit"))

    delete_avatar(user.avatar_filename)  # starú fotku zmažeme zo servera
    user.avatar_filename = new_name
    db.session.commit()
    flash("Profilová fotka bola zmenená.", "success")
    return redirect(url_for("profile.edit"))


@bp.route("/profil/fotka/zmazat", methods=["POST"])
@login_required
def remove_avatar():
    user = get_current_user()
    delete_avatar(user.avatar_filename)
    user.avatar_filename = None
    db.session.commit()
    flash("Profilová fotka bola odstránená.", "info")
    return redirect(url_for("profile.edit"))


@bp.route("/profil/banner", methods=["POST"])
@login_required
def upload_banner():
    user = get_current_user()
    try:
        new_name = save_banner(request.files.get("banner"), parse_crop(request.form))
    except UploadError as exc:
        flash(str(exc), "error")
        return redirect(url_for("profile.edit"))

    delete_banner(user.banner_filename)
    user.banner_filename = new_name
    db.session.commit()
    flash("Banner bol zmenený.", "success")
    return redirect(url_for("profile.edit"))


@bp.route("/profil/banner/zmazat", methods=["POST"])
@login_required
def remove_banner():
    user = get_current_user()
    delete_banner(user.banner_filename)
    user.banner_filename = None
    db.session.commit()
    flash("Vlastný banner bol odstránený – zobrazuje sa farebná téma.", "info")
    return redirect(url_for("profile.edit"))


@bp.route("/profil/banner/tema", methods=["POST"])
@login_required
def set_banner_theme():
    theme = request.form.get("theme", "")
    if theme not in dict(BANNER_THEMES):  # povolené sú iba témy zo zoznamu
        flash("Neznáma téma.", "error")
        return redirect(url_for("profile.edit"))
    user = get_current_user()
    user.banner_theme = theme
    db.session.commit()
    flash("Farebná téma bola uložená.", "success")
    return redirect(url_for("profile.edit"))


@bp.route("/banner/<path:filename>")
def banner(filename):
    return send_from_directory(config.BANNER_DIR, filename, max_age=60 * 60 * 24 * 30)


@bp.route("/avatar/<path:filename>")
def avatar(filename):
    """Vráti obrázok profilovky. send_from_directory nedovolí vyjsť mimo
    priečinka (ochrana pred ../ v názve súboru)."""
    response = send_from_directory(config.AVATAR_DIR, filename, max_age=60 * 60 * 24 * 30)
    return response


# -----------------------------------------------------------------------------
# Bezpečnosť účtu – e-mail, heslo, zmazanie
# -----------------------------------------------------------------------------


@bp.route("/profil/email", methods=["POST"])
@login_required
def change_email():
    user = get_current_user()
    new_email = request.form.get("email", "").strip().lower()
    password = request.form.get("current_password", "")

    # Citlivé zmeny vždy potvrdzujeme heslom – keby niekto zabudol odhlásiť
    # sa na cudzom počítači, ďalší človek mu nemôže prevziať účet.
    if not user.check_password(password):
        flash("Nesprávne aktuálne heslo – e-mail nebol zmenený.", "error")
    elif error := validate_email(new_email):
        flash(error, "error")
    elif new_email == user.email:
        flash("Toto už je tvoj aktuálny e-mail.", "info")
    elif User.query.filter(func.lower(User.email) == new_email).first():
        flash("Účet s týmto e-mailom už existuje.", "error")
    else:
        user.email = new_email
        db.session.commit()
        flash("E-mail bol zmenený.", "success")
    return redirect(url_for("profile.edit") + "#ucet")


@bp.route("/profil/heslo", methods=["POST"])
@login_required
def change_password():
    user = get_current_user()
    current = request.form.get("current_password", "")
    new = request.form.get("new_password", "")
    new2 = request.form.get("new_password2", "")

    if not user.check_password(current):
        flash("Nesprávne aktuálne heslo.", "error")
    elif error := validate_password(new, user.username):
        flash(error, "error")
    elif new != new2:
        flash("Nové heslá sa nezhodujú.", "error")
    elif user.check_password(new):
        flash("Nové heslo musí byť iné ako to súčasné.", "error")
    else:
        user.set_password(new)  # uloží sa nový hash s novou soľou
        db.session.commit()
        flash("Heslo bolo zmenené.", "success")
    return redirect(url_for("profile.edit") + "#ucet")


@bp.route("/profil/zmazat", methods=["POST"])
@login_required
def delete_account():
    user = get_current_user()
    if not user.check_password(request.form.get("current_password", "")):
        flash("Nesprávne heslo – účet nebol zmazaný.", "error")
        return redirect(url_for("profile.edit") + "#ucet")

    # Zmažeme všetko, čo k účtu patrí: fotky, priateľstvá, motorky a účet samotný
    delete_avatar(user.avatar_filename)
    delete_banner(user.banner_filename)
    Friendship.query.filter(
        db.or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id)
    ).delete(synchronize_session=False)
    db.session.delete(user)  # BikeMark sa zmažú automaticky (cascade v models.py)
    db.session.commit()
    logout_user()
    flash("Tvoj účet bol natrvalo zmazaný. Ďakujeme, že si jazdil s nami.", "info")
    return redirect(url_for("main.home"))


# -----------------------------------------------------------------------------
# Uložené / obľúbené motorky
# -----------------------------------------------------------------------------


@bp.route("/profil/motorka/<int:mark_id>/zmazat", methods=["POST"])
@login_required
def remove_mark(mark_id):
    mark = db.session.get(BikeMark, mark_id)
    # Zmazať môže iba vlastník – inak by cudzí človek mohol meniť čísla v adrese
    if mark is None or mark.user_id != get_current_user().id:
        abort(404)
    db.session.delete(mark)
    db.session.commit()
    flash(f"{mark.title} bola odobratá.", "info")
    return redirect(url_for("profile.my_profile") + ("#ulozene" if mark.kind == "save" else "#oblubene"))
