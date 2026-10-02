/*
 * profile.js – interaktivita na stránkach profilu.
 *
 *  - záložky "Uložené / Páči sa mi / Priatelia" (aj cez adresu #ulozene...)
 *  - výber výrezu profilovky a banneru (cropper.js) + náhľad pred nahratím
 *  - počítadlo znakov pri poli "O mne"
 */
document.addEventListener("DOMContentLoaded", function () {
  // ---------------------------------------------------------------------------
  // Záložky
  // ---------------------------------------------------------------------------
  var tabs = document.querySelectorAll("[data-tab]");

  function showTab(name) {
    var pane = document.getElementById("tab-" + name);
    if (!pane) return;
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-tab") === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll(".tab-pane").forEach(function (p) {
      p.classList.toggle("active", p === pane);
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      var name = tab.getAttribute("data-tab");
      showTab(name);
      history.replaceState(null, "", "#" + name); // adresa sa dá zdieľať
    });
  });

  // štatistiky v hlavičke (Priatelia 3, Uložené 5...) prepnú záložku
  document.querySelectorAll("[data-tab-link]").forEach(function (link) {
    link.addEventListener("click", function () {
      showTab(link.getAttribute("data-tab-link"));
      var panel = document.querySelector(".tabs-panel");
      if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  // otvorenie správnej záložky podľa adresy, napr. /profil/jano#oblubene
  if (location.hash) showTab(location.hash.slice(1));

  // ---------------------------------------------------------------------------
  // Výber výrezu fotky (profilovka aj banner) – formuláre s atribútom data-crop-form
  // ---------------------------------------------------------------------------
  document.querySelectorAll("[data-crop-form]").forEach(function (form) {
    var fileInput = form.querySelector('input[type="file"]');
    var submit = form.querySelector('button[type="submit"]');
    var recrop = form.querySelector(".recrop");
    var label = fileInput.parentElement.querySelector("span");
    var preview = document.querySelector(form.getAttribute("data-preview"));
    var aspect = parseFloat(form.getAttribute("data-aspect")) || 1;
    var round = form.hasAttribute("data-round");
    var lastState = null; // posledný výrez – pri "Upraviť výrez" pokračujeme od neho

    function setCrop(r) {
      // podiely 0–1 zapíšeme do skrytých polí -> server (uploads.parse_crop)
      ["x", "y", "w", "h"].forEach(function (k) {
        form.querySelector('input[name="crop_' + k + '"]').value = r[k].toFixed(6);
      });
    }

    function showPreview(dataUrl) {
      if (!preview) return;
      if (round) {
        // profilovka: kruhový obrázok
        var img = document.createElement("img");
        img.className = "avatar-img";
        img.alt = "Náhľad novej profilovky";
        img.src = dataUrl;
        img.style.width = img.style.height = "140px";
        preview.innerHTML = "";
        preview.appendChild(img);
      } else {
        // banner: obrázok ako pozadie náhľadu
        preview.style.backgroundImage = "url('" + dataUrl + "')";
        preview.classList.add("has-image");
      }
    }

    function openCropper() {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      window.Cropper.open(file, { aspect: aspect, round: round, title: form.getAttribute("data-title"), state: lastState })
        .then(function (result) {
          lastState = result.state;
          setCrop(result);
          showPreview(result.preview);
          submit.disabled = false;
          recrop.hidden = false;
          label.textContent = file.name;
        })
        .catch(function (err) {
          if (lastState) return; // zrušená úprava – ponecháme predchádzajúci výrez
          if (err && err.message !== "cancel") alert(err.message);
          fileInput.value = ""; // zrušené hneď na začiatku – nič nevybrané
        });
    }

    fileInput.addEventListener("change", function () {
      lastState = null;
      submit.disabled = true;
      openCropper();
    });
    recrop.addEventListener("click", openCropper);
  });

  // ---------------------------------------------------------------------------
  // Počítadlo znakov
  // ---------------------------------------------------------------------------
  document.querySelectorAll("[data-counter-for]").forEach(function (counter) {
    var field = document.getElementById(counter.getAttribute("data-counter-for"));
    if (!field) return;
    function update() {
      counter.textContent = field.value.length + " / " + field.maxLength;
    }
    field.addEventListener("input", update);
    update();
  });
});
