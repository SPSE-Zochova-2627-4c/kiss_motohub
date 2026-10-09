# 🏍️ MotoHub

Webová aplikácia pre motocyklistov: databáza motoriek, porovnávanie, AI asistent, trasy, zaujímavé miesta a komunita jazdcov na jednom mieste.

Maturitný projekt – **Ivan Kiss**, SPŠE Zochova, 4.C, 2026/2027

## Funkcie

- **Databáza motoriek** – vyhľadávanie podľa značky, modelu a roku (externé API)
- **Porovnanie** – 2 až 4 motorky, grafy, tabuľka, vodičák A1 / A2 / A, odhad ceny a verdikt od AI
- **MotoAI** – chat s umelou inteligenciou (len pre prihlásených)
- **Účty a profily** – registrácia, prihlásenie, profilovka, banner, ikonky a farby
- **Priatelia** – vyhľadávanie jazdcov a žiadosti o priateľstvo
- **Trasy** – kreslenie trás na mape, dĺžka trasy, „páči sa mi“, odporúčané trasy
- **Lokácie** – miesta na mape (vyhliadky, bistrá, servisy…), fotka, hodnotenie hviezdičkami, filtre, vzdialenosť od teba, odporúčané miesta

## Technológie

Python, Flask, SQLite (Flask-SQLAlchemy), HTML, CSS, JavaScript, Leaflet + OpenStreetMap (mapy), Pillow (fotky)

API: [API Ninjas](https://api-ninjas.com/api/motorcycles) (motorky), [OpenRouter](https://openrouter.ai/) (AI)

## Ako to spustiť

1. Nainštaluj [Python](https://www.python.org/downloads/) – pri inštalácii zaškrtni **Add python.exe to PATH**.
2. Stiahni projekt: na GitHube klikni na **Code → Download ZIP** a rozbaľ ho
   (alebo `git clone https://github.com/SPSE-Zochova-2627-4c/kiss_motohub.git`).
3. Spusti **`run.bat`**. Pri prvom spustení nainštaluje knižnice a otvorí súbor `.env`.
4. Do `.env` doplň svoje API kľúče a ulož ho:
   - `NINJA_API_KEY` – zadarmo na [api-ninjas.com](https://api-ninjas.com/register)
   - `OPENROUTER_API_KEY` – zadarmo na [openrouter.ai/keys](https://openrouter.ai/keys)
5. Otvor v prehliadači **http://127.0.0.1:5000**

Nabudúce stačí len spustiť `run.bat`. Bez kľúčov stránka funguje tiež, ale nepôjde vyhľadávanie motoriek a AI.

> Súbor `.env` s kľúčmi sa na GitHub nenahráva (je v `.gitignore`).

## Štruktúra projektu

```
app.py           stránky – účty, profil, priatelia, trasy, lokácie
api.py           API pre JavaScript – motorky, uložené motorky, AI
ai.py            komunikácia s AI (OpenRouter)
models.py        databázové tabuľky
recommended.py   odporúčané trasy a miesta
config.py        nastavenia a API kľúče z .env
templates/       HTML stránky
static/          CSS, JavaScript, nahraté fotky
```

## Databáza

`User` (používatelia), `SavedBike` (uložené motorky), `Friendship` (priatelia), `Route` + `RouteLike` (trasy), `Place` + `Review` (lokácie a hodnotenia). Databáza sa vytvorí sama pri prvom spustení.

## Plán

- [x] Úvodná stránka a MotoAI
- [x] Databáza a porovnanie motoriek
- [x] Účty, profily a priatelia
- [x] Trasy
- [x] Lokácie
- [ ] Meetupy
- [ ] Nasadenie na internet
