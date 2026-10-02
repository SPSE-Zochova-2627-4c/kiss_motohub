"""
models.py – databázové tabuľky (modely).

Každá trieda = jedna tabuľka v databáze, každý atribút = jeden stĺpec.

  User        ... používateľ a jeho profil (tabuľka "users")
  BikeMark    ... motorky, ktoré si používateľ uložil alebo dal "páči sa mi"
  Friendship  ... priateľstvá a žiadosti o priateľstvo

Vzťahy medzi tabuľkami:
  User 1 ──── N BikeMark        (jeden používateľ má veľa označených motoriek)
  User N ──── N User            (cez Friendship: kto koho pozval a či prijal)
"""

from datetime import datetime, timezone

from extensions import db
from security import hash_password, verify_password


def _now():
    return datetime.now(timezone.utc)


# =============================================================================
# POUŽÍVATEĽ
# =============================================================================

# Povolené hodnoty pre výberové polia profilu: (hodnota v databáze, text pre človeka)
LICENSE_CHOICES = [
    ("", "Neuvedené"),
    ("AM", "AM – mopedy do 45 km/h"),
    ("A1", "A1 – do 125 cm³ / 11 kW"),
    ("A2", "A2 – do 35 kW"),
    ("A", "A – bez obmedzenia"),
    ("none", "Zatiaľ bez vodičáku"),
]
STYLE_CHOICES = [
    ("", "Neuvedené"),
    ("sport", "Šport / okruh"),
    ("naked", "Naked / streetfighter"),
    ("touring", "Cestovanie / touring"),
    ("adventure", "Adventure / enduro"),
    ("cruiser", "Cruiser / chopper"),
    ("classic", "Klasika / café racer"),
    ("offroad", "Offroad / motokros"),
    ("scooter", "Skúter / mesto"),
]


# Farebné témy banneru (keď používateľ nemá vlastný obrázok): (kľúč, názov)
BANNER_THEMES = [
    ("neon", "Neónová fialová"),
    ("sunset", "Západ slnka"),
    ("ocean", "Nočný oceán"),
    ("toxic", "Jedovatá zelená"),
    ("inferno", "Rozžeravený výfuk"),
    ("mono", "Grafit"),
]


class User(db.Model):
    """Registrovaný používateľ MotoHubu (tabuľka "users")."""

    __tablename__ = "users"

    # --- prihlasovacie údaje ---------------------------------------------
    id = db.Column(db.Integer, primary_key=True)  # jedinečné číslo používateľa
    # unique=True -> databáza sama nedovolí dve rovnaké mená / e-maily
    # index=True  -> rýchle vyhľadávanie (prihlásenie, hľadanie priateľov)
    username = db.Column(db.String(20), unique=True, nullable=False, index=True)
    email = db.Column(db.String(254), unique=True, nullable=False, index=True)
    # NIKDY neukladáme heslo samotné, iba jeho HASH (pozri security.py)
    password_hash = db.Column(db.String(255), nullable=False)

    created_at = db.Column(db.DateTime(timezone=True), default=_now, nullable=False)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)

    # --- profil (všetko nepovinné) ---------------------------------------
    display_name = db.Column(db.String(40), nullable=True)   # zobrazované meno, napr. "Jano Novák"
    bio = db.Column(db.String(300), nullable=True)           # krátko o sebe
    location = db.Column(db.String(60), nullable=True)       # mesto / kraj
    avatar_filename = db.Column(db.String(64), nullable=True)  # názov súboru profilovky
    banner_filename = db.Column(db.String(64), nullable=True)  # vlastný obrázok v hlavičke profilu
    banner_theme = db.Column(db.String(20), nullable=True)     # farebná téma hlavičky (bez obrázka)

    # --- preferencie jazdca ----------------------------------------------
    license_category = db.Column(db.String(8), nullable=True)  # AM / A1 / A2 / A / none
    riding_style = db.Column(db.String(20), nullable=True)     # sport / naked / touring ...
    riding_since = db.Column(db.Integer, nullable=True)        # rok, odkedy jazdí
    current_bike = db.Column(db.String(60), nullable=True)     # "Yamaha MT-07 (2021)"

    # --- súkromie ---------------------------------------------------------
    # True = profil vidí každý prihlásený používateľ, False = iba priatelia
    profile_public = db.Column(db.Boolean, nullable=False, default=True)

    # --- vzťahy -----------------------------------------------------------
    # cascade="all, delete-orphan": pri zmazaní účtu sa zmažú aj jeho motorky
    bike_marks = db.relationship("BikeMark", backref="user", lazy="dynamic", cascade="all, delete-orphan")

    # --- práca s heslom ---------------------------------------------------

    def set_password(self, password):
        """Uloží heslo ako hash (so soľou), nie ako čitateľný text."""
        self.password_hash = hash_password(password)

    def check_password(self, password):
        """Overí, či zadané heslo sedí s uloženým hashom."""
        return verify_password(self.password_hash, password)

    # --- pomocné vlastnosti pre šablóny -----------------------------------

    @property
    def name(self):
        """Meno na zobrazenie – zobrazované meno, alebo používateľské meno."""
        return self.display_name or self.username

    @property
    def initial(self):
        """Prvé písmeno mena – ukáže sa v kruhu, ak nemá profilovku."""
        return self.name[:1].upper()

    @property
    def banner_theme_key(self):
        """Platná téma banneru (neznáma hodnota -> predvolená neónová)."""
        return self.banner_theme if self.banner_theme in dict(BANNER_THEMES) else "neon"

    @property
    def license_label(self):
        """Text skupiny vodičáku, alebo "" ak nie je vyplnená."""
        return dict(LICENSE_CHOICES).get(self.license_category, "") if self.license_category else ""

    @property
    def style_label(self):
        """Text štýlu jazdy, alebo "" ak nie je vyplnený."""
        return dict(STYLE_CHOICES).get(self.riding_style, "") if self.riding_style else ""

    @property
    def years_riding(self):
        """Koľko rokov už jazdí (podľa roku riding_since)."""
        if not self.riding_since:
            return None
        return max(0, _now().year - self.riding_since)

    def __repr__(self):
        return f"<User {self.username}>"


