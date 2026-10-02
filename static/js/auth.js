/*
 * auth.js – pohodlie pri prihlásení a registrácii.
 *
 *  - tlačidlo "Zobraziť" pri hesle
 *  - ukazovateľ sily hesla (slabé / priemerné / silné)
 *  - okamžitá kontrola, či sa heslá zhodujú
 *
 * DÔLEŽITÉ: toto je iba pomôcka pre používateľa. Skutočnú kontrolu robí
 * vždy server (security.py), pretože JavaScript sa v prehliadači dá obísť.
 */
document.addEventListener("DOMContentLoaded", function () {
  // --- Zobraziť / skryť heslo ---
  document.querySelectorAll(".toggle-pass").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = btn.parentElement.querySelector("input");
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Skryť" : "Zobraziť";
      btn.setAttribute("aria-label", show ? "Skryť heslo" : "Zobraziť heslo");
    });
  });

  // Nasledujúce veci existujú iba na stránke registrácie
  var password = document.getElementById("password");
  var password2 = document.getElementById("password2");
  if (!password) return;

  var fill = document.getElementById("strength-fill");
  var label = document.getElementById("strength-label");
  var matchError = document.getElementById("match-error");
  var usernameInput = document.querySelector('input[name="username"]');

  // --- Sila hesla: za každé splnené kritérium 1 bod (0 až 5) ---
  function scorePassword(pw) {
    var score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++; // malé aj veľké písmená
    if (/\d/.test(pw)) score++;                        // číslo
    if (/[^A-Za-z0-9]/.test(pw)) score++;              // špeciálny znak
    return score;
  }

  // Rovnaké minimálne pravidlá ako na serveri (security.validate_password)
  function meetsMinimum(pw) {
    return pw.length >= 8 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
  }

  function updateStrength() {
    var pw = password.value;
    var levels = [
      { text: "Veľmi slabé", cls: "weak" },
      { text: "Slabé", cls: "weak" },
      { text: "Priemerné", cls: "medium" },
      { text: "Dobré", cls: "good" },
      { text: "Silné", cls: "strong" },
      { text: "Veľmi silné", cls: "strong" },
    ];
    if (!pw) {
      fill.style.width = "0";
      fill.className = "";
      label.textContent = "Aspoň 8 znakov, písmeno a číslo";
      return;
    }
    var score = scorePassword(pw);
    var level = levels[score];
    fill.style.width = Math.max(10, (score / 5) * 100) + "%";
    fill.className = level.cls;
    var user = usernameInput ? usernameInput.value.trim().toLowerCase() : "";
    if (user && pw.toLowerCase().indexOf(user) !== -1) {
      label.textContent = "Heslo nesmie obsahovať používateľské meno";
      fill.className = "weak";
    } else {
      label.textContent = meetsMinimum(pw) ? level.text : level.text + " – chýba písmeno, číslo alebo dĺžka 8 znakov";
    }
  }

  // --- Zhoda hesiel ---
  function updateMatch() {
    var mismatch = password2.value && password2.value !== password.value;
    matchError.hidden = !mismatch;
  }

  password.addEventListener("input", function () { updateStrength(); updateMatch(); });
  password2.addEventListener("input", updateMatch);
  if (usernameInput) usernameInput.addEventListener("input", updateStrength);
  updateStrength();
});
