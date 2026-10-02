# MotoHub – technické poznámky

> Podrobnejšie vysvetlenia k obhajobe. Prehľad projektu je v [README](../README.md).


Webová aplikácia pre motocyklistov – databáza motoriek, AI asistent a (neskôr)
trasy, lokácie, meetupy a komunita. Postavená na **Python + Flask**, **SQLite**,
HTML, CSS a JavaScripte.

## Rýchly štart (Windows)

1. Rozbaľ ZIP.
2. Dvojklik na **`run.bat`** – vytvorí virtuálne prostredie (`venv`),
   nainštaluje knižnice z `requirements.txt` a spustí aplikáciu.
3. Otvor **http://127.0.0.1:5000**

Pri prvom spustení sa automaticky vytvorí priečinok `instance/` s databázou
(`motohub.db`) a náhodným tajným kľúčom (`secret_key`).

## API kľúče

Sú v súbore **`.env`** (alebo priamo v `config.py`):

```
NINJA_API_KEY=...        # https://api-ninjas.com  – databáza motoriek
OPENROUTER_API_KEY=...   # https://openrouter.ai   – AI asistent
AI_MODELS=...            # bezplatné modely, skúšajú sa zľava doprava
AI_THINKING=1            # 1 = v chate vidno "premýšľanie" AI, 0 = rýchlejšie
```

## Štruktúra projektu

```
motohub/
├─ app.py                 Vstupný bod – poskladá aplikáciu (blueprinty, CSRF, hlavičky)
├─ config.py              Nastavenia, API kľúče, tajný kľúč
├─ extensions.py          Databázový objekt (SQLAlchemy)
├─ models.py              Databázové tabuľky – User, BikeMark, Friendship
├─ security.py            Hash hesiel, session, @login_required, CSRF, limit pokusov, validácia
├─ uploads.py             Bezpečné spracovanie obrázkov (profilovka, banner, výrez)
├─ ai_client.py           Komunikácia s AI – striedanie modelov, streamovanie
├─ routes/
│   ├─ main.py            Homepage, databáza motoriek
│   ├─ auth.py            Registrácia, prihlásenie, odhlásenie
│   ├─ profile.py         Profil, úprava, profilovka, zmena hesla/e-mailu, zmazanie účtu
│   ├─ friends.py         Priatelia – vyhľadávanie a žiadosti
│   ├─ motorcycles.py     API: vyhľadávanie motoriek + páči sa mi / uložiť
│   ├─ compare.py         Porovnanie motoriek + AI odhad cien a verdikt
│   └─ ai.py              API: AI asistent (OpenRouter) – len pre prihlásených
├─ templates/
│   ├─ base.html          Spoločná kostra stránok (hlavička, pozadie, oznámenia)
│   ├─ partials/nav.html  Navigácia (mení sa podľa prihlásenia)
│   ├─ partials/macros.html  Profilovka, tlačidlo priateľstva (makrá)
│   ├─ profile/           view.html (profil), edit.html (úprava)
│   ├─ friends.html       Priatelia
│   ├─ compare.html       Porovnanie motoriek
│   ├─ index.html         Homepage
│   ├─ motorky.html       Databáza motoriek
│   └─ auth/              login.html, register.html
├─ static/
│   ├─ css/style.css
│   └─ js/
│       ├─ background.js  Neónová mriežka a svetielka v pozadí
│       ├─ bike.js        Interaktívna motorka (easter egg)
│       ├─ chat.js        MotoAI chat so streamovaním
│       ├─ motorky.js     Vyhľadávanie motoriek + detail
│       ├─ auth.js        Sila hesla, zobrazenie hesla, zhoda hesiel
│       ├─ profile.js     Záložky profilu, napojenie výrezu fotiek
│       ├─ cropper.js     Vlastný nástroj na výber výrezu (posun, zoom)
│       ├─ moto-common.js Spoločné preklady, parsovanie čísel, pravidlá A1/A2/A
│       ├─ compare.js     Porovnanie – grafy, tabuľka, ceny, verdikt
│       └─ ui.js          Menu používateľa, oznámenia
├─ requirements.txt
└─ run.bat
```

## Porovnanie motoriek

- 2 až 4 motorky, výber sa uloží do adresy (`/porovnanie?m=Yamaha|MT-07|2021&m=...`),
  takže porovnanie sa dá poslať ako odkaz. Motorku možno pridať aj z detailu v databáze.
- **Grafy** hlavných parametrov s víťazom každej kategórie (výkon, moment, hmotnosť,
  výkon na kg, rýchlosť, nádrž…), **tabuľka** všetkých parametrov s prepínačom „iba rozdiely".
