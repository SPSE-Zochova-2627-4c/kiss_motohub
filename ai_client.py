"""
ai_client.py – komunikácia s AI cez OpenRouter (bez Flask adries).

Tento modul používa viac častí webu:
  routes/ai.py       ... MotoAI chat na homepage
  routes/compare.py  ... odhad cien a verdikt pri porovnaní motoriek

Hlavné funkcie:
  complete(messages)       -> celá odpoveď naraz (text) – napr. pre JSON s cenami
  stream_events(messages)  -> generátor udalostí pre prehliadač (odpoveď po kúskoch)

Zaujímavosti na vysvetlenie:
  - Striedanie modelov: bezplatné modely bývajú preťažené, preto skúšame
    zoznam config.AI_MODELS, kým niektorý neodpovie.
  - Streamovanie: OpenRouter posiela odpoveď po kúskoch (Server-Sent Events),
    my každý kúsok hneď preposielame prehliadaču (generátor + yield).
  - Kódovanie: bajty dekódujeme natvrdo ako UTF-8, inak by sa rozbili
    slovenské znaky (ľ, š, č...).
  - Premýšľanie: text premýšľania modelu je po anglicky, preto ho neposielame,
    iba signál {"thinking": true} – chat ukáže slovenský indikátor.
"""

import json

import requests
from flask import current_app

import config

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class AIError(Exception):
    """Žiadny model neodpovedal – text chyby sa ukáže používateľovi."""


class ModelFailed(Exception):
    """Jeden model zlyhal skôr, než začal odpovedať – dá sa skúsiť ďalší."""

    def __init__(self, message, status):
        super().__init__(message)
        self.message = message
        self.status = status


# -----------------------------------------------------------------------------
# Pomocné funkcie
# -----------------------------------------------------------------------------


def _headers():
    return {
        "Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        # nepovinné – appka sa podľa nich zobrazí v štatistikách OpenRouteru
        "HTTP-Referer": "http://127.0.0.1:5000",
        "X-Title": "MotoHub",
    }


def _payload(messages, model, stream, reasoning, temperature):
    return {
        "model": model,
        "messages": messages,
        "stream": stream,
        # nižšia teplota = menej "kreatívnych" preklepov a vymyslených slov
        "temperature": temperature,
        "reasoning": {"enabled": bool(reasoning)},
    }


def explain_error(status, body):
    """Preloží najčastejšie chyby OpenRouteru do zrozumiteľnej slovenčiny."""
    hints = {
        401: "Neplatný OpenRouter API kľúč – skontroluj OPENROUTER_API_KEY v .env / config.py.",
        402: "Na OpenRouter účte chýba kredit pre tento model.",
        404: "Model sa nenašiel alebo ho blokujú nastavenia súkromia na openrouter.ai/settings/privacy.",
        429: "Bezplatný model je momentálne preťažený alebo si prekročil limit. Skús to o chvíľu znova.",
    }
    msg = hints.get(status, f"OpenRouter vrátil chybu {status}.")
    try:
        detail = json.loads(body).get("error", {}).get("message", "")
    except Exception:
        detail = body[:200]
    return f"{msg} ({detail})" if detail else msg


def sse(obj):
    """Jedna udalosť vo formáte Server-Sent Events: 'data: {...}' + prázdny riadok."""
    return f"data: {json.dumps(obj)}\n\n"


# -----------------------------------------------------------------------------
# Celá odpoveď naraz
# -----------------------------------------------------------------------------


