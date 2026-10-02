"""
security.py – všetko, čo súvisí s bezpečnosťou prihlasovania.

Obsah:
  1. Hashovanie hesiel ............ hash_password(), verify_password()
  2. Prihlásený používateľ ........ login_user(), logout_user(), get_current_user()
  3. Ochrana stránok ............... @login_required
  4. CSRF ochrana formulárov ....... csrf_token(), validate_csrf()
  5. Obmedzenie pokusov o prihlásenie (ochrana pred hádaním hesla)
  6. Kontrola vstupov z formulára  validate_username(), validate_email(), ...
  7. Bezpečné presmerovanie ........ safe_next_url()
"""

import hmac
import re
import secrets
import time
from functools import wraps

from flask import g, jsonify, redirect, request, session, url_for, flash
from werkzeug.security import check_password_hash, generate_password_hash

import config


# =============================================================================
# 1. HASHOVANIE HESIEL
# =============================================================================
#
# Heslo NEŠIFRUJEME (šifra sa dá kľúčom vrátiť späť), ale HASHUJEME.
# Hash je jednosmerná funkcia: z hesla vieme vypočítať hash, ale z hashu
# sa heslo späť vypočítať nedá. Pri prihlásení len znova zahashujeme
# zadané heslo a porovnáme výsledky.
#
# Používame algoritmus SCRYPT:
#   - SOĽ (salt): ku každému heslu sa pridá náhodný reťazec. Dva používatelia
#     s rovnakým heslom "Heslo123" majú preto v databáze úplne iný hash
#     a útočník nemôže použiť vopred vypočítané tabuľky (rainbow tables).
#   - SCRYPT je zámerne POMALÝ a náročný na pamäť. Jedno overenie trvá
#     zlomok sekundy (používateľ to necíti), ale skúšanie miliónov hesiel
#     útočníkom by trvalo roky.
#
# Výsledok v databáze vyzerá napr. takto:
#   scrypt:32768:8:1$Xr8Qe1Lk3sZ0aP9t$5f1c...e7a2
#   └─algoritmus a parametre┘└─ soľ ──┘└─── hash ───┘


def hash_password(password):
    """Vráti bezpečný hash hesla (scrypt + náhodná soľ 16 znakov)."""
    return generate_password_hash(password, method="scrypt", salt_length=16)


def verify_password(stored_hash, password):
    """Porovná heslo s uloženým hashom.

    check_password_hash porovnáva v KONŠTANTNOM čase – odpoveď trvá rovnako
    dlho bez ohľadu na to, koľko znakov sedí, takže útočník nemôže z času
    odpovede hádať heslo (tzv. timing attack).
    """
    return check_password_hash(stored_hash, password)


# Hash neexistujúceho hesla – používa sa pri prihlasovaní neexistujúceho
# používateľa, aby odpoveď trvala rovnako dlho ako pri existujúcom.
# Inak by útočník podľa rýchlosti odpovede zistil, ktoré mená existujú.
_DUMMY_HASH = hash_password(secrets.token_hex(16))


def fake_password_check():
    verify_password(_DUMMY_HASH, "nesprávne-heslo")


# =============================================================================
# 2. PRIHLÁSENÝ POUŽÍVATEĽ (session)
# =============================================================================
#
# Po prihlásení si do SESSION uložíme iba ID používateľa. Flask session je
# cookie v prehliadači, ktorá je digitálne PODPÍSANÁ tajným kľúčom
# (config.SECRET_KEY). Používateľ ju vidí, ale nemôže ju zmeniť – zmenený
# obsah by nesedel s podpisom a server by ho zahodil.


def login_user(user, remember=False):
    """Prihlási používateľa."""
    # session.clear() = ochrana pred "session fixation": útočník nemôže
    # obeti vopred podstrčiť vlastnú session a potom ju po prihlásení zneužiť.
    session.clear()
    session["user_id"] = user.id
    # "Zapamätať si ma" -> cookie platí REMEMBER_ME_DAYS dní,
    # inak zanikne po zatvorení prehliadača.
    session.permanent = bool(remember)
    csrf_token()  # nový CSRF token pre novú session


def logout_user():
    """Odhlási používateľa – zmaže celú session."""
    session.clear()


def get_current_user():
    """Vráti prihláseného používateľa alebo None.

    Výsledok si uložíme do `g` (úložisko platné počas jednej požiadavky),
    aby sme sa databázy nepýtali viackrát pri jednom načítaní stránky.
    """
    if "current_user" not in g:
        from extensions import db  # import tu, aby nevznikol kruhový import
        from models import User

        user_id = session.get("user_id")
        user = db.session.get(User, user_id) if user_id else None
        if user_id and user is None:
            session.clear()  # účet medzičasom zmazaný -> odhlásiť
        g.current_user = user
    return g.current_user


# =============================================================================
# 3. OCHRANA STRÁNOK – dekorátor @login_required
# =============================================================================


def login_required(view):
    """Dekorátor: stránku / API môže použiť iba prihlásený používateľ.

    Použitie:
        @bp.route("/tajne")
        @login_required
        def tajna_stranka(): ...

    - bežná stránka -> presmeruje na prihlásenie a potom späť (?next=...)
    - API (/api/...) -> vráti JSON chybu 401, s ktorou si poradí JavaScript
    """

    @wraps(view)
    def wrapped(*args, **kwargs):
        if get_current_user() is None:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Pre túto funkciu sa musíš prihlásiť.", "login_required": True}), 401
            flash("Pre pokračovanie sa prosím prihlás.", "info")
            return redirect(url_for("auth.login", next=request.full_path))
        return view(*args, **kwargs)

    return wrapped


