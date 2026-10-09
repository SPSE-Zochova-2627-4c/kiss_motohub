# Nastavenia aplikácie. API kľúče sa načítajú zo súboru .env
# (ten sa nenahráva na GitHub, je v .gitignore).
import os
from dotenv import load_dotenv

load_dotenv()

NINJA_API_KEY = os.getenv("NINJA_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

# Bezplatné AI modely – keď je jeden preťažený, skúsi sa ďalší
AI_MODELS = os.getenv("AI_MODELS", "qwen/qwen3.8-27b:free,openrouter/free").split(",")

SECRET_KEY = os.getenv("SECRET_KEY", "motohub-tajny-kluc")
DATABASE = "sqlite:///motohub.db"
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "static", "uploads")
