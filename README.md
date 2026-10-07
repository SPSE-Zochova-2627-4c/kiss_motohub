<div align="center">

# 🏍️ MotoHub

**Webová aplikácia pre motocyklistov – databáza motoriek, porovnávanie, AI asistent a komunita jazdcov na jednom mieste.**

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?logo=flask&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-SQLAlchemy-003B57?logo=sqlite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=black)
![Stav](https://img.shields.io/badge/stav-vo%20v%C3%BDvoji-9b4dff)

</div>

## Obsah

- [O projekte](#o-projekte)
- [Funkcie](#funkcie)
- [Ukážky](#ukážky)
- [Použité technológie](#použité-technológie)
- [Inštalácia a spustenie](#inštalácia-a-spustenie)
- [Štruktúra projektu](#štruktúra-projektu)
- [Databáza](#databáza)
- [Bezpečnosť](#bezpečnosť)
- [Plán vývoja](#plán-vývoja)
- [Autor a poďakovanie](#autor-a-poďakovanie)
- [Licencia](#licencia)

## O projekte

**MotoHub** je maturitný projekt – webová aplikácia zameraná na motocykle a komunitu
motocyklistov. Pomáha pri výbere motorky: technické parametre sa načítavajú z externého
API, motorky sa dajú vyhľadávať a vzájomne porovnávať a vstavaný **AI asistent MotoAI**
odpovedá na otázky a odporúča vhodné modely podľa skúseností a vodičského oprávnenia jazdca.

Súčasťou aplikácie sú používateľské účty s profilmi, priatelia a postupne pribudne aj
zdieľanie trás, zaujímavých lokalít a organizovanie spoločných stretnutí (meetupov).

## Funkcie

| | Funkcia | Popis |
|---|---|---|
| 🔍 | **Databáza motoriek** | Vyhľadávanie podľa značky, modelu a roku, detail so všetkými parametrami po slovensky |
| ⚖️ | **Porovnanie** | 2 – 4 motorky naraz: grafy, víťaz kategórie, tabuľka rozdielov, vhodnosť pre skupinu A1 / A2 / A |
| 💶 | **Ceny a dostupnosť** | Orientačný odhad ceny novej aj ojazdenej motorky (AI) + odkazy na inzeráty |
| 🤖 | **MotoAI** | Chat s AI, odpoveď sa píše postupne, dá sa zastaviť, automatické striedanie bezplatných modelov |
| 👤 | **Účty a profily** | Registrácia, prihlásenie, profilovka a banner s výberom výrezu, preferencie jazdca, súkromný profil |
| ❤️ | **Uložené motorky** | „Páči sa mi" a „uložiť" pri každej motorke, zoznamy na profile |
| 👥 | **Priatelia** | Vyhľadávanie jazdcov, žiadosti o priateľstvo, upozornenie na nové žiadosti |
| ✨ | **Dizajn** | Tmavý neónový vzhľad, interaktívna motorka na úvodnej stránke (skús na ňu kliknúť 😉) |


<details>
<summary><b>Porovnanie motoriek</b> (klikni pre zobrazenie)</summary>


</details>

## Použité technológie

| Oblasť | Technológia |
|---|---|
| Backend | [Python](https://www.python.org/) 3.10+, [Flask](https://flask.palletsprojects.com/) |
| Databáza | [SQLite](https://www.sqlite.org/) cez ORM [Flask-SQLAlchemy](https://flask-sqlalchemy.palletsprojects.com/) |
| Frontend | HTML (šablóny Jinja2), CSS, čistý JavaScript (bez frameworku) |
| Obrázky | [Pillow](https://python-pillow.org/) – kontrola, orez a prevod nahraných fotiek |
| Dáta o motorkách | [API Ninjas – Motorcycles API](https://api-ninjas.com/api/motorcycles) |
| Umelá inteligencia | [OpenRouter](https://openrouter.ai/) – bezplatné jazykové modely (Qwen, Nemotron) |
| Bezpečnosť | hash hesiel scrypt (Werkzeug), CSRF tokeny, podpísané session cookies |

## Inštalácia a spustenie

### Požiadavky

- [Python 3.10 alebo novší](https://www.python.org/downloads/) (pri inštalácii zaškrtni **Add python.exe to PATH**)
- vlastné API kľúče (zadarmo):
  - [API Ninjas](https://api-ninjas.com/register) – databáza motoriek
  - [OpenRouter](https://openrouter.ai/keys) – AI asistent

### Windows – najrýchlejšie

1. Stiahni repozitár (`Code` → `Download ZIP`) alebo ho naklonuj:
   ```bash
   git clone https://github.com/SPSE-Zochova-2627-4c/priezvisko_motohub.git
   cd priezvisko_motohub
   ```
2. Dvojklik na **`run.bat`**. Skript:
   - vytvorí virtuálne prostredie a nainštaluje knižnice,
   - pri prvom spustení vytvorí súbor `.env` a otvorí ho v Notepade – **doplň do neho API kľúče** a ulož,
   - spustí aplikáciu.
3. Otvor v prehliadači **http://127.0.0.1:5000**

### Ručne (Windows / Linux / macOS)

```bash
python -m venv venv
venv\Scripts\activate          # Linux / macOS: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env         # Linux / macOS: cp .env.example .env
# -> doplň API kľúče do súboru .env
python app.py
```

### Konfigurácia (`.env`)

| Premenná | Význam |
|---|---|
| `NINJA_API_KEY` | kľúč k API Ninjas |
| `OPENROUTER_API_KEY` | kľúč k OpenRouter |
| `AI_MODELS` | zoznam AI modelov oddelený čiarkou – skúšajú sa postupne, kým niektorý neodpovie |
| `AI_THINKING` | `1` = AI pred odpoveďou premýšľa (presnejšie), `0` = rýchlejšie odpovede |
| `FLASK_DEBUG` | `1` = ladiaci režim, **na verejnom serveri vždy `0`** |

> [!IMPORTANT]
> Súbor `.env` obsahuje tajné kľúče, preto je v `.gitignore` a **na GitHub sa nikdy nenahráva**.
> V repozitári je iba prázdna šablóna `.env.example`.

Pri prvom spustení sa automaticky vytvorí priečinok `instance/` s databázou, náhodným
tajným kľúčom a nahratými fotkami. Ani ten sa na GitHub nenahráva.

## Štruktúra projektu

```
motohub/
├─ app.py               vstupný bod – poskladá aplikáciu (blueprinty, CSRF, hlavičky)
├─ config.py            nastavenia (kľúče načítava z .env)
├─ extensions.py        databáza + automatické doplnenie nových stĺpcov
├─ models.py            databázové tabuľky: User, BikeMark, Friendship
├─ security.py          hash hesiel, prihlásenie, @login_required, CSRF, limit pokusov
├─ uploads.py           bezpečné spracovanie obrázkov (profilovka, banner, výrez)
├─ ai_client.py         komunikácia s AI – striedanie modelov, streamovanie
├─ routes/              jednotlivé časti webu (Flask blueprinty)
│   ├─ main.py          úvodná stránka, databáza motoriek
│   ├─ auth.py          registrácia, prihlásenie, odhlásenie
│   ├─ profile.py       profil, úprava profilu, fotky, zmena hesla, zmazanie účtu
│   ├─ friends.py       priatelia
│   ├─ motorcycles.py   API: vyhľadávanie motoriek, páči sa mi / uložiť
│   ├─ compare.py       porovnanie + AI odhad cien a verdikt
│   └─ ai.py            API: MotoAI chat
├─ templates/           HTML šablóny (Jinja2)
├─ static/
│   ├─ css/style.css
│   └─ js/              chat, porovnanie, výrez fotiek, interaktívna motorka…
├─ docs/screenshots/    obrázky pre tento README
├─ requirements.txt     zoznam Python knižníc
├─ run.bat              inštalácia + spustenie na Windows
└─ .env.example         šablóna konfigurácie (bez kľúčov)
```

## Databáza

| Tabuľka | Obsah |
|---|---|
| `users` | účet (meno, e-mail, hash hesla) a profil (zobrazované meno, bio, mesto, profilovka, banner, vodičák, štýl jazdy, motorka, súkromie) |
| `bike_marks` | motorky, ktoré si používateľ uložil (`save`) alebo dal „páči sa mi" (`like`) |
| `friendships` | žiadosti o priateľstvo – kto koho pozval a stav `pending` / `accepted` |

## Bezpečnosť

| Ochrana | Proti čomu | Kde v kóde |
|---|---|---|
| Hash **scrypt** s náhodnou soľou | únik databázy, rainbow tables | `security.hash_password` |
| CSRF token vo formulároch aj vo fetch požiadavkách | podvrhnuté formuláre z cudzích webov | `security.csrf_token`, `app.check_csrf` |
| Limit 5 pokusov o prihlásenie / 5 min | hádanie hesla (brute force) | `security.LoginRateLimiter` |
| Rovnaká hláška a čas odpovede pri zlom mene aj hesle | zisťovanie existujúcich účtov | `routes/auth.py` |
| Nová session po prihlásení | session fixation | `security.login_user` |
| Kontrola adresy `?next=` | presmerovanie na podvodný web | `security.safe_next_url` |
| ORM namiesto ručného SQL | SQL injection | `models.py` |
| Escapovanie výstupu (Jinja, `escapeHtml`) | XSS | šablóny, `static/js` |
| Kontrola a prekódovanie obrázkov, náhodné názvy, limit 5 MB | škodlivé súbory, GPS v EXIF | `uploads.py` |
| API kľúče iba na serveri a v `.env` | zneužitie kľúčov | `config.py`, `.gitignore` |

## Plán vývoja

- [x] Úvodná stránka s interaktívnou motorkou
- [x] Databáza motoriek (API Ninjas)
- [x] AI asistent MotoAI
- [x] Registrácia a prihlasovanie
- [x] Profily, profilovka a banner
- [x] Priatelia
- [x] Porovnanie motoriek
- [ ] Trasy – zdieľanie a mapa
- [ ] Lokácie – zaujímavé miesta pre motorkárov
- [ ] Meetupy – spoločné stretnutia
- [ ] Komunita – príspevky a diskusie
- [ ] Nasadenie na internet
- [ ] Technická dokumentácia

## Autor a poďakovanie

**Ivan Kiss** – SPŠE Zochova, trieda 4.C, 2026/2027

Ďakujem za dáta a služby:
[API Ninjas](https://api-ninjas.com/) (parametre motoriek),
[OpenRouter](https://openrouter.ai/) (prístup k AI modelom),
[Flask](https://flask.palletsprojects.com/),
[Pillow](https://python-pillow.org/) a ostatným autorom open-source knižníc.

## Licencia

Školský projekt – licencia zatiaľ nebola zvolená.