- **Vodičská skupina** A1 / A2 / A2 s obmedzením / iba A – vypočítaná podľa pravidiel EÚ
  (35 kW, 0,2 kW/kg, pôvodne max. 70 kW).
- **Ceny a dostupnosť** – API Ninjas ceny nemá, preto ich odhadne AI (označené ako
  orientačné, server výsledok kontroluje a 24 h si ho pamätá) + odkazy na inzeráty.
- **Verdikt MotoAI** – zhrnutie a odporúčanie na mieru podľa profilu jazdca.

## Databáza

| Tabuľka | Čo obsahuje |
|---|---|
| `users` | účet (meno, e-mail, hash hesla) + profil (zobrazované meno, bio, mesto, profilovka, banner / farebná téma, vodičák, štýl jazdy, rok, motorka, verejný/súkromný) |
| `bike_marks` | motorky, ktoré si používateľ uložil (`save`) alebo dal páči sa mi (`like`) – iba značka, model, rok |
| `friendships` | kto koho pozval (`requester` → `addressee`) a stav `pending` / `accepted` |

Pri spustení novej verzie sa chýbajúce stĺpce do starej databázy doplnia
automaticky (`extensions.upgrade_schema`), takže existujúce účty sa nestratia.

## Ako funguje prihlasovanie (na obhajobu)

**Registrácia** – používateľ zadá meno, e-mail a heslo. Server všetko
skontroluje (`security.py`: dĺžka, povolené znaky, tvar e-mailu, sila hesla,
či meno/e-mail už neexistuje). Kontrola v prehliadači (`auth.js`) je iba
pre pohodlie – rozhoduje vždy server, lebo JavaScript sa dá obísť.

**Heslá sa nikde neukladajú** – ukladá sa iba ich **hash** algoritmom
**scrypt** s náhodnou **soľou**. Hash je jednosmerný: z hesla sa dá vypočítať,
ale späť sa heslo zistiť nedá. Pri prihlásení sa zadané heslo zahashuje
znova a výsledky sa porovnajú. Záznam v databáze vyzerá napr.:
`scrypt:32768:8:1$JAXHJi6FsSgGvEEA$dff74b...`
(algoritmus a parametre $ soľ $ hash).

**Prihlásenie** – po úspechu sa do **session** uloží iba ID používateľa.
Session je cookie **podpísaná tajným kľúčom**, takže ju používateľ nemôže
podvrhnúť. Cookie má príznaky `HttpOnly` (JavaScript ju neprečíta) a
`SameSite=Lax` (neodošle sa pri formulári z cudzieho webu).

| Ochrana | Proti čomu | Kde v kóde |
|---|---|---|
| Hash scrypt + soľ | únik databázy, rainbow tables | `security.hash_password` |
| CSRF token vo formulároch aj fetch | podvrhnuté formuláre z cudzích webov | `security.csrf_token`, `app.check_csrf` |
| Limit 5 pokusov / 5 min na IP | hádanie hesla (brute force) | `security.LoginRateLimiter` |
| Rovnaká chybová hláška + rovnaký čas odpovede | zisťovanie, ktoré účty existujú | `routes/auth.login`, `fake_password_check` |
| `session.clear()` pri prihlásení | session fixation | `security.login_user` |
| Kontrola `?next=` adresy | presmerovanie na podvodný web | `security.safe_next_url` |
| SQLAlchemy ORM | SQL injection | `models.py`, všetky dotazy |
| `escapeHtml` / `textContent` v JS, Jinja autoescape | XSS | `chat.js`, šablóny |
| `@login_required` | prístup k AI bez prihlásenia | `security.login_required`, `routes/ai.py` |
| Bezpečnostné HTTP hlavičky | clickjacking, MIME sniffing | `app.security_headers` |
| Profilovka: kontrola Pillow, prekódovanie do WEBP, náhodný názov, limit 5 MB | škodlivé súbory, EXIF s GPS polohou | `uploads.py` |
| Kontrola vlastníka pri mazaní | mazanie cudzích dát zmenou čísla v adrese | `profile.remove_mark`, `friends.accept` |
| Citlivé zmeny (e-mail, heslo, zmazanie) vyžadujú heslo | prevzatie účtu na cudzom PC | `routes/profile.py` |
| `data-confirm` namiesto `onclick="confirm('...')"` | XSS cez meno používateľa | `macros.html`, `ui.js` |

## Čo ešte treba dorobiť

Porovnanie, Trasy, Lokácie, Meetupy a Komunita sú zatiaľ len položky
v navigácii. Na profile je pre trasy a lokácie pripravené miesto.
