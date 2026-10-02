/*
 * compare.js – stránka Porovnanie motoriek.
 *
 * Priebeh:
 *  1. Používateľ pridá 2–4 motorky (vyhľadanie cez /api/motorcycles).
 *     Výber sa uloží do adresy (?m=Yamaha|MT-07|2021) – porovnanie sa dá
 *     poslať kamarátovi – a do localStorage prehliadača.
 *  2. Z textov API vytiahneme čísla (MotoCommon.num) a vykreslíme:
 *       - stĺpcové grafy hlavných parametrov + víťaza každej kategórie,
 *       - tabuľku všetkých parametrov (voliteľne "iba rozdiely"),
 *       - vhodnosť pre vodičské skupiny A1 / A2 / A.
 *  3. Pre prihláseného: AI odhad cien (/api/compare/prices)
 *     a AI verdikt po kúskoch (/api/compare/verdict).
 */
document.addEventListener("DOMContentLoaded", function () {
  var root = document.getElementById("compare");
  if (!root) return;

  var M = window.MotoCommon;
  var esc = M.escapeHtml;
  var MAX = parseInt(root.getAttribute("data-max"), 10) || 4;
  var loggedIn = root.getAttribute("data-logged-in") === "1";
  var rider = root.getAttribute("data-rider") || "";
  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrfMeta ? csrfMeta.getAttribute("content") : "";
  var STORAGE_KEY = "motohub.compare";

  // Každá motorka má vlastnú farbu (graf, tabuľka, karta)
  var COLORS = ["#b98cff", "#ff6fb5", "#45d4ff", "#ffc24a"];

  var slotsEl = document.getElementById("slots");
  var bodyEl = document.getElementById("compare-body");
  var presetsEl = document.getElementById("presets");

  // slots = [{ make, model, year, bike: (objekt z API) | null, status: "loading"|"ok"|"error", error }]
  var slots = [];
  var prices = {}; // kľúč motorky -> odhad cien od AI
  var pickerOpen = false;

  function keyOf(s) { return [s.make, s.model, s.year || ""].join("|").toLowerCase(); }
  function titleOf(b) { return b.make + " " + b.model; }

  // ===========================================================================
  // Uloženie výberu: adresa stránky + localStorage
  // ===========================================================================

  function saveSelection() {
    var list = slots.map(function (s) { return { make: s.make, model: s.model, year: s.year || "" }; });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* súkromný režim */ }
    var params = new URLSearchParams();
    list.forEach(function (s) { params.append("m", [s.make, s.model, s.year].join("|")); });
    history.replaceState(null, "", location.pathname + (list.length ? "?" + params.toString() : ""));
  }

  function loadSelection() {
    var fromUrl = new URLSearchParams(location.search).getAll("m").map(function (v) {
      var p = v.split("|");
      return { make: p[0] || "", model: p[1] || "", year: p[2] || "" };
    }).filter(function (s) { return s.make && s.model; });
    if (fromUrl.length) return fromUrl.slice(0, MAX);
    try { return (JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).slice(0, MAX); } catch (e) { return []; }
  }

  // ===========================================================================
  // Načítanie parametrov motorky z API
  // ===========================================================================

  function fetchBikes(make, model, year) {
    var params = new URLSearchParams({ make: make });
    if (model) params.set("model", model);
    if (year) params.set("year", year);
    return fetch("/api/motorcycles?" + params.toString())
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.error) throw new Error(data.error);
        return Array.isArray(data) ? data : [];
      });
  }

  // Motorku z adresy / localStorage dohľadáme v API (presná zhoda modelu a roku)
  function loadSlot(slot) {
    slot.status = "loading";
    fetchBikes(slot.make, slot.model, slot.year)
      .then(function (list) {
        var want = slot.model.toLowerCase();
        var exact = list.filter(function (b) {
          return (b.model || "").toLowerCase() === want && (!slot.year || String(b.year) === String(slot.year));
        });
        var bike = exact[0] || list[0];
        if (!bike) throw new Error("Motorka sa v databáze nenašla.");
        slot.bike = bike;
        slot.status = "ok";
      })
      .catch(function (err) {
        slot.status = "error";
        slot.error = err.message || "Nepodarilo sa načítať.";
      })
      .finally(render);
  }

  function addBike(bike) {
    if (slots.length >= MAX) return;
    var slot = { make: bike.make, model: bike.model, year: String(bike.year || ""), bike: bike, status: "ok" };
    if (slots.some(function (s) { return keyOf(s) === keyOf(slot); })) return; // už je v porovnaní
    slots.push(slot);
    pickerOpen = false;
    saveSelection();
    render();
  }

  function removeSlot(index) {
    slots.splice(index, 1);
    saveSelection();
    render();
  }

  // ===========================================================================
  // Karty vybraných motoriek
  // ===========================================================================

  function licenceBadge(b) {
    var l = M.licence(b);
    return '<span class="lic-badge lic-' + l.key + '" title="' + esc(l.note) + '">' + esc(l.label) + "</span>";
  }

  function tile(label, value) {
    return '<div class="mini-stat"><span>' + label + "</span><b>" + (value != null && value !== "" ? esc(value) : "—") + "</b></div>";
  }

  function slotCard(slot, i) {
    var color = COLORS[i];
    var head = '<button type="button" class="icon-btn slot-remove" data-remove="' + i + '" aria-label="Odobrať z porovnania">✕</button>';
    if (slot.status === "loading") {
      return '<div class="slot-card" style="--c:' + color + '">' + head + '<div class="spinner"></div><p class="muted small">Načítavam ' + esc(slot.make + " " + slot.model) + "…</p></div>";
    }
    if (slot.status === "error") {
      return '<div class="slot-card error" style="--c:' + color + '">' + head + "<h3>" + esc(slot.make + " " + slot.model) + '</h3><p class="err small">' + esc(slot.error) + "</p></div>";
    }
    var b = slot.bike, n = M.num;
    var kw = n.kw(b), hp = n.hp(b), kg = n.kg(b), ccm = n.ccm(b);
    var detail = "/motorky?" + new URLSearchParams({ make: b.make, model: b.model, year: b.year || "", open: 1 }).toString();
    return (
      '<div class="slot-card" style="--c:' + color + '">' + head +
      '<span class="slot-dot"></span>' +
      "<h3>" + esc(titleOf(b)) + "</h3>" +
      '<p class="slot-sub">' + esc([b.year, M.tr(b.type)].filter(Boolean).join(" · ")) + "</p>" +
      licenceBadge(b) +
      '<div class="mini-stats">' +
      tile("Výkon", kw ? Math.round(kw) + " kW / " + Math.round(hp) + " k" : null) +
      tile("Hmotnosť", kg ? Math.round(kg) + " kg" : null) +
      tile("Objem", ccm ? Math.round(ccm) + " cm³" : null) +
      "</div>" +
      '<a class="slot-link" href="' + esc(detail) + '">Detail motorky →</a>' +
      "</div>"
    );
  }

  function addCard() {
    if (!pickerOpen) {
      return '<button type="button" class="slot-card add" id="open-picker">' +
        '<span class="plus">+</span><b>Pridať motorku</b><small>' + slots.length + " / " + MAX + "</small></button>";
    }
    return (
      '<div class="slot-card picker">' +
      '<button type="button" class="icon-btn slot-remove" id="close-picker" aria-label="Zavrieť">✕</button>' +
      "<h3>Pridať motorku</h3>" +
      '<form id="picker-form" class="picker-form">' +
      '<input name="make" placeholder="Značka (napr. Honda)" required autocomplete="off">' +
      '<input name="model" placeholder="Model (napr. CB650R)" autocomplete="off">' +
      '<input name="year" placeholder="Rok (nepovinné)" inputmode="numeric" autocomplete="off">' +
      '<button class="btn-primary btn-sm" type="submit">Hľadať</button>' +
      "</form>" +
      '<div class="picker-results" id="picker-results"></div>' +
      "</div>"
    );
  }

  function renderSlots() {
    var html = slots.map(slotCard).join("");
    if (slots.length < MAX) html += addCard();
    slotsEl.innerHTML = html;
    slotsEl.style.setProperty("--cols", Math.min(MAX, slots.length + (slots.length < MAX ? 1 : 0)));

    var openBtn = document.getElementById("open-picker");
    if (openBtn) openBtn.addEventListener("click", function () { pickerOpen = true; render(); focusPicker(); });
    var closeBtn = document.getElementById("close-picker");
    if (closeBtn) closeBtn.addEventListener("click", function () { pickerOpen = false; render(); });
    var form = document.getElementById("picker-form");
    if (form) form.addEventListener("submit", searchPicker);
  }

  function focusPicker() {
    var f = document.querySelector('#picker-form input[name="make"]');
    if (f) f.focus();
  }

  // Vyhľadávanie v okne "Pridať motorku"
  var pickerResults = [];
  function searchPicker(e) {
    e.preventDefault();
    var form = e.target;
    var out = document.getElementById("picker-results");
    var make = form.make.value.trim();
    if (!make) return;
    out.innerHTML = '<div class="spinner"></div>';
    fetchBikes(make, form.model.value.trim(), form.year.value.trim())
      .then(function (list) {
        pickerResults = list.slice(0, 12);
        if (!pickerResults.length) { out.innerHTML = '<p class="muted small">Nič sa nenašlo.</p>'; return; }
        out.innerHTML = pickerResults.map(function (b, i) {
          var used = slots.some(function (s) { return keyOf(s) === keyOf({ make: b.make, model: b.model, year: String(b.year || "") }); });
          return '<button type="button" class="pick-item" data-pick="' + i + '"' + (used ? " disabled" : "") + ">" +
            "<b>" + esc(titleOf(b)) + "</b><small>" + esc([b.year, M.tr(b.type), M.shortPower(b.power)].filter(Boolean).join(" · ")) +
            (used ? " · už v porovnaní" : "") + "</small></button>";
        }).join("");
      })
      .catch(function (err) { out.innerHTML = '<p class="err small">' + esc(err.message) + "</p>"; });
  }

  slotsEl.addEventListener("click", function (e) {
    var rm = e.target.closest("[data-remove]");
    if (rm) { removeSlot(+rm.getAttribute("data-remove")); return; }
    var pick = e.target.closest("[data-pick]");
    if (pick && !pick.disabled) addBike(pickerResults[+pick.getAttribute("data-pick")]);
  });

  // ===========================================================================
  // Grafy hlavných parametrov
  // ===========================================================================

  // better: "high" = vyššie je lepšie, "low" = nižšie je lepšie, null = neutrálne
  var METRICS = [
    { get: M.num.kw, label: "Výkon", unit: "kW", better: "high", dec: 0 },
    { get: M.num.nm, label: "Krútiaci moment", unit: "Nm", better: "high", dec: 0 },
    { get: M.num.kg, label: "Hmotnosť", unit: "kg", better: "low", dec: 0 },
    { get: M.num.ratio, label: "Výkon na kilogram", unit: "kW/kg", better: "high", dec: 3,
      hint: "Čím vyššie, tým svižnejšie zrýchlenie. Pre skupinu A2 max. 0,2." },
    { get: M.num.kmh, label: "Max. rýchlosť", unit: "km/h", better: "high", dec: 0 },
    { get: M.num.fuel, label: "Objem nádrže", unit: "l", better: "high", dec: 1 },
    { get: M.num.seat, label: "Výška sedla", unit: "mm", better: null, dec: 0, hint: "Nižšie sedlo = istejšie pre nižších jazdcov." },
    { get: M.num.ccm, label: "Objem motora", unit: "cm³", better: null, dec: 0 },
  ];

  function fmt(v, dec) {
    return v.toLocaleString("sk-SK", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  function renderBars(ready) {
    var wins = ready.map(function () { return 0; });
    var categories = 0;

    var html = METRICS.map(function (m) {
      var values = ready.map(function (s) { return m.get(s.bike); });
      var known = values.filter(function (v) { return v != null; });
      if (!known.length) return ""; // tento údaj nemá žiadna motorka

      var max = Math.max.apply(null, known);
      var best = null;
      if (m.better && known.length >= 2) {
        best = m.better === "high" ? max : Math.min.apply(null, known);
        categories++;
        values.forEach(function (v, i) { if (v === best) wins[i]++; });
      }

      var lines = values.map(function (v, i) {
        var color = COLORS[slots.indexOf(ready[i])];
        var isBest = best != null && v === best;
        var width = v != null && max > 0 ? Math.max(3, (v / max) * 100) : 0;
        return '<div class="bar-line' + (isBest ? " best" : "") + '" style="--c:' + color + '">' +
          '<span class="bar-name">' + esc(ready[i].bike.model) + "</span>" +
          '<span class="bar-track"><span class="bar-fill" style="width:' + width + '%"></span></span>' +
          '<span class="bar-value">' + (v != null ? fmt(v, m.dec) + " " + m.unit : "—") + (isBest ? ' <i title="Najlepšia hodnota">★</i>' : "") + "</span>" +
          "</div>";
      }).join("");

      return '<div class="bar-group">' +
        '<div class="bar-title"><b>' + m.label + "</b>" +
        (m.better ? '<span class="muted small">' + (m.better === "high" ? "viac = lepšie" : "menej = lepšie") + "</span>" : "") +
        "</div>" + lines + (m.hint ? '<p class="bar-hint">' + m.hint + "</p>" : "") + "</div>";
    }).join("");

    document.getElementById("bars").innerHTML = html;

    // zhrnutie: ktorá motorka vyhrala najviac kategórií
    var summary = document.getElementById("wins-summary");
    if (categories && ready.length >= 2) {
      var top = Math.max.apply(null, wins);
      var leaders = ready.filter(function (_, i) { return wins[i] === top; }).map(function (s) { return s.bike.model; });
      summary.textContent = leaders.length === 1
        ? leaders[0] + " vyhráva v " + top + " z " + categories + " kategórií."
        : "Remíza: " + leaders.join(" a ") + " (" + top + " z " + categories + ").";
    } else {
      summary.textContent = "";
    }
  }

  // ===========================================================================
  // Tabuľka všetkých parametrov
  // ===========================================================================

  function kgOf(text) { var m = /([\d.]+)\s*kg/i.exec(text || ""); return m ? parseFloat(m[1]) : null; }
  // polia, pri ktorých vieme určiť "lepšiu" hodnotu
  var NUMERIC = {
    power: [M.num.kw, "high"], torque: [M.num.nm, "high"], top_speed: [M.num.kmh, "high"],
    fuel_capacity: [M.num.fuel, "high"],
    dry_weight: [function (b) { return kgOf(b.dry_weight); }, "low"],
    total_weight: [function (b) { return kgOf(b.total_weight); }, "low"],
  };

  function renderTable(ready) {
    var diffOnly = document.getElementById("diff-only").checked;
    var head = "<thead><tr><th></th>" + ready.map(function (s) {
      return '<th style="--c:' + COLORS[slots.indexOf(s)] + '"><span class="th-dot"></span>' + esc(titleOf(s.bike)) +
        '<small>' + esc(s.bike.year || "") + "</small></th>";
    }).join("") + "</tr></thead>";

    function row(label, cells, bestIdx) {
      return "<tr><th>" + esc(label) + "</th>" + cells.map(function (c, i) {
        return '<td class="' + (bestIdx.indexOf(i) !== -1 ? "best" : "") + '">' + (c || '<span class="muted">—</span>') + "</td>";
      }).join("") + "</tr>";
    }

    var body = "";
    // vypočítané riadky navrchu
    var extra = [
      ["Vodičská skupina", ready.map(function (s) { return licenceBadge(s.bike); }), []],
      ["Výkon na kilogram", ready.map(function (s) { var r = M.num.ratio(s.bike); return r ? fmt(r, 3) + " kW/kg" : ""; }), []],
    ];
    body += '<tr class="group"><th colspan="' + (ready.length + 1) + '">Prehľad</th></tr>';
    extra.forEach(function (r) { body += row(r[0], r[1], r[2]); });

    M.GROUPS.forEach(function (group) {
      var rows = "";
      group.fields.forEach(function (f) {
        var raw = ready.map(function (s) { return s.bike[f[0]] || ""; });
        if (raw.every(function (v) { return !v; })) return; // prázdny riadok vynecháme
        var same = raw.every(function (v) { return String(v).toLowerCase() === String(raw[0]).toLowerCase(); });
        if (diffOnly && same) return;

        var bestIdx = [];
        var numeric = NUMERIC[f[0]];
        if (numeric && ready.length >= 2) {
          var vals = ready.map(function (s) { return numeric[0](s.bike); });
          var known = vals.filter(function (v) { return v != null; });
          if (known.length >= 2) {
            var best = numeric[1] === "high" ? Math.max.apply(null, known) : Math.min.apply(null, known);
            vals.forEach(function (v, i) { if (v === best) bestIdx.push(i); });
            if (bestIdx.length === known.length) bestIdx = []; // všetky rovnaké – nezvýrazňovať
          }
        }
        rows += row(f[1], raw.map(function (v) { return v ? esc(M.tr(v)) : ""; }), bestIdx);
      });
      if (rows) body += '<tr class="group"><th colspan="' + (ready.length + 1) + '">' + esc(group.title) + "</th></tr>" + rows;
    });

    document.getElementById("spec-table").innerHTML = head + "<tbody>" + body + "</tbody>";
  }

  document.getElementById("diff-only").addEventListener("change", function () {
    renderTable(readySlots());
  });

  // ===========================================================================
  // Cena a dostupnosť
  // ===========================================================================

  function euro(range) {
    if (!range) return null;
    var f = function (n) { return n.toLocaleString("sk-SK") + " €"; };
    return range[0] === range[1] ? f(range[0]) : f(range[0]) + " – " + f(range[1]);
  }

  var AVAIL = {
    new: ["ok", "Predáva sa nová"],
    used: ["warn", "Iba ojazdená"],
    rare: ["bad", "Ťažko zohnateľná"],
  };

  // Odkazy na inzeráty – vyhľadávanie Google obmedzené na konkrétny portál
  function marketLinks(b) {
    var q = b.make + " " + b.model;
    var sites = [["Bazoš", "moto.bazos.sk"], ["Autobazar.eu", "autobazar.eu"], ["mobile.de", "mobile.de"]];
    return sites.map(function (s) {
      var url = "https://www.google.com/search?q=" + encodeURIComponent(q + " site:" + s[1]);
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + s[0] + " ↗</a>";
    }).join("");
  }

  function renderPrices(ready) {
    // najlacnejšia ojazdená (podľa spodnej hranice odhadu)
    var cheapest = null;
    ready.forEach(function (s) {
      var p = prices[keyOf(s)];
      if (p && p.used_eur && (cheapest == null || p.used_eur[0] < cheapest)) cheapest = p.used_eur[0];
    });

    document.getElementById("prices").innerHTML = ready.map(function (s) {
      var b = s.bike, p = prices[keyOf(s)];
      var a = p && p.availability ? AVAIL[p.availability] : null;
      var isCheapest = p && p.used_eur && ready.length > 1 && p.used_eur[0] === cheapest;
      return '<div class="price-card' + (isCheapest ? " best" : "") + '" style="--c:' + COLORS[slots.indexOf(s)] + '">' +
        '<h3><span class="th-dot"></span>' + esc(titleOf(b)) + " <small>" + esc(b.year || "") + "</small></h3>" +
        '<div class="price-row"><span>Nová</span><b>' + (p ? (euro(p.new_eur) || '<span class="muted">už sa nepredáva</span>') : "—") + "</b></div>" +
        '<div class="price-row"><span>Ojazdená</span><b>' + (p ? (euro(p.used_eur) || "—") : "—") +
        (isCheapest ? ' <i class="cheap-tag">najlacnejšia</i>' : "") + "</b></div>" +
        (a ? '<span class="avail avail-' + a[0] + '">' + a[1] + "</span>" : "") +
        (p && p.note ? '<p class="price-note">' + esc(p.note) + "</p>" : "") +
        '<div class="market-links"><span class="muted small">Inzeráty:</span>' + marketLinks(b) + "</div>" +
        "</div>";
    }).join("");
  }

  // údaje o motorke, ktoré pošleme AI (iba krátke texty – server ich aj tak orezáva)
  function bikesPayload(ready) {
    return ready.map(function (s) {
      var b = s.bike, kg = M.num.kg(b);
      return {
        make: b.make, model: b.model, year: b.year || "", type: M.tr(b.type) || "",
        power: M.shortPower(b.power) || "", displacement: M.shortCcm(b.displacement) || "",
        weight: kg ? Math.round(kg) + " kg" : "",
      };
    });
  }

  var priceBtn = document.getElementById("price-btn");
  if (priceBtn) {
    priceBtn.addEventListener("click", function () {
      var ready = readySlots();
      if (!ready.length) return;
      priceBtn.disabled = true;
      priceBtn.classList.add("loading");
      var original = priceBtn.innerHTML;
      priceBtn.innerHTML = '<span class="ai-orb tiny" aria-hidden="true"></span> MotoAI odhaduje ceny…';

      fetch("/api/compare/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ bikes: bikesPayload(ready) }),
      })
        .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.data.error || "Chyba servera.");
          r.data.prices.forEach(function (p, i) { if (p) prices[keyOf(ready[i])] = p; });
          renderPrices(readySlots());
        })
        .catch(function (err) { alert(err.message); })
        .finally(function () {
          priceBtn.disabled = false;
          priceBtn.classList.remove("loading");
          priceBtn.innerHTML = original;
        });
    });
  }

  // ===========================================================================
  // AI verdikt – odpoveď po kúskoch (rovnaký princíp ako chat na homepage)
  // ===========================================================================

  function formatAnswer(raw) {
    var inline = function (s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); };
    var html = "", inList = false;
    raw.split("\n").forEach(function (line) {
      var t = line.trim(), m;
      if ((m = /^[*-]\s+(.*)/.exec(t))) {
        if (!inList) { html += "<ul>"; inList = true; }
        html += "<li>" + inline(m[1]) + "</li>";
        return;
      }
      if (inList) { html += "</ul>"; inList = false; }
      if ((m = /^#{1,4}\s+(.*)/.exec(t))) html += "<h4>" + inline(m[1]) + "</h4>";
      else if (t) html += "<p>" + inline(t) + "</p>";
    });
    if (inList) html += "</ul>";
    return html;
  }

  var verdictBtn = document.getElementById("verdict-btn");
  var verdictEl = document.getElementById("verdict");
  var verdictCtrl = null; // AbortController – umožní verdikt zastaviť

  if (verdictBtn) {
    verdictBtn.addEventListener("click", function () {
      if (verdictCtrl) { verdictCtrl.abort(); return; } // tlačidlo je "Zastaviť"
      var ready = readySlots();
      if (ready.length < 2) { alert("Na verdikt vyber aspoň dve motorky."); return; }

      var label = verdictBtn.querySelector(".label");
      verdictCtrl = new AbortController();
      verdictBtn.classList.add("stop");
      label.textContent = "Zastaviť";
      verdictEl.hidden = false;
      verdictEl.innerHTML = '<div class="thinking-line"><span class="typing"><span></span><span></span><span></span></span>' +
        '<span class="thinking-text">MotoAI porovnáva motorky…</span></div>';

      var text = "";
      function show(extra) { verdictEl.innerHTML = formatAnswer(text) + (extra || ""); }

      fetch("/api/compare/verdict", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ bikes: bikesPayload(ready), rider: rider }),
        signal: verdictCtrl.signal,
      })
        .then(function (res) {
          var reader = res.body.getReader(), decoder = new TextDecoder("utf-8"), buffer = "";
          function read() {
            return reader.read().then(function (r) {
              if (r.done) return;
              buffer += decoder.decode(r.value, { stream: true });
              var events = buffer.split("\n\n");
              buffer = events.pop();
              events.forEach(function (raw) {
                var line = raw.trim();
                if (line.indexOf("data:") !== 0) return;
                var obj;
                try { obj = JSON.parse(line.slice(5).trim()); } catch (e) { return; }
                if (!obj || typeof obj !== "object") return;
                if (obj.error) { verdictEl.innerHTML = '<p class="err">' + esc(obj.error) + "</p>"; text = ""; return; }
                if (obj.status && !text) verdictEl.querySelector(".thinking-text") && (verdictEl.querySelector(".thinking-text").textContent = obj.status);
                if (obj.text) { text += obj.text; show('<span class="caret"></span>'); }
              });
              return read();
            });
          }
          return read();
        })
        .catch(function (err) {
          if (err.name === "AbortError") { if (text) show('<p class="stopped-note">Verdikt bol zastavený.</p>'); else verdictEl.hidden = true; return; }
          verdictEl.innerHTML = '<p class="err">Nepodarilo sa spojiť so serverom.</p>';
        })
        .finally(function () {
          if (text && !verdictCtrl.signal.aborted) show();
          verdictCtrl = null;
          verdictBtn.classList.remove("stop");
          label.textContent = "Vypýtať znova";
        });
    });
  }

  // ===========================================================================
  // Predvolené porovnania (keď nie je nič vybrané)
  // ===========================================================================

  var PRESETS = [
    { label: "Prvá motorka s A2", bikes: [["Yamaha", "MT-07", "2021"], ["Kawasaki", "Z650", "2021"], ["Honda", "CB650R", "2021"]] },
    { label: "Športové 600-ky", bikes: [["Yamaha", "YZF-R7", "2022"], ["Honda", "CBR650R", "2021"]] },
    { label: "Superbiky", bikes: [["Yamaha", "YZF-R1", "2020"], ["Kawasaki", "Ninja ZX-10R", "2021"]] },
    { label: "Veľké cestovné enduro", bikes: [["BMW", "R 1250 GS", "2021"], ["KTM", "1290 Super Adventure S", "2021"]] },
  ];

  document.getElementById("preset-list").innerHTML = PRESETS.map(function (p, i) {
    return '<button type="button" class="preset" data-preset="' + i + '"><b>' + esc(p.label) + "</b><small>" +
      esc(p.bikes.map(function (b) { return b[0] + " " + b[1]; }).join(" vs. ")) + "</small></button>";
  }).join("");

  document.getElementById("preset-list").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-preset]");
    if (!btn) return;
    slots = PRESETS[+btn.getAttribute("data-preset")].bikes.map(function (b) {
      return { make: b[0], model: b[1], year: b[2], bike: null, status: "loading" };
    });
    saveSelection();
    slots.forEach(loadSlot);
    render();
  });

  // ===========================================================================
  // Vykreslenie celej stránky
  // ===========================================================================

  function readySlots() {
    return slots.filter(function (s) { return s.status === "ok" && s.bike; });
  }

  function render() {
    renderSlots();
    var ready = readySlots();
    presetsEl.hidden = slots.length > 0;
    bodyEl.hidden = ready.length === 0;
    if (!ready.length) return;
    renderBars(ready);
    renderTable(ready);
    renderPrices(ready);
  }

  // štart: načítanie výberu z adresy / localStorage
  slots = loadSelection().map(function (s) { return { make: s.make, model: s.model, year: s.year, bike: null, status: "loading" }; });
  if (slots.length) saveSelection();
  slots.forEach(loadSlot);
  render();
});
