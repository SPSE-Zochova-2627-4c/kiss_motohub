# Databázové tabuľky (SQLAlchemy)
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(30), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)  # uložený ako hash

    # profil
    display_name = db.Column(db.String(50))
    bio = db.Column(db.String(300))
    location = db.Column(db.String(60))
    license = db.Column(db.String(10))       # AM, A1, A2, A
    riding_style = db.Column(db.String(30))
    current_bike = db.Column(db.String(60))
    avatar = db.Column(db.String(100))       # názov súboru v static/uploads
    banner = db.Column(db.String(100))

    def name(self):
        return self.display_name or self.username


class SavedBike(db.Model):
    """Motorka, ktorú si používateľ uložil (kind='save') alebo dal páči sa mi (kind='like')."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    kind = db.Column(db.String(10))
    make = db.Column(db.String(60))
    model = db.Column(db.String(80))
    year = db.Column(db.String(10))


class Friendship(db.Model):
    """Žiadosť o priateľstvo. accepted=False -> čaká, True -> sú priatelia."""
    id = db.Column(db.Integer, primary_key=True)
    from_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    to_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    accepted = db.Column(db.Boolean, default=False)


class Route(db.Model):
    """Motorkárska trasa nakreslená na mape."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    name = db.Column(db.String(80), nullable=False)
    description = db.Column(db.String(500))
    difficulty = db.Column(db.String(20))   # Ľahká, Stredná, Náročná
    length_km = db.Column(db.Float)
    points = db.Column(db.Text)             # body trasy ako JSON: [[lat, lng], [lat, lng], ...]

    author = db.relationship("User")
    likes = db.relationship("RouteLike", cascade="all, delete-orphan")


class RouteLike(db.Model):
    """Kto dal trase páči sa mi."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    route_id = db.Column(db.Integer, db.ForeignKey("route.id"))


class Place(db.Model):
    """Lokácia – zaujímavé miesto pre motorkárov (bod na mape)."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    name = db.Column(db.String(80), nullable=False)
    category = db.Column(db.String(30))     # Vyhliadka, Reštaurácia, Servis...
    description = db.Column(db.String(500))
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    photo = db.Column(db.String(100))       # názov súboru v static/uploads

    author = db.relationship("User")
    reviews = db.relationship("Review", cascade="all, delete-orphan", order_by="Review.id.desc()")

    def rating(self):
        """Priemerné hodnotenie (napr. 4.5) alebo None, ak ešte nikto nehodnotil."""
        if not self.reviews:
            return None
        return round(sum(r.stars for r in self.reviews) / len(self.reviews), 1)


class Review(db.Model):
    """Hodnotenie lokácie – hviezdičky 1 až 5 a komentár."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"))
    place_id = db.Column(db.Integer, db.ForeignKey("place.id"))
    stars = db.Column(db.Integer)
    text = db.Column(db.String(300))

    author = db.relationship("User")
