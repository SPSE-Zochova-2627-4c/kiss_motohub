/*
 * ui.js – drobnosti rozhrania na všetkých stránkach.
 *  - rozbaľovacie menu prihláseného používateľa v navigácii
 *  - automatické skrytie oznámení (flash správ) po pár sekundách
 *  - potvrdenie pred odoslaním formulára s atribútom data-confirm
 */
document.addEventListener("DOMContentLoaded", function () {
  // --- Menu používateľa ---
  var menu = document.getElementById("user-menu");
  var btn = document.getElementById("user-btn");
  if (menu && btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // klik kamkoľvek inam alebo Esc menu zavrie
    document.addEventListener("click", function (e) {
      if (!menu.contains(e.target)) {
        menu.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") menu.classList.remove("open");
    });
  }

  // --- Oznámenia zmiznú po 4,5 sekundy ---
  document.querySelectorAll(".toast").forEach(function (toast, i) {
    setTimeout(function () {
      toast.classList.add("hide");
      setTimeout(function () { toast.remove(); }, 400);
    }, 4500 + i * 400);
  });

  // --- Potvrdenie nebezpečných akcií (odobrať priateľa, zmazať účet...) ---
  // Text otázky je v atribúte data-confirm; textContent/dataset je bezpečné,
  // prehliadač ho nikdy nespustí ako kód.
  document.addEventListener("submit", function (e) {
    var form = e.target;
    var question = form.getAttribute && form.getAttribute("data-confirm");
    if (question && !window.confirm(question)) e.preventDefault();
  });
});