def complete(messages, reasoning=False, temperature=0.3):
    """Vráti (text odpovede, názov modelu). Pri zlyhaní všetkých modelov AIError."""
    if not config.OPENROUTER_API_KEY:
        raise AIError("Chýba OPENROUTER_API_KEY v config.py / .env")

    last_error = "Žiadny model nie je nastavený v AI_MODELS."
    for model in config.AI_MODELS:
        try:
            resp = requests.post(
                OPENROUTER_URL,
                headers=_headers(),
                json=_payload(messages, model, False, reasoning, temperature),
                timeout=90,
            )
        except requests.RequestException as exc:
            last_error = f"Nepodarilo sa spojiť s OpenRouterom: {exc}"
            continue

        body = resp.content.decode("utf-8", errors="replace")
        if resp.status_code >= 400:
            last_error = explain_error(resp.status_code, body)
            if resp.status_code in (401, 402):
                break  # zlý kľúč / kredit – iný model nepomôže
            continue

        try:
            answer = (json.loads(body)["choices"][0]["message"]["content"] or "").strip()
        except (KeyError, IndexError, ValueError, TypeError):
            answer = ""
        if answer:
            return answer, model
        last_error = "Model vrátil prázdnu odpoveď."

    raise AIError("Žiadny z AI modelov teraz neodpovedá. " + last_error)


# -----------------------------------------------------------------------------
# Odpoveď po kúskoch (streamovanie)
# -----------------------------------------------------------------------------


def _stream_one_model(messages, model, reasoning, temperature):
    """Streamuje jeden model. Ak zlyhá ešte pred prvým slovom odpovede,
    vyhodí ModelFailed, aby sa dal skúsiť ďalší model."""
    with requests.post(
        OPENROUTER_URL,
        headers=_headers(),
        json=_payload(messages, model, True, reasoning, temperature),
        stream=True,
        timeout=(10, 120),
    ) as resp:
        if resp.status_code >= 400:
            body = resp.content.decode("utf-8", errors="replace")
            raise ModelFailed(explain_error(resp.status_code, body), resp.status_code)

        got_output = False
        thinking_sent = False
        for raw_line in resp.iter_lines():
            if not raw_line:
                continue
            line = raw_line.decode("utf-8", errors="replace")
            # riadky začínajúce ":" sú len "keep-alive" komentáre OpenRouteru
            if not line.startswith("data:"):
                continue
            chunk = line[len("data:"):].strip()
            if not chunk or chunk == "[DONE]":
                continue
            try:
                obj = json.loads(chunk)
            except ValueError:
                continue
            if obj.get("error"):
                err = obj["error"]
                msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                if not got_output:
                    raise ModelFailed(msg, 0)
                yield sse({"error": msg})
                return
            try:
                delta = obj["choices"][0].get("delta") or {}
            except (KeyError, IndexError):
                continue
            if delta.get("reasoning"):
                got_output = True
                # Text premýšľania je po anglicky – posielame iba signál, že AI premýšľa
                if not thinking_sent:
                    thinking_sent = True
                    yield sse({"thinking": True})
            if delta.get("content"):
                got_output = True
                yield sse({"text": delta["content"]})
        if not got_output:
            raise ModelFailed("Model nevrátil žiadnu odpoveď.", 0)


def stream_events(messages, reasoning=None, temperature=0.3):
    """Generátor udalostí pre prehliadač so striedaním modelov.
    Keď používateľ klikne na "zastaviť", prehliadač preruší spojenie,
    generátor sa ukončí a s ním aj požiadavka na OpenRouter."""
    if reasoning is None:
        reasoning = config.AI_THINKING
    if not config.OPENROUTER_API_KEY:
        yield sse({"error": "Chýba OPENROUTER_API_KEY v config.py / .env"})
        yield sse("[DONE]")
        return

    last_error = "Žiadny model nie je nastavený v AI_MODELS."
    for i, model in enumerate(config.AI_MODELS):
        if i > 0:
            yield sse({"status": "Model je preťažený, skúšam ďalší…"})
        try:
            yield sse({"model": model})
            yield from _stream_one_model(messages, model, reasoning, temperature)
            yield sse("[DONE]")
            return
        except ModelFailed as exc:
            last_error = exc.message
            current_app.logger.warning("Model %s zlyhal: %s", model, exc.message)
            if exc.status in (401, 402):
                break  # zlý kľúč / kredit – iný model nepomôže
        except requests.RequestException as exc:
            last_error = f"Nepodarilo sa spojiť s OpenRouterom: {exc}"
    yield sse({"error": "Žiadny z AI modelov teraz neodpovedá. " + last_error})
    yield sse("[DONE]")