# =============================================================================
# ULOŽENÉ A OBĽÚBENÉ MOTORKY
# =============================================================================


class BikeMark(db.Model):
    """Motorka, ktorú si používateľ uložil (kind="save") alebo dal "páči sa mi"
    (kind="like").

    Ukladáme iba ZNAČKU, MODEL a ROK – nie celé technické parametre.
    Podmienky bezplatného plánu API Ninjas nepovoľujú ich dáta ukladať
    (caching/storing), preto si ich pri otvorení detailu vždy načítame znova.
    """

    __tablename__ = "bike_marks"

    id = db.Column(db.Integer, primary_key=True)
    # ForeignKey = "cudzí kľúč": odkaz na riadok v tabuľke users
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = db.Column(db.String(8), nullable=False)  # "like" alebo "save"
    make = db.Column(db.String(60), nullable=False)
    model = db.Column(db.String(80), nullable=False)
    year = db.Column(db.String(10), nullable=False, default="")
    created_at = db.Column(db.DateTime(timezone=True), default=_now, nullable=False)

    # Tá istá motorka môže byť u jedného používateľa označená každým druhom iba raz
    __table_args__ = (db.UniqueConstraint("user_id", "kind", "make", "model", "year", name="uq_bike_mark"),)

    @property
    def title(self):
        return f"{self.make} {self.model}"

    def to_dict(self):
        return {"make": self.make, "model": self.model, "year": self.year, "kind": self.kind}


# =============================================================================
# PRIATELIA
# =============================================================================


class Friendship(db.Model):
    """Žiadosť o priateľstvo a jej stav.

    requester = kto poslal žiadosť, addressee = komu ju poslal.
    status:  "pending"  – čaká na odpoveď
             "accepted" – sú priatelia
    Pri odmietnutí alebo zrušení sa riadok jednoducho zmaže.
    """

    __tablename__ = "friendships"

    id = db.Column(db.Integer, primary_key=True)
    requester_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    addressee_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = db.Column(db.String(10), nullable=False, default="pending")
    created_at = db.Column(db.DateTime(timezone=True), default=_now, nullable=False)
    accepted_at = db.Column(db.DateTime(timezone=True), nullable=True)

    requester = db.relationship("User", foreign_keys=[requester_id])
    addressee = db.relationship("User", foreign_keys=[addressee_id])

    __table_args__ = (db.UniqueConstraint("requester_id", "addressee_id", name="uq_friend_pair"),)

    # --- pomocné dotazy (statické metódy = volajú sa na triede, nie objekte) ---

    @staticmethod
    def between(a_id, b_id):
        """Nájde vzťah medzi dvomi používateľmi (v ľubovoľnom smere)."""
        return Friendship.query.filter(
            db.or_(
                db.and_(Friendship.requester_id == a_id, Friendship.addressee_id == b_id),
                db.and_(Friendship.requester_id == b_id, Friendship.addressee_id == a_id),
            )
        ).first()

    @staticmethod
    def friends_of(user_id):
        """Zoznam priateľov (User objekty) daného používateľa."""
        rows = Friendship.query.filter(
            Friendship.status == "accepted",
            db.or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
        ).all()
        return [r.addressee if r.requester_id == user_id else r.requester for r in rows]

    @staticmethod
    def incoming_requests(user_id):
        """Žiadosti, ktoré čakajú na odpoveď tohto používateľa."""
        return Friendship.query.filter_by(addressee_id=user_id, status="pending").order_by(Friendship.created_at.desc()).all()

    @staticmethod
    def outgoing_requests(user_id):
        """Žiadosti, ktoré tento používateľ poslal a ešte neboli prijaté."""
        return Friendship.query.filter_by(requester_id=user_id, status="pending").order_by(Friendship.created_at.desc()).all()
