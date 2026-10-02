"""
uploads.py – bezpečné spracovanie nahraných obrázkov (profilovka, banner).

Nahrávanie súborov je jedna z najrizikovejších častí webu. Útočník môže
namiesto obrázka poslať škodlivý súbor s koncovkou .jpg, obrovský súbor,
alebo súbor s nebezpečným názvom (napr. "../../app.py").

Preto:
  1. obmedzíme veľkosť (config.MAX_UPLOAD_MB – Flask odmietne väčší súbor),
  2. súbor otvoríme knižnicou Pillow – ak to nie je skutočný obrázok, zlyhá,
  3. vyrežeme časť, ktorú si používateľ vybral v prehliadači (crop),
  4. obrázok zmenšíme a ULOŽÍME NANOVO ako WEBP:
     - z pôvodného súboru nezostane nič okrem pixelov (žiadny skrytý kód),
     - zmiznú aj metadáta EXIF, ktoré môžu obsahovať GPS polohu fotky,
  5. názov súboru vygenerujeme náhodne – meno od používateľa nepoužijeme vôbec.

Výrez (crop) posiela prehliadač ako 4 čísla od 0 do 1 – podiel šírky a výšky
fotky: crop_x, crop_y (ľavý horný roh), crop_w, crop_h (veľkosť výrezu).
Napr. crop_x=0.25 znamená "začni na štvrtine šírky fotky". Vďaka podielom
nezáleží na tom, v akej veľkosti si fotku prehliadač zobrazil.
"""

import os
import secrets

from PIL import Image, ImageOps, UnidentifiedImageError

import config

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}

# (šírka, výška) výsledného obrázka
AVATAR_SIZE = (320, 320)    # štvorec
BANNER_SIZE = (1600, 320)   # pomer strán 5 : 1

os.makedirs(config.AVATAR_DIR, exist_ok=True)
os.makedirs(config.BANNER_DIR, exist_ok=True)


class UploadError(Exception):
    """Chyba pri nahrávaní – text sa zobrazí používateľovi."""


def parse_crop(form):
    """Načíta výrez z formulára. Vráti (x, y, w, h) ako podiely 0–1, alebo None.

    Hodnotám z prehliadača nikdy neveríme – skontrolujeme, že sú to čísla,
    a orežeme ich do povoleného rozsahu.
    """
    try:
        x, y, w, h = (float(form.get(k, "")) for k in ("crop_x", "crop_y", "crop_w", "crop_h"))
    except ValueError:
        return None  # výrez nebol poslaný -> použije sa stred fotky
    if not all(0 <= v <= 1.0001 for v in (x, y)) or not (0.01 <= w <= 1.0001 and 0.01 <= h <= 1.0001):
        return None
    w, h = min(w, 1.0), min(h, 1.0)
    x, y = min(max(x, 0.0), 1.0 - w), min(max(y, 0.0), 1.0 - h)
    return x, y, w, h


def _open_image(file_storage):
    """Otvorí a overí nahraný súbor. Vráti Pillow obrázok v RGB."""
    if not file_storage or not file_storage.filename:
        raise UploadError("Nevybral si žiadny súbor.")
    try:
        image = Image.open(file_storage.stream)
        if image.format not in ALLOWED_FORMATS:
            raise UploadError("Podporované sú iba obrázky JPG, PNG, WEBP alebo GIF.")
        # ochrana pred "dekompresnou bombou" – malý súbor s obrovským rozlíšením
        if image.width * image.height > 40_000_000:
            raise UploadError("Obrázok má príliš veľké rozlíšenie.")
        image.load()  # skutočne načíta pixely – poškodený súbor tu zlyhá
    except UnidentifiedImageError:
        raise UploadError("Súbor nie je platný obrázok.")
    except (OSError, Image.DecompressionBombError):
        raise UploadError("Obrázok sa nepodarilo načítať.")
    # otočí fotku z mobilu podľa EXIF – rovnako ju zobrazuje aj prehliadač,
    # takže výrez vybraný v prehliadači sedí
    image = ImageOps.exif_transpose(image)
    return image.convert("RGB")


def _process(file_storage, crop, size, folder):
    image = _open_image(file_storage)

    if crop:
        # podiely 0–1 prepočítame na pixely tejto fotky a vyrežeme
        x, y, w, h = crop
        box = (
            round(x * image.width),
            round(y * image.height),
            round((x + w) * image.width),
            round((y + h) * image.height),
        )
        image = image.crop(box)

    # zmenšenie na cieľovú veľkosť; ImageOps.fit navyše oreže stred,
    # ak by pomer strán výrezu nesedel presne (napr. bez výrezu)
    image = ImageOps.fit(image, size, Image.LANCZOS)

    filename = secrets.token_hex(12) + ".webp"  # náhodný názov, napr. 3f9a...c1.webp
    image.save(os.path.join(folder, filename), "WEBP", quality=86)
    return filename


def save_avatar(file_storage, crop=None):
    """Spracuje profilovku (štvorec 320×320) a vráti názov súboru."""
    return _process(file_storage, crop, AVATAR_SIZE, config.AVATAR_DIR)


def save_banner(file_storage, crop=None):
    """Spracuje banner (1600×320, pomer 5:1) a vráti názov súboru."""
    return _process(file_storage, crop, BANNER_SIZE, config.BANNER_DIR)


def _delete(folder, filename):
    if not filename:
        return
    # os.path.basename zaručí, že názov neobsahuje cestu (napr. ../)
    path = os.path.join(folder, os.path.basename(filename))
    if os.path.isfile(path):
        os.remove(path)


def delete_avatar(filename):
    _delete(config.AVATAR_DIR, filename)


def delete_banner(filename):
    _delete(config.BANNER_DIR, filename)
