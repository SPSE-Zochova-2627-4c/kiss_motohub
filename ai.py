# Komunikácia s AI cez OpenRouter
import json
import requests
import config

URL = "https://openrouter.ai/api/v1/chat/completions"
HEADERS = {"Authorization": "Bearer " + config.OPENROUTER_API_KEY}

SYSTEM_PROMPT = (
    "Si MotoAI, asistent na webe MotoHub o motorkách. Odpovedaj stručne a vždy "
    "spisovnou slovenčinou (nie po česky). Pomáhaš s výberom motorky, porovnaním "
    "a otázkami o jazde. Vodičské skupiny na Slovensku sú AM, A1, A2 a A."
)


def ask(messages):
    """Vráti celú odpoveď naraz. Skúša modely, kým niektorý neodpovie."""
    for model in config.AI_MODELS:
        try:
            r = requests.post(URL, headers=HEADERS, json={"model": model, "messages": messages}, timeout=60)
        except requests.RequestException:
            continue  # nedá sa pripojiť – skúsime ďalší model
        if r.ok:
            return r.json()["choices"][0]["message"]["content"]
    return None


def stream(messages):
    """Generátor – posiela odpoveď po kúskoch, aby sa v chate písala postupne."""
    for model in config.AI_MODELS:
        data = {"model": model, "messages": messages, "stream": True}
        try:
            r = requests.post(URL, headers=HEADERS, json=data, stream=True, timeout=60)
        except requests.RequestException:
            continue
        if not r.ok:
            continue  # model je preťažený, skúsime ďalší

        for line in r.iter_lines():
            line = line.decode("utf-8")
            if not line.startswith("data: ") or line == "data: [DONE]":
                continue
            chunk = json.loads(line[6:])
            if not chunk.get("choices"):
                continue
            text = chunk["choices"][0]["delta"].get("content")
            if text:
                yield text
        return

    yield "Prepáč, AI je momentálne preťažená. Skús to o chvíľu."