# =============================================================================
# 4. CSRF OCHRANA
# =============================================================================
#
# CSRF (Cross-Site Request Forgery) = cudzia stránka by mohla v tvojom
# prehliadači potajomky odoslať formulár na MotoHub (napr. odhlásenie alebo
# neskôr zmazanie účtu) a prehliadač by k nemu automaticky pribalil tvoju
# prihlasovaciu cookie.
#
# Ochrana: každý formulár obsahuje skrytý náhodný TOKEN, ktorý pozná iba náš
# server a naša stránka. Cudzia stránka ho nevie prečítať, takže jej
# podvrhnutý formulár server odmietne.


def csrf_token():
    """Vráti CSRF token aktuálnej session (ak neexistuje, vytvorí ho)."""
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)
    return session["csrf_token"]


def validate_csrf():
    """Skontroluje token z formulára (pole csrf_token) alebo z hlavičky
    X-CSRF-Token (tú posiela JavaScript pri fetch požiadavkách)."""
    sent = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token") or ""
    expected = session.get("csrf_token") or ""
    # compare_digest = porovnanie v konštantnom čase (ochrana pred timing attack)
    return bool(expected) and hmac.compare_digest(sent, expected)


# =============================================================================
# 5. OBMEDZENIE POKUSOV O PRIHLÁSENIE (brute-force ochrana)
# =============================================================================


class LoginRateLimiter:
    """Pamätá si neúspešné pokusy o prihlásenie pre každú IP adresu.

    Po `max_attempts` zlých pokusoch v priebehu `window` sekúnd je IP
    zablokovaná, kým najstarší pokus nevyprší. Útočník tak nemôže skúšať
    tisíce hesiel za minútu.

    Pozn.: údaje sú iba v pamäti – po reštarte servera sa vynulujú. Pre
    školský projekt to stačí; pri reálnom nasadení by sa použil napr. Redis.
    """

    def __init__(self, max_attempts, window_seconds):
        self.max_attempts = max_attempts
        self.window = window_seconds
        self._failures = {}  # ip -> [časy neúspešných pokusov]

    def _recent(self, key):
        now = time.time()
        attempts = [t for t in self._failures.get(key, []) if now - t < self.window]
        self._failures[key] = attempts
        return attempts

    def seconds_until_unlock(self, key):
        """0 = môže sa prihlasovať, inak počet sekúnd do odblokovania."""
        attempts = self._recent(key)
        if len(attempts) < self.max_attempts:
            return 0
        return int(self.window - (time.time() - attempts[0])) + 1

    def register_failure(self, key):
        self._recent(key).append(time.time())

    def reset(self, key):
        self._failures.pop(key, None)


login_limiter = LoginRateLimiter(
    max_attempts=config.MAX_LOGIN_ATTEMPTS,
    window_seconds=config.LOGIN_LOCKOUT_MINUTES * 60,
)


# =============================================================================
# 6. KONTROLA VSTUPOV (validácia)
# =============================================================================
#
# Validujeme na SERVERI, aj keď to robí aj JavaScript v prehliadači.
# Kontrolu v prehliadači sa dá obísť (stačí poslať požiadavku ručne),
# takže tá je len pre pohodlie používateľa – rozhoduje vždy server.
#
# Každá funkcia vráti text chyby, alebo None, ak je všetko v poriadku.

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.]{3,20}$")
# Jednoduchá kontrola tvaru e-mailu: niečo@domena.koncovka
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


# Mená, ktoré by kolidovali s adresami webu (napr. /profil/upravit)
RESERVED_USERNAMES = {"upravit", "fotka", "email", "heslo", "zmazat", "motorka", "admin", "motohub", "motoai"}


def validate_username(username):
    if not username:
        return "Zadaj používateľské meno."
    if not USERNAME_RE.match(username):
        return "Meno musí mať 3 až 20 znakov a obsahovať iba písmená bez diakritiky, čísla, bodku alebo podčiarkovník."
    if username.lower() in RESERVED_USERNAMES:
        return "Toto meno je rezervované, vyber si iné."
    return None


def validate_email(email):
    if not email:
        return "Zadaj e-mail."
    if len(email) > 254 or not EMAIL_RE.match(email):
        return "Zadaj platný e-mail, napr. jazdec@gmail.com."
    return None


def validate_password(password, username=""):
    if not password:
        return "Zadaj heslo."
    if len(password) < 8:
        return "Heslo musí mať aspoň 8 znakov."
    if len(password) > 128:
        return "Heslo môže mať najviac 128 znakov."
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return "Heslo musí obsahovať aspoň jedno písmeno a jedno číslo."
    if username and username.lower() in password.lower():
        return "Heslo nesmie obsahovať tvoje používateľské meno."
    return None


# =============================================================================
# 7. BEZPEČNÉ PRESMEROVANIE PO PRIHLÁSENÍ
# =============================================================================


def safe_next_url(target):
    """Po prihlásení vrátime používateľa tam, odkiaľ prišiel (?next=/...).

    Povolíme LEN adresy v rámci nášho webu (začínajú jednou lomkou).
    Inak by útočník mohol poslať odkaz .../prihlasenie?next=https://zly-web.sk
    a po prihlásení by obeť skončila na podvodnej stránke (tzv. open redirect).
    """
    if target and target.startswith("/") and not target.startswith("//") and "\\" not in target:
        return target
    return url_for("main.home")
