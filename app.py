# MotoHub – hlavný súbor aplikácie (stránky, prihlásenie, profil, priatelia, trasy, lokácie)
import json
import os
import uuid
from functools import wraps

from flask import Flask, flash, redirect, render_template, request, session, url_for
from PIL import Image, ImageOps
from werkzeug.security import check_password_hash, generate_password_hash

import config
import recommended
from models import Friendship, Place, Review, Route, RouteLike, SavedBike, User, db

app = Flask(__name__)
app.config["SECRET_KEY"] = config.SECRET_KEY
app.config["SQLALCHEMY_DATABASE_URI"] = config.DATABASE
db.init_app(app)

with app.app_context():
    db.create_all()  # vytvorí tabuľky, ak ešte neexistujú

os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)

from api import api  # noqa: E402  (API pre JavaScript – motorky, AI, porovnanie)
app.register_blueprint(api)


# ---------- pomocné funkcie ----------

def current_user():
    """Prihlásený používateľ alebo None."""
    if "user_id" in session:
        return db.session.get(User, session["user_id"])
    return None


def login_required(view):
    """Dekorátor – stránku uvidí iba prihlásený používateľ."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            flash("Najprv sa prihlás.")
            return redirect(url_for("login"))
        return view(*args, **kwargs)
    return wrapper


@app.context_processor
def add_user_to_templates():
    # vďaka tomu môžeme v každej šablóne použiť {{ user }}
    user = current_user()
    requests_count = Friendship.query.filter_by(to_id=user.id, accepted=False).count() if user else 0
    return {"user": user, "requests_count": requests_count}


def save_image(file, size):
    """Uloží nahratý obrázok – oreže ho podľa výrezu z prehliadača a zmenší."""
    img = ImageOps.exif_transpose(Image.open(file)).convert("RGB")

    # výrez posiela cropper.js ako podiely 0–1 (napr. x=0.25 = štvrtina šírky)
    try:
        x, y, w, h = (float(request.form[k]) for k in ("x", "y", "w", "h"))
        img = img.crop((int(x * img.width), int(y * img.height),
                        int((x + w) * img.width), int((y + h) * img.height)))
    except (KeyError, ValueError):
        pass  # bez výrezu -> stred obrázka

    img = ImageOps.fit(img, size)
    name = uuid.uuid4().hex + ".jpg"
    img.save(os.path.join(config.UPLOAD_FOLDER, name), quality=85)
    return name


# ---------- verejné stránky ----------

@app.route("/")
def home():
    return render_template("index.html", active="home")


@app.route("/motorky")
def motorky():
    return render_template("motorky.html", active="motorky")


@app.route("/porovnanie")
def porovnanie():
    return render_template("compare.html", active="porovnanie")


# ---------- registrácia a prihlásenie ----------

@app.route("/registracia", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"].strip()
        email = request.form["email"].strip()
        password = request.form["password"]

        if not username or not email or not password:
            flash("Vyplň všetky polia.")
        elif password != request.form["password2"]:
            flash("Heslá sa nezhodujú.")
        elif User.query.filter((User.username == username) | (User.email == email)).first():
            flash("Toto meno alebo e-mail už niekto používa.")
        else:
            user = User(username=username, email=email, password=generate_password_hash(password))
            db.session.add(user)
            db.session.commit()
            session["user_id"] = user.id
            flash("Účet bol vytvorený, vitaj!")
            return redirect(url_for("home"))
    return render_template("register.html")


@app.route("/prihlasenie", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        name = request.form["username"].strip()
        user = User.query.filter((User.username == name) | (User.email == name)).first()
        if user and check_password_hash(user.password, request.form["password"]):
            session["user_id"] = user.id
            return redirect(url_for("home"))
        flash("Nesprávne meno alebo heslo.")
    return render_template("login.html")


@app.route("/odhlasenie")
def logout():
    session.clear()
    return redirect(url_for("home"))


# ---------- profil ----------

@app.route("/profil")
@login_required
def my_profile():
    return redirect(url_for("profile", username=current_user().username))


@app.route("/profil/<username>")
@login_required
def profile(username):
    person = User.query.filter_by(username=username).first_or_404()
    me = current_user()
    return render_template(
        "profile.html", active="profil", person=person,
        friend=friendship(me.id, person.id),
        saved=SavedBike.query.filter_by(user_id=person.id, kind="save").all(),
        liked=SavedBike.query.filter_by(user_id=person.id, kind="like").all(),
        friends=friends_of(person.id),
        routes=Route.query.filter_by(user_id=person.id).all(),
        places=Place.query.filter_by(user_id=person.id).all(),
    )


@app.route("/profil/upravit", methods=["GET", "POST"])
@login_required
def edit_profile():
    me = current_user()
    if request.method == "POST":
        for field in ("display_name", "bio", "location", "license", "riding_style", "current_bike"):
            setattr(me, field, request.form.get(field, "").strip())
        db.session.commit()
        flash("Profil bol uložený.")
        return redirect(url_for("profile", username=me.username))
    return render_template("edit_profile.html", active="profil", icons=AVATAR_ICONS, colors=BANNER_COLORS)


@app.route("/profil/fotka", methods=["POST"])
@login_required
def upload_photo():
    me = current_user()
    kind = request.form["kind"]
    if kind not in ("avatar", "banner"):   # inak by sa dal prepísať hocijaký stĺpec, napr. heslo
        return redirect(url_for("edit_profile"))
    size = (300, 300) if kind == "avatar" else (1500, 300)
    try:
        setattr(me, kind, save_image(request.files["photo"], size))
        db.session.commit()
        flash("Obrázok bol zmenený.")
    except OSError:
        flash("Tento súbor nie je obrázok.")
    return redirect(url_for("edit_profile"))


# profilovka a banner bez nahrávania obrázka – ikonka alebo farba
AVATAR_ICONS = ["🏍️", "🛵", "🏁", "🔥", "⚡", "🐺", "🦅", "💀", "🌙", "⭐"]
BANNER_COLORS = ["fialova", "zapad", "ocean", "les", "lava", "grafit"]


@app.route("/profil/vzhlad", methods=["POST"])
@login_required
def set_look():
    me = current_user()
    if request.form.get("icon") in AVATAR_ICONS:
        me.avatar = request.form["icon"]
    if request.form.get("color") in BANNER_COLORS:
        me.banner = request.form["color"]
    db.session.commit()
    return redirect(url_for("edit_profile"))


@app.route("/profil/heslo", methods=["POST"])
@login_required
def change_password():
    me = current_user()
    if check_password_hash(me.password, request.form["old"]):
        me.password = generate_password_hash(request.form["new"])
        db.session.commit()
        flash("Heslo bolo zmenené.")
    else:
        flash("Staré heslo nie je správne.")
    return redirect(url_for("edit_profile"))


@app.route("/motorka/<int:bike_id>/zmazat")
@login_required
def remove_bike(bike_id):
    bike = SavedBike.query.filter_by(id=bike_id, user_id=current_user().id).first_or_404()
    db.session.delete(bike)
    db.session.commit()
    return redirect(url_for("my_profile"))


# ---------- priatelia ----------

def friendship(a, b):
    """Nájde vzťah medzi dvoma používateľmi (v ľubovoľnom smere)."""
    return Friendship.query.filter(
        ((Friendship.from_id == a) & (Friendship.to_id == b)) |
        ((Friendship.from_id == b) & (Friendship.to_id == a))
    ).first()


def friends_of(user_id):
    rows = Friendship.query.filter(
        Friendship.accepted, (Friendship.from_id == user_id) | (Friendship.to_id == user_id)
    ).all()
    ids = [r.to_id if r.from_id == user_id else r.from_id for r in rows]
    return User.query.filter(User.id.in_(ids)).all()


@app.route("/priatelia")
@login_required
def friends():
    me = current_user()
    q = request.args.get("q", "").strip()
    results = User.query.filter(User.username.contains(q), User.id != me.id).all() if q else []
    incoming = Friendship.query.filter_by(to_id=me.id, accepted=False).all()
    return render_template(
        "friends.html", active="profil", q=q, results=results, friends=friends_of(me.id),
        incoming=[db.session.get(User, f.from_id) for f in incoming],
    )


@app.route("/priatelia/pridat/<int:user_id>")
@login_required
def add_friend(user_id):
    me = current_user()
    if not friendship(me.id, user_id):
        db.session.add(Friendship(from_id=me.id, to_id=user_id))
        db.session.commit()
        flash("Žiadosť bola odoslaná.")
    return redirect(request.referrer or url_for("friends"))


@app.route("/priatelia/prijat/<int:user_id>")
@login_required
def accept_friend(user_id):
    f = Friendship.query.filter_by(from_id=user_id, to_id=current_user().id).first_or_404()
    f.accepted = True
    db.session.commit()
    return redirect(request.referrer or url_for("friends"))


@app.route("/priatelia/odobrat/<int:user_id>")
@login_required
def remove_friend(user_id):
    f = friendship(current_user().id, user_id)
    if f:
        db.session.delete(f)
        db.session.commit()
    return redirect(request.referrer or url_for("friends"))


# ---------- trasy ----------

@app.route("/trasy")
def routes():
    all_routes = Route.query.order_by(Route.id.desc()).all()
    return render_template("routes.html", active="trasy", routes=all_routes, tips=recommended.ROUTES)


@app.route("/trasy/nova", methods=["GET", "POST"])
@login_required
def new_route():
    if request.method == "POST":
        points = json.loads(request.form["points"] or "[]")
        if not request.form["name"].strip() or len(points) < 2:
            flash("Zadaj názov a naklikaj na mape aspoň 2 body.")
            return render_template("route_new.html", active="trasy")

        route = Route(
            user_id=current_user().id,
            name=request.form["name"].strip(),
            description=request.form["description"].strip(),
            difficulty=request.form["difficulty"],
            length_km=float(request.form["length"]),
            points=request.form["points"],
        )
        db.session.add(route)
        db.session.commit()
        flash("Trasa bola uložená.")
        return redirect(url_for("route_detail", route_id=route.id))
    return render_template("route_new.html", active="trasy")


@app.route("/trasy/<int:route_id>")
def route_detail(route_id):
    route = db.get_or_404(Route, route_id)
    user = current_user()
    liked = user and RouteLike.query.filter_by(user_id=user.id, route_id=route.id).first()
    return render_template("route_detail.html", active="trasy", route=route, liked=liked)


@app.route("/trasy/<int:route_id>/paci-sa")
@login_required
def like_route(route_id):
    like = RouteLike.query.filter_by(user_id=current_user().id, route_id=route_id).first()
    if like:
        db.session.delete(like)   # druhé kliknutie páči sa mi zruší
    else:
        db.session.add(RouteLike(user_id=current_user().id, route_id=route_id))
    db.session.commit()
    return redirect(url_for("route_detail", route_id=route_id))


@app.route("/trasy/<int:route_id>/zmazat")
@login_required
def delete_route(route_id):
    route = Route.query.filter_by(id=route_id, user_id=current_user().id).first_or_404()
    db.session.delete(route)
    db.session.commit()
    flash("Trasa bola zmazaná.")
    return redirect(url_for("routes"))


# ---------- lokácie ----------

# kategórie lokácií a ich ikonky na mape
CATEGORIES = {
    "Vyhliadka": "🏔️", "Reštaurácia": "🍔", "Kaviareň": "☕", "Motopoint": "🏍️",
    "Servis": "🔧", "Čerpacia stanica": "⛽", "Parkovisko": "🅿️", "Iné": "📍",
}


@app.route("/lokacie")
def places():
    all_places = Place.query.order_by(Place.id.desc()).all()
    return render_template("places.html", active="lokacie", places=all_places, tips=recommended.PLACES,
                           categories=CATEGORIES)


@app.route("/lokacie/nova", methods=["GET", "POST"])
@login_required
def new_place():
    if request.method == "POST":
        try:
            lat, lng = float(request.form["lat"]), float(request.form["lng"])
        except ValueError:
            flash("Klikni na mapu a označ, kde sa miesto nachádza.")
            return render_template("place_new.html", active="lokacie", categories=CATEGORIES)

        place = Place(
            user_id=current_user().id,
            name=request.form["name"].strip(),
            category=request.form["category"] if request.form["category"] in CATEGORIES else "Iné",
            description=request.form["description"].strip(),
            lat=lat,
            lng=lng,
        )
        photo = request.files.get("photo")
        if photo and photo.filename:
            try:
                place.photo = save_image(photo, (900, 500))
            except OSError:
                flash("Fotka sa nepodarila nahrať – nie je to obrázok.")
        db.session.add(place)
        db.session.commit()
        flash("Lokácia bola pridaná.")
        return redirect(url_for("place_detail", place_id=place.id))
    return render_template("place_new.html", active="lokacie", categories=CATEGORIES)


@app.route("/lokacie/<int:place_id>")
def place_detail(place_id):
    place = db.get_or_404(Place, place_id)
    user = current_user()
    # moje hodnotenie (ak už existuje, formulár ho predvyplní)
    my_review = user and Review.query.filter_by(user_id=user.id, place_id=place.id).first()
    return render_template("place_detail.html", active="lokacie", place=place,
                           icon=CATEGORIES.get(place.category, "📍"), my_review=my_review)


@app.route("/lokacie/<int:place_id>/hodnotenie", methods=["POST"])
@login_required
def review_place(place_id):
    stars = request.form.get("stars", type=int) or 0   # pri nesprávnej hodnote 0
    if not 1 <= stars <= 5:
        return redirect(url_for("place_detail", place_id=place_id))

    # každý môže hodnotiť iba raz – druhé hodnotenie prepíše prvé
    review = Review.query.filter_by(user_id=current_user().id, place_id=place_id).first()
    if not review:
        review = Review(user_id=current_user().id, place_id=place_id)
        db.session.add(review)
    review.stars = stars
    review.text = request.form["text"].strip()
    db.session.commit()
    flash("Ďakujeme za hodnotenie!")
    return redirect(url_for("place_detail", place_id=place_id))


@app.route("/lokacie/<int:place_id>/zmazat")
@login_required
def delete_place(place_id):
    place = Place.query.filter_by(id=place_id, user_id=current_user().id).first_or_404()
    db.session.delete(place)
    db.session.commit()
    flash("Lokácia bola zmazaná.")
    return redirect(url_for("places"))


if __name__ == "__main__":
    app.run(debug=True)
