"""
routes/ai.py – MotoAI chat (adresy). Samotná komunikácia s AI je v ai_client.py.

Adresy (obe vyžadujú prihlásenie – dekorátor @login_required):
  POST /api/ask         ... celá odpoveď naraz (JSON)
  POST /api/ask-stream  ... odpoveď po kúskoch (Server-Sent Events),
                            vďaka tomu v chate vidno, ako AI "píše"
"""

from flask import Blueprint, Response, jsonify, request, stream_with_context

import ai_client
from security import login_required

bp = Blueprint("ai", __name__)

# Systémová správa = "pracovná náplň" pre AI. Posiela sa pred každou
# konverzáciou a určuje, ako sa má asistent správať.
SYSTEM_PROMPT = """Si MotoAI, asistent webovej aplikácie MotoHub o motorkách.
Pomáhaš s výberom motoriek, porovnávaním parametrov a otázkami o jazde a údržbe.

JAZYK – najdôležitejšie pravidlo:
- Píš VÝHRADNE spisovnou slovenčinou. Nikdy nepoužívaj češtinu ani české slová.
- Dávaj pozor na slovenské tvary, ktoré sa od češtiny líšia, napríklad:
  ľahká (nie lehká), ľahko, pomerne, vhodná, začiatočník, brzdy, zákruty,
  výkon, hmotnosť, sedadlo, jazdec, skúsenosť, odporúčam, je potrebné,
  môže, veľmi, ešte, aj (nie i), keď (nie když), preto, pretože.
- Dodržuj zhodu podstatného a prídavného mena v rode, čísle a páde:
  dobré brzdy, ľahká motorka, silný motor, predvídateľný výkon.
- Používaj mäkčene a dĺžne správne (ľ, ť, ď, ň, č, š, ž, ô, ä, á, é, í, ó, ú, ý).
- Nevymýšľaj slová. Ak si nie si istý slovom, použi jednoduchšie bežné slovo.
- Čísla píš ako číslice a nevkladaj ich doprostred slov.

OBSAH:
- Odpovedaj stručne a vecne, zvyčajne 2 až 5 viet, prípadne krátky zoznam.
- Nevymýšľaj technické údaje ani predpisy. Ak si niečím nie si istý, povedz to.
- Pri vodičských oprávneniach používaj slovenské skupiny A1, A2 a A.

Príklad dobrej odpovede:
Otázka: Je Yamaha MT-07 vhodná pre začiatočníka?
Odpoveď: **Áno, je to veľmi obľúbená voľba.** Má ľahký podvozok, pokojne \
reagujúci dvojvalcový motor a nízke sedadlo. S vodičským oprávnením A2 \
potrebuješ verziu obmedzenú na 35 kW. Na začiatku odporúčam kurz bezpečnej jazdy.
"""


def build_messages(question, history):
    """Poskladá zoznam správ pre AI: systémová správa + história chatu + nová otázka."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in (history or [])[-20:]:  # max. 20 posledných správ (šetrí limity)
        role = "assistant" if msg.get("role") in ("model", "assistant") else "user"
        text = str(msg.get("text") or "").strip()[:4000]
        if text:
            messages.append({"role": role, "content": text})
    messages.append({"role": "user", "content": question})
    return messages


def event_stream_response(generator):
    """Zabalí generátor udalostí do HTTP odpovede typu text/event-stream."""
    return Response(
        stream_with_context(generator),
        content_type="text/event-stream; charset=utf-8",
        # vypnúť ukladanie do vyrovnávacej pamäte, aby kúsky prišli hneď
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@bp.route("/api/ask", methods=["POST"])
@login_required  # AI môžu používať iba prihlásení používatelia
def api_ask():
    """Pošle otázku AI asistentovi a vráti celú odpoveď naraz."""
    data = request.get_json(silent=True) or {}
    question = str(data.get("question") or "").strip()[:2000]
    if not question:
        return jsonify({"error": "Chýba otázka."}), 400
    try:
        answer, model = ai_client.complete(build_messages(question, data.get("history")))
    except ai_client.AIError as exc:
        return jsonify({"error": str(exc)}), 502
    return jsonify({"answer": answer, "model": model})


@bp.route("/api/ask-stream", methods=["POST"])
@login_required  # AI môžu používať iba prihlásení používatelia
def api_ask_stream():
    """Streamovaná verzia – posiela signál 'thinking' (AI premýšľa) a 'text'
    (odpoveď) postupne, aby sa v chate dalo ukázať, ako AI premýšľa a píše."""
    data = request.get_json(silent=True) or {}
    question = str(data.get("question") or "").strip()[:2000]
    if not question:
        return event_stream_response(iter([ai_client.sse({"error": "Chýba otázka."}), ai_client.sse("[DONE]")]))
    return event_stream_response(ai_client.stream_events(build_messages(question, data.get("history"))))
