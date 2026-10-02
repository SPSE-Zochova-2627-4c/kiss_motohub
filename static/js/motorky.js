/*
 * motorky.js – stránka Databáza motoriek.
 *
 *  1. Formulár (značka / model / rok) pošle požiadavku na náš server:
 *     GET /api/motorcycles?make=...&model=...&year=...
 *     (server sa potom opýta API Ninjas – API kľúč tak zostane tajný)
 *  2. Výsledky vykreslíme ako karty.
 *  3. Klik na kartu otvorí okno (modal) so všetkými parametrami po slovensky.
 *  4. Srdiečko (páči sa mi) a záložka (uložiť) – iba pre prihlásených,
 *     ukladá sa cez POST /api/bikes/mark a zobrazí sa na profile.
 *  5. Adresa /motorky?make=..&model=..&year=..&open=1 (odkaz z profilu)
 *     motorku rovno vyhľadá a otvorí jej detail.
 *  6. Tlačidlo "Porovnať" v detaile pridá motorku do porovnania
 *     (zoznam v localStorage, ten istý číta stránka /porovnanie).
 */
document.addEventListener("DOMContentLoaded", function () {
  var form = document.getElementById("search-form");
  var results = document.getElementById("results");
  var modal = document.getElementById("modal");
  var modalBody = document.getElementById("modal-body");
  var modalClose = document.getElementById("modal-close");

  // Je používateľ prihlásený? (data-logged-in nastavuje šablóna motorky.html)
  var loggedIn = results.getAttribute("data-logged-in") === "1";
  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrfMeta ? csrfMeta.getAttribute("content") : "";
  // Označené motorky, kľúč napr. "like|yamaha|yzf-r1|2020" -> true
  var marks = {};
  var currentBikes = [];

  // Spoločné veci (preklady, skupiny parametrov...) sú v moto-common.js
  var GROUPS = MotoCommon.GROUPS;
  var tr = MotoCommon.tr;
  var escapeHtml = MotoCommon.escapeHtml;
  var shortPower = MotoCommon.shortPower;
  var shortCcm = MotoCommon.shortCcm;

  function titleOf(bike) {
    return [bike.make, bike.model].filter(Boolean).join(" ") || "Neznáma motorka";
  }

  function specRow(label, value) {
    if (!value) return "";
    return '<div class="spec"><span>' + escapeHtml(label) + "</span><b>" + escapeHtml(tr(value)) + "</b></div>";
  }

  // ---------------------------------------------------------------------------
  // Páči sa mi / Uložiť
  // ---------------------------------------------------------------------------

  function markKey(kind, bike) {
    return [kind, bike.make, bike.model, bike.year || ""].join("|").toLowerCase();
  }

  var ICON_SAVE = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>';
  var ICON_LIKE = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.6 3.6 4 7.2 4c2 0 3.4 1.1 4.8 2.8C13.4 5.1 14.8 4 16.8 4c3.6 0 5.8 3.6 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4Z"/></svg>';

  // Dve tlačidlá pri motorke; data-index hovorí, o ktorú motorku v zozname ide
  function markButtons(bike, index) {
    function btn(kind, icon, label) {
      var on = !!marks[markKey(kind, bike)];
      return '<button type="button" class="mark-btn ' + kind + (on ? " on" : "") + '" data-kind="' + kind +
        '" data-index="' + index + '" aria-pressed="' + on + '" title="' + label + '" aria-label="' + label + '">' + icon + "</button>";
    }
    return '<div class="mark-btns">' + btn("like", ICON_LIKE, "Páči sa mi") + btn("save", ICON_SAVE, "Uložiť do profilu") + "</div>";
  }

  // Načítanie mojich označení zo servera (iba pre prihláseného)
  function loadMarks() {
    if (!loggedIn) return Promise.resolve();
    return fetch("/api/bikes/marks")
      .then(function (res) { return res.ok ? res.json() : { marks: [] }; })
      .then(function (data) {
        marks = {};
        (data.marks || []).forEach(function (m) { marks[markKey(m.kind, m)] = true; });
      })
      .catch(function () {});
  }

  // Prepnutie srdiečka / záložky
  function toggleMark(kind, index) {
    if (!loggedIn) {
      // neprihlásený -> prihlásenie a potom späť na túto stránku
      location.href = "/prihlasenie?next=" + encodeURIComponent(location.pathname + location.search);
      return;
    }
    var bike = currentBikes[index];
    var key = markKey(kind, bike);
    var newState = !marks[key];
    setMarkUI(kind, index, newState); // hneď prepneme (rýchla odozva), server potvrdí

    fetch("/api/bikes/mark", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ kind: kind, make: bike.make, model: bike.model, year: bike.year || "" }),
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.data.error || "Chyba");
        setMarkUI(kind, index, r.data.active);
      })
      .catch(function () {
        setMarkUI(kind, index, !newState); // vrátiť späť, ak server zlyhal
        alert("Nepodarilo sa uložiť. Skús to znova.");
      });
  }

  // Zmení vzhľad všetkých tlačidiel tejto motorky (karta aj detail)
  function setMarkUI(kind, index, on) {
    marks[markKey(kind, currentBikes[index])] = on;
    document.querySelectorAll('.mark-btn[data-kind="' + kind + '"][data-index="' + index + '"]').forEach(function (b) {
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      if (on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
    });
  }

  // Klik na srdiečko/záložku kdekoľvek (karta aj detail) – nesmie otvoriť detail
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".mark-btn");
    if (!b) return;
    e.stopPropagation();
    toggleMark(b.getAttribute("data-kind"), +b.getAttribute("data-index"));
  }, true);

  function renderCard(bike, index) {
    return (
      '<div class="moto-card" tabindex="0" role="button" data-index="' + index + '">' +
      markButtons(bike, index) +
      "<h3>" + escapeHtml(titleOf(bike)) + (bike.year ? " <span>" + escapeHtml(bike.year) + "</span>" : "") + "</h3>" +
      '<div class="specs">' +
      specRow("Typ", bike.type) +
      specRow("Objem", shortCcm(bike.displacement)) +
      specRow("Výkon", shortPower(bike.power)) +
      specRow("Hmotnosť", bike.dry_weight || bike.total_weight) +
      "</div>" +
      '<div class="more">Zobraziť všetky parametre →</div>' +
      "</div>"
    );
  }

  function keyStat(label, value) {
    return '<div class="key-stat"><span>' + escapeHtml(label) + "</span><b>" +
      escapeHtml(value ? tr(value) : "—") + "</b></div>";
  }

  // ---------------------------------------------------------------------------
  // Pridanie do porovnania (localStorage "motohub.compare", max. 4 motorky)
  // ---------------------------------------------------------------------------
  var COMPARE_KEY = "motohub.compare";
  function compareList() {
    try { return JSON.parse(localStorage.getItem(COMPARE_KEY)) || []; } catch (e) { return []; }
  }
  function sameBike(a, b) {
    return [a.make, a.model, a.year || ""].join("|").toLowerCase() === [b.make, b.model, b.year || ""].join("|").toLowerCase();
  }
  function addToCompare(bike, btn) {
    var list = compareList();
    var item = { make: bike.make, model: bike.model, year: String(bike.year || "") };
    if (!list.some(function (x) { return sameBike(x, item); })) {
      if (list.length >= 4) { alert("V porovnaní môžu byť najviac 4 motorky."); return; }
      list.push(item);
      try { localStorage.setItem(COMPARE_KEY, JSON.stringify(list)); } catch (e) { /* ignorovať */ }
    }
    btn.textContent = "✓ V porovnaní";
    btn.disabled = true;
    updateTray();
  }
  // plávajúci odkaz vľavo dole "Porovnanie (2) →"
  var tray = document.createElement("a");
  tray.className = "compare-tray";
  tray.href = "/porovnanie";
  document.body.appendChild(tray);
  function updateTray() {
    var n = compareList().length;
    tray.hidden = n === 0;
    tray.innerHTML = '<span class="tray-count">' + n + "</span> Porovnanie →";
  }
  updateTray();

  function openModal(index) {
    var bike = currentBikes[index];
    var inCompare = compareList().some(function (x) { return sameBike(x, bike); });
    var html =
      '<div class="modal-marks">' + markButtons(bike, index) +
      '<button type="button" class="btn-ghost btn-sm compare-add" data-index="' + index + '"' + (inCompare ? " disabled" : "") + ">" +
      (inCompare ? "✓ V porovnaní" : "⇄ Porovnať") + "</button></div>" +
      '<h2 id="modal-title">' + escapeHtml(titleOf(bike)) + "</h2>" +
      '<p class="sub">' + escapeHtml([bike.year, tr(bike.type)].filter(Boolean).join(", ")) + "</p>" +
      '<div class="key-stats">' +
      keyStat("Výkon", shortPower(bike.power)) +
      keyStat("Objem", shortCcm(bike.displacement)) +
      keyStat("Hmotnosť", bike.dry_weight || bike.total_weight) +
      keyStat("Výška sedla", bike.seat_height) +
      "</div>";

    GROUPS.forEach(function (group) {
      var rows = group.fields.map(function (f) { return specRow(f[1], bike[f[0]]); }).join("");
      if (rows) html += '<div class="spec-group"><h4>' + group.title + '</h4><div class="specs">' + rows + "</div></div>";
    });

    modalBody.innerHTML = html;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    modalClose.focus();
  }

  function closeModal() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  modalBody.addEventListener("click", function (e) {
    var btn = e.target.closest(".compare-add");
    if (btn && !btn.disabled) addToCompare(currentBikes[+btn.getAttribute("data-index")], btn);
  });

  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  results.addEventListener("click", function (e) {
    var card = e.target.closest(".moto-card");
    if (card) openModal(+card.dataset.index);
  });
  results.addEventListener("keydown", function (e) {
    var card = e.target.closest(".moto-card");
    if (card && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openModal(+card.dataset.index);
    }
  });

  function setState(html, cls) {
    results.innerHTML = '<div class="empty-state ' + (cls || "") + '">' + html + "</div>";
  }

  // ---------------------------------------------------------------------------
  // Vyhľadávanie
  // ---------------------------------------------------------------------------

  // openMatch = {model, year} -> po načítaní rovno otvoriť detail tejto motorky
  function runSearch(make, model, year, openMatch) {
    if (!make) { setState("<p>Zadaj aspoň značku motorky.</p>", "err"); return; }

    var params = new URLSearchParams({ make: make });
    if (model) params.set("model", model);
    if (year) params.set("year", year);

    setState('<div class="spinner"></div><p>Hľadám motorky…</p>');

    // výsledky aj moje označenia načítame naraz (Promise.all)
    Promise.all([
      fetch("/api/motorcycles?" + params.toString()).then(function (res) { return res.json(); }),
      loadMarks(),
    ])
      .then(function (both) {
        var data = both[0];
        if (data.error) { setState("<p>" + escapeHtml(data.error) + "</p>", "err"); return; }
        if (!Array.isArray(data) || !data.length) {
          setState("<p>Nič sa nenašlo. Skús iný model alebo nechaj rok prázdny.</p>");
          return;
        }
        currentBikes = data;
        results.innerHTML =
          '<p class="result-count">Nájdené: ' + data.length + "</p>" +
          '<div class="moto-grid">' + data.map(renderCard).join("") + "</div>";

        if (openMatch) {
          var want = (openMatch.model || "").toLowerCase();
          var idx = data.findIndex(function (b) {
            return (b.model || "").toLowerCase() === want && (!openMatch.year || String(b.year) === String(openMatch.year));
          });
          openModal(idx >= 0 ? idx : 0);
        }
      })
      .catch(function () { setState("<p>Nepodarilo sa spojiť so serverom.</p>", "err"); });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    runSearch(
      document.getElementById("f-make").value.trim(),
      document.getElementById("f-model").value.trim(),
      document.getElementById("f-year").value.trim()
    );
  });

  // Odkaz z profilu: /motorky?make=Yamaha&model=YZF-R1&year=2020&open=1
  var url = new URLSearchParams(location.search);
  if (url.get("make")) {
    document.getElementById("f-make").value = url.get("make");
    document.getElementById("f-model").value = url.get("model") || "";
    document.getElementById("f-year").value = url.get("year") || "";
    runSearch(url.get("make"), url.get("model") || "", url.get("year") || "",
      url.get("open") ? { model: url.get("model"), year: url.get("year") } : null);
  }
});
