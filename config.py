"""
config.py – všetky nastavenia aplikácie na jednom mieste.

Hodnoty sa najprv hľadajú v premenných prostredia (súbor .env),
a ak tam nie sú, použije sa predvolená hodnota zapísaná nižšie.
"""

import os
import secrets

from dotenv import load_dotenv

load_dotenv()  # načíta premenné zo súboru .env, ak existuje

# Priečinok projektu a priečinok "instance" pre dáta, ktoré sa nemajú
# zdieľať (databáza, tajný kľúč). Vytvorí sa automaticky.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")
os.makedirs(INSTANCE_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# API KĽÚČE
# ---------------------------------------------------------------------------
#
# Kľúče NIKDY nepíšeme priamo do kódu – kód je verejne na GitHube a ktokoľvek
# by si ich mohol skopírovať a minúť naše limity. Sú iba v súbore .env,
# ktorý je v .gitignore, takže sa na GitHub nikdy nenahrá.
# Návod: skopíruj .env.example ako .env a doplň do neho svoje kľúče.

# API Ninjas – databáza motoriek: https://api-ninjas.com/api/motorcycles
NINJA_API_KEY = os.getenv("NINJA_API_KEY", "")

# OpenRouter – AI asistent: https://openrouter.ai/keys
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

# ---------------------------------------------------------------------------
# AI ASISTENT
# ---------------------------------------------------------------------------

# Modely sa skúšajú v tomto poradí. Ak je prvý preťažený (free modely majú
# limity), aplikácia automaticky skúsi ďalší. "openrouter/free" je router,
# ktorý sám vyberie hocijaký dostupný bezplatný model.
AI_MODELS = [
    m.strip()
    for m in os.getenv(
        "AI_MODELS",
        "qwen/qwen3.8-27b:free,"  # najlepšia slovenčina (podporuje 200+ jazykov)
        "nvidia/nemotron-3-ultra-550b-a55b:free,"
        "nvidia/nemotron-3-super-120b-a12b:free,"
        "openrouter/free",
    ).split(",")
    if m.strip()
]

# True = AI najprv "premýšľa" a v chate sa to zobrazí (pomalšie, presnejšie).
AI_THINKING = os.getenv("AI_THINKING", "1") == "1"

# ---------------------------------------------------------------------------
# DATABÁZA
# ---------------------------------------------------------------------------

# SQLite = celá databáza je jeden súbor (instance/motohub.db), netreba
# inštalovať žiadny databázový server.
DATABASE_URL = os.getenv(
    "DATABASE_URL", "sqlite:///" + os.path.join(INSTANCE_DIR, "motohub.db")
)

# ---------------------------------------------------------------------------
# BEZPEČNOSŤ
# ---------------------------------------------------------------------------


def _load_or_create_secret_key():
    """Tajný kľúč, ktorým Flask digitálne PODPISUJE session cookie.

    Vďaka podpisu si používateľ nemôže cookie ručne upraviť (napr. prepísať
    svoje user_id na cudzie) – server by podpis odmietol. Kľúč musí byť
    náhodný a tajný, preto ho pri prvom spustení vygenerujeme cez modul
    `secrets` (kryptograficky bezpečný generátor) a uložíme do súboru.
    """
    from_env = os.getenv("SECRET_KEY")
    if from_env:
        return from_env
    path = os.path.join(INSTANCE_DIR, "secret_key")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    key = secrets.token_hex(32)  # 32 bajtov = 256 bitov náhodnosti
    with open(path, "w", encoding="utf-8") as f:
        f.write(key)
    return key


SECRET_KEY = _load_or_create_secret_key()

# ---------------------------------------------------------------------------
# NAHRÁVANIE SÚBOROV (profilovky)
# ---------------------------------------------------------------------------

# Profilovky sa ukladajú do instance/uploads/avatars (mimo priečinka static,
# aby sa k nim nedalo dostať inak než cez našu kontrolovanú adresu /avatar/...)
AVATAR_DIR = os.path.join(INSTANCE_DIR, "uploads", "avatars")
BANNER_DIR = os.path.join(INSTANCE_DIR, "uploads", "banners")
MAX_UPLOAD_MB = 5  # väčšie súbory server odmietne ešte pred spracovaním

# Ako dlho platí prihlásenie so zaškrtnutým "Zapamätať si ma" (v dňoch)
REMEMBER_ME_DAYS = 30

# Ochrana pred hádaním hesla: po MAX_LOGIN_ATTEMPTS neúspešných pokusoch
# z jednej IP adresy sa prihlasovanie na LOGIN_LOCKOUT_MINUTES zablokuje.
MAX_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 5

# Flask režim ladenia (pri odovzdaní / nasadení vypnúť: FLASK_DEBUG=0)
DEBUG = os.getenv("FLASK_DEBUG", "1") == "1"
