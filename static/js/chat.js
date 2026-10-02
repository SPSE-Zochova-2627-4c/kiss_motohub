/*
 * chat.js – MotoAI chat na homepage.
 *
 * Ako to funguje:
 *  1. Používateľ napíše otázku (alebo klikne na tip) a stlačí Enter.
 *  2. Pošleme ju na server (POST /api/ask-stream) spolu s históriou
 *     konverzácie, aby si AI pamätala, o čom sa rozprávame.
 *  3. Server posiela odpoveď PO KÚSKOCH (Server-Sent Events) a my každý
 *     kúsok hneď vykreslíme – odpoveď sa "píše" pred očami.
 *     Udalosti zo servera:  {thinking: true}  AI premýšľa
 *                           {text}            časť odpovede
 *                           {status}          napr. "skúšam ďalší model"
 *                           {model}           ktorý model odpovedá
 *                           {error}           chyba
 *  4. Počas odpovede sa tlačidlo zmení na ŠTVORČEK – klik odpoveď zastaví
 *     (AbortController preruší spojenie so serverom).
 *  5. AI môže používať iba prihlásený používateľ.
 */
document.addEventListener("DOMContentLoaded", function () {
  var dock = document.getElementById("ai-dock");
  if (!dock) return;
  var chatWindow = document.getElementById("chat-window");
  var input = document.getElementById("ai-input");
  var sendBtn = document.getElementById("ai-send");
  var newChatBtn = document.getElementById("ai-new");
  var suggestions = document.getElementById("ai-suggestions");
  var lockedPanel = document.getElementById("ai-locked");

  var isLoggedIn = dock.getAttribute("data-logged-in") === "1";
  var history = [];        // [{ role: "user" | "model", text: "..." }, ...]
  var controller = null;   // AbortController aktuálnej odpovede (null = nič nebeží)

  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrfMeta ? csrfMeta.getAttribute("content") : "";

  // Slovenské texty, ktoré sa striedajú, kým AI premýšľa
  var THINKING_STEPS = [
    "Premýšľam nad otázkou",
    "Prechádzam, čo viem o motorkách",
    "Porovnávam možnosti",
    "Skladám odpoveď",
  ];

  // ===========================================================================
  // Pomocné funkcie
  // ===========================================================================

  // Ochrana pred XSS: text nikdy nevkladáme ako HTML priamo, najprv
  // "zneškodníme" znaky < > & " ' na ich HTML zápis.
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Jednoduchý formátovač odpovede: **tučné**, nadpisy ###, odseky, odrážky a číslovanie.
  function formatText(raw) {
    var inline = function (s) { return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); };
    var html = "", list = null; // list = "ul" / "ol" / null
    function closeList() { if (list) { html += "</" + list + ">"; list = null; } }

    raw.split("\n").forEach(function (line) {
      var t = line.trim();
      var m;
      if ((m = /^[*-]\s+(.*)/.exec(t))) {
        if (list !== "ul") { closeList(); html += "<ul>"; list = "ul"; }
        html += "<li>" + inline(m[1]) + "</li>";
      } else if ((m = /^\d+[.)]\s+(.*)/.exec(t))) {
        if (list !== "ol") { closeList(); html += "<ol>"; list = "ol"; }
        html += "<li>" + inline(m[1]) + "</li>";
      } else if ((m = /^#{1,4}\s+(.*)/.exec(t))) {
        closeList(); html += "<h4>" + inline(m[1]) + "</h4>";
      } else {
        closeList();
        if (t) html += "<p>" + inline(t) + "</p>";
      }
    });
    closeList();
    return html || escapeHtml(raw);
  }

  // "nvidia/nemotron-3-ultra-550b-a55b:free" -> "nemotron-3-ultra-550b-a55b"
  function prettyModel(id) {
    return String(id).split("/").pop().replace(/:free$/, "");
  }

  function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  // Pole na písanie sa zväčšuje podľa textu (max. ~6 riadkov)
  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }

  // Tlačidlo: šípka (odoslať) <-> štvorček (zastaviť)
  function setBusy(busy) {
    dock.classList.toggle("busy", busy);
    sendBtn.classList.toggle("stop", busy);
    sendBtn.setAttribute("aria-label", busy ? "Zastaviť odpoveď" : "Odoslať otázku");
    sendBtn.title = busy ? "Zastaviť" : "Odoslať (Enter)";
  }

  function openChat() {
    dock.classList.add("active");
    if (suggestions) suggestions.hidden = true;
    if (newChatBtn) newChatBtn.hidden = false;
  }

  function showLoginPrompt() {
    if (lockedPanel) {
      lockedPanel.hidden = false;
      if (suggestions) suggestions.hidden = true;
    }
  }

  // ===========================================================================
  // Bubliny správ
  // ===========================================================================

  function addUserMessage(text) {
    var row = document.createElement("div");
    row.className = "msg-row user";
    var bubble = document.createElement("div");
    bubble.className = "msg user";
    bubble.textContent = text; // textContent = bezpečné, nevykoná sa žiadne HTML
    row.appendChild(bubble);
    chatWindow.appendChild(row);
    scrollToBottom();
  }

  // Správa od AI: vľavo malá žiariaca guľa, vpravo obsah
  function addModelMessage() {
    var row = document.createElement("div");
    row.className = "msg-row model";
    row.innerHTML =
      '<span class="ai-orb small" aria-hidden="true"></span>' +
      '<div class="msg model">' +
      '  <div class="thinking-line"><span class="typing"><span></span><span></span><span></span></span>' +
      '    <span class="thinking-text">Pripravujem odpoveď</span></div>' +
      '  <div class="answer"></div>' +
      '  <div class="msg-meta" hidden></div>' +
      "</div>";
    chatWindow.appendChild(row);
    scrollToBottom();
    return {
      row: row,
      thinking: row.querySelector(".thinking-line"),
      thinkingText: row.querySelector(".thinking-text"),
      answer: row.querySelector(".answer"),
      meta: row.querySelector(".msg-meta"),
    };
  }

  // ===========================================================================
  // Odoslanie otázky a čítanie streamovanej odpovede
  // ===========================================================================

  function ask(question) {
    if (controller || !question) return;
    openChat();
    addUserMessage(question);
    var ui = addModelMessage();

    controller = new AbortController();
    setBusy(true);

    var answerText = "";
    var modelName = "";
    var hadError = false;
    var stopped = false;
    var thinkStart = 0, thinkTimer = null, stepIndex = 0, thinkSeconds = 0;

    // --- indikátor premýšľania: striedanie slovenských textov + čas ---
    function startThinking() {
      if (thinkTimer) return;
      thinkStart = Date.now();
      ui.thinking.classList.add("deep");
      var tick = function () {
        var secs = Math.floor((Date.now() - thinkStart) / 1000);
        stepIndex = Math.min(THINKING_STEPS.length - 1, Math.floor(secs / 3));
        ui.thinkingText.textContent = THINKING_STEPS[stepIndex] + "… " + secs + " s";
      };
      tick();
      thinkTimer = setInterval(tick, 500);
    }
    function stopThinking() {
      if (thinkTimer) {
        clearInterval(thinkTimer);
        thinkTimer = null;
        thinkSeconds = Math.max(1, Math.round((Date.now() - thinkStart) / 1000));
      }
      ui.thinking.hidden = true;
    }

    function showError(html) {
      hadError = true;
      stopThinking();
      ui.answer.innerHTML = '<p class="err">' + html + "</p>";
    }

    function handleEvent(obj) {
      if (obj.error) { showError(escapeHtml(obj.error)); return; }
      if (obj.model) modelName = obj.model;
      if (obj.status && !answerText) ui.thinkingText.textContent = obj.status;
      if (obj.thinking) startThinking();
      if (obj.text) {
        if (!answerText) stopThinking();
        answerText += obj.text;
        // blikajúci kurzor na konci, kým AI píše
        ui.answer.innerHTML = formatText(answerText) + '<span class="caret"></span>';
        scrollToBottom();
      }
    }

    fetch("/api/ask-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ question: question, history: history }),
      signal: controller.signal, // vďaka tomu sa dá požiadavka zastaviť
    })
      .then(function (res) {
        if (res.status === 401) {
          isLoggedIn = false;
          showError('Pre MotoAI sa musíš prihlásiť. <a href="/prihlasenie?next=/">Prihlásiť sa</a>');
          return;
        }
        if (!res.ok && (res.headers.get("Content-Type") || "").indexOf("application/json") !== -1) {
          return res.json().then(function (d) { showError(escapeHtml(d.error || "Chyba servera.")); });
        }
        if (!res.body) throw new Error("Prehliadač nepodporuje streamovanie.");

        // Čítanie streamu: udalosti sú oddelené prázdnym riadkom a začínajú "data: "
        var reader = res.body.getReader();
        var decoder = new TextDecoder("utf-8");
        var buffer = "";

        function readChunk() {
          return reader.read().then(function (result) {
            if (result.done) return;
            buffer += decoder.decode(result.value, { stream: true });
            var events = buffer.split("\n\n");
            buffer = events.pop(); // posledný kúsok môže byť neúplný
            events.forEach(function (raw) {
              var line = raw.trim();
              if (line.indexOf("data:") !== 0) return;
              var payload = line.slice(5).trim();
              if (payload === '"[DONE]"' || payload === "[DONE]") return;
              try { handleEvent(JSON.parse(payload)); } catch (e) { /* poškodený kúsok ignorujeme */ }
            });
            return readChunk();
          });
        }
        return readChunk();
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") { stopped = true; return; } // zastavil používateľ
        showError("Nepodarilo sa spojiť so serverom.");
      })
      .finally(function () {
        controller = null;
        setBusy(false);
        stopThinking();

        if (answerText) {
          ui.answer.innerHTML = formatText(answerText) + (stopped ? '<p class="stopped-note">Odpoveď bola zastavená.</p>' : "");
          history.push({ role: "user", text: question });
          history.push({ role: "model", text: answerText });

          // pod odpoveďou: kopírovať, čas premýšľania, model
          var meta = '<button type="button" class="copy-btn" title="Kopírovať odpoveď">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Kopírovať</button>';
          if (thinkSeconds) meta += '<span class="meta-chip">Premýšľal ' + thinkSeconds + " s</span>";
          if (modelName) meta += '<span class="meta-chip">' + escapeHtml(prettyModel(modelName)) + "</span>";
          ui.meta.innerHTML = meta;
          ui.meta.hidden = false;
          ui.meta.querySelector(".copy-btn").addEventListener("click", function (e) {
            var btn = e.currentTarget;
            navigator.clipboard.writeText(answerText).then(function () {
              btn.classList.add("done");
              btn.lastChild.textContent = " Skopírované";
              setTimeout(function () { btn.classList.remove("done"); btn.lastChild.textContent = " Kopírovať"; }, 1600);
            });
          });
        } else if (stopped) {
          ui.answer.innerHTML = '<p class="stopped-note">Odpoveď bola zastavená.</p>';
        } else if (!hadError) {
          showError("AI nevrátila žiadnu odpoveď. Skús to znova.");
        }
        scrollToBottom();
        input.focus();
      });
  }

  // ===========================================================================
  // Udalosti
  // ===========================================================================

  function submit() {
    if (controller) { controller.abort(); return; } // tlačidlo je štvorček -> zastaviť
    if (!isLoggedIn) { showLoginPrompt(); return; }
    var question = (input.value || "").trim();
    if (!question) return;
    input.value = "";
    autoGrow();
    ask(question);
  }

  sendBtn.addEventListener("click", submit);

  input.addEventListener("keydown", function (e) {
    // Enter = odoslať, Shift+Enter = nový riadok
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      submit();
    }
  });
  input.addEventListener("input", autoGrow);
  input.addEventListener("focus", function () {
    if (!isLoggedIn) showLoginPrompt();
  });

  // Tipy na otázky
  if (suggestions) {
    suggestions.addEventListener("click", function (e) {
      var chip = e.target.closest("[data-q]");
      if (!chip) return;
      if (!isLoggedIn) { showLoginPrompt(); return; }
      ask(chip.getAttribute("data-q"));
    });
  }

  // Nová konverzácia – vymaže históriu aj správy
  if (newChatBtn) {
    newChatBtn.addEventListener("click", function () {
      if (controller) controller.abort();
      history = [];
      chatWindow.innerHTML = "";
      dock.classList.remove("active");
      newChatBtn.hidden = true;
      if (suggestions) suggestions.hidden = false;
      input.focus();
    });
  }
});
