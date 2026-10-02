"""
app.py – vstupný bod aplikácie MotoHub.

Tento súbor iba POSKLADÁ aplikáciu dokopy – samotná logika je v ďalších súboroch:

  config.py            nastavenia a API kľúče
  extensions.py        databázový objekt (SQLAlchemy)
  models.py            databázové tabuľky (User)
  security.py          hashovanie hesiel, CSRF, @login_required, limit pokusov
  routes/main.py       homepage a databáza motoriek
  routes/auth.py       registrácia, prihlásenie, odhlásenie
  routes/profile.py    profil, úprava profilu, profilovka, zmena hesla
  routes/friends.py    priatelia – vyhľadávanie a žiadosti
  uploads.py           bezpečné spracovanie nahratých fotiek
  routes/motorcycles.py  API pre databázu motoriek (API Ninjas)
  routes/ai.py         API pre AI asistenta (OpenRouter)
  routes/compare.py    porovnanie motoriek + AI odhad cien a verdikt
  ai_client.py         komunikácia s AI (striedanie modelov, streamovanie)

Spustenie:  python app.py   (alebo dvojklik na run.bat)
"""

from datetime import timedelta

from flask import Flask, flash, jsonify, redirect, request

import config
from extensions import db, upgrade_schema
from security import csrf_token, get_current_user, validate_csrf


def create_app():
    """Vytvorí a nakonfiguruje Flask aplikáciu (tzv. application factory)."""
    app = Flask(__name__, instance_path=config.INSTANCE_DIR)

    # --- základné nastavenia ------------------------------------------------
    app.config.update(
        SECRET_KEY=config.SECRET_KEY,  # podpisuje session cookie
        MAX_CONTENT_LENGTH=config.MAX_UPLOAD_MB * 1024 * 1024,  # max. veľkosť nahrávaného súboru
        SQLALCHEMY_DATABASE_URI=config.DATABASE_URL,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        # Bezpečnosť prihlasovacej cookie:
        SESSION_COOKIE_HTTPONLY=True,  # JavaScript ju nevie prečítať (ochrana pri XSS)
        SESSION_COOKIE_SAMESITE="Lax",  # prehliadač ju nepošle pri POST z cudzieho webu
        # SESSION_COOKIE_SECURE=True,  # zapnúť pri nasadení na HTTPS
        PERMANENT_SESSION_LIFETIME=timedelta(days=config.REMEMBER_ME_DAYS),
    )

    # --- databáza -----------------------------------------------------------
    db.init_app(app)
    with app.app_context():
        import models  # noqa: F401  (načíta modely, aby o nich SQLAlchemy vedel)

        upgrade_schema()  # doplní nové stĺpce do starej databázy (extensions.py)
        db.create_all()  # vytvorí tabuľky, ak ešte neexistujú

    # --- časti webu (blueprinty) --------------------------------------------
    from routes import ai, auth, compare, friends, main, motorcycles, profile

    app.register_blueprint(main.bp)
    app.register_blueprint(auth.bp)
    app.register_blueprint(profile.bp)
    app.register_blueprint(friends.bp)
    app.register_blueprint(motorcycles.bp)
    app.register_blueprint(compare.bp)
    app.register_blueprint(ai.bp)

    # --- globálna CSRF kontrola ---------------------------------------------
    @app.before_request
    def check_csrf():
        """Každý POST (formulár aj JavaScript) musí mať platný CSRF token."""
        if request.method == "POST" and not validate_csrf():
            if request.path.startswith("/api/"):
                return jsonify({"error": "Platnosť stránky vypršala. Obnov ju (F5) a skús znova."}), 400
            flash("Platnosť formulára vypršala. Skús to prosím znova.", "error")
            return redirect(request.path)

    # --- premenné dostupné vo všetkých šablónach ----------------------------
    @app.context_processor
    def inject_globals():
        # V HTML potom stačí napr. {{ current_user.username }} alebo {{ csrf_token() }}
        from models import Friendship

        user = get_current_user()
        # počet nevybavených žiadostí o priateľstvo – červené číslo v navigácii
        pending = len(Friendship.incoming_requests(user.id)) if user else 0
        return {"current_user": user, "csrf_token": csrf_token, "pending_requests": pending}

    # --- bezpečnostné HTTP hlavičky -----------------------------------------
    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"  # prehliadač nehádá typ súboru
        response.headers["X-Frame-Options"] = "DENY"  # web sa nedá vložiť do iframe (clickjacking)
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    @app.errorhandler(413)
    def too_large(_):
        flash(f"Súbor je príliš veľký (max. {config.MAX_UPLOAD_MB} MB).", "error")
        return redirect(request.referrer or "/")

    @app.errorhandler(404)
    def not_found(_):
        if request.path.startswith("/api/"):
            return jsonify({"error": "Táto adresa neexistuje."}), 404
        return redirect("/")

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=config.DEBUG, port=5000)
