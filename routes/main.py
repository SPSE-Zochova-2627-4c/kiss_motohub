"""
routes/main.py – verejné stránky webu.
"""

from flask import Blueprint, render_template

bp = Blueprint("main", __name__)


@bp.route("/")
def home():
    """Homepage – neónová motorka, MotoAI chat a rozcestník sekcií."""
    return render_template("index.html", active="home")


@bp.route("/motorky")
def motorky():
    """Databáza motoriek – vyhľadávanie (dáta načíta JavaScript z /api/motorcycles)."""
    return render_template("motorky.html", active="motorky")
