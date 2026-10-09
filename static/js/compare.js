// Stránka Porovnanie – 2 až 4 motorky, grafy, tabuľka a AI (ceny, verdikt)
const COLORS = ["#b98cff", "#ff6fb5", "#45d4ff", "#ffc24a"];
let chosen = JSON.parse(localStorage.getItem("compare") || "[]");  // výber si pamätáme

// parametre do grafov: [názov, funkcia na číslo, jednotka]
const METRICS = [
  ["Výkon", (b) => number(b.power, "kW"), "kW"],
  ["Krútiaci moment", (b) => number(b.torque, "Nm"), "Nm"],
  ["Hmotnosť", (b) => number(b.total_weight || b.dry_weight, "kg"), "kg"],
  ["Max. rýchlosť", (b) => number(b.top_speed, "km/h"), "km/h"],
  ["Nádrž", (b) => number(b.fuel_capacity, "lit"), "l"],
];

function name(b) {
  return `${b.make} ${b.model} ${b.year}`;
}

function render() {
  localStorage.setItem("compare", JSON.stringify(chosen));

  document.getElementById("slots").innerHTML = chosen.map((b, i) => `
    <div class="panel slot" style="border-top: 4px solid ${COLORS[i]}">
      <button class="x" onclick="removeBike(${i})">✕</button>
      <h3>${b.make} ${b.model}</h3>
      <p class="muted">${b.year} · ${tr(b.type)}</p>
      <p>Vodičák: <b>${licence(b)}</b></p>
    </div>`).join("");

  document.getElementById("compare").hidden = chosen.length < 2;
  if (chosen.length < 2) return;

  // grafy – dĺžka pásika = hodnota / najväčšia hodnota
  let bars = "";
  for (const [label, get, unit] of METRICS) {
    const values = chosen.map(get);
    const max = Math.max(...values.filter((v) => v));
    bars += `<h3>${label}</h3>`;
    chosen.forEach((b, i) => {
      const v = values[i];
      bars += `<div class="bar"><span>${b.model}</span>
        <div class="track"><div style="width:${v ? (v / max) * 100 : 0}%; background:${COLORS[i]}"></div></div>
        <b>${v ? v + " " + unit : "—"}</b></div>`;
    });
  }
  document.getElementById("bars").innerHTML = bars;

  // tabuľka všetkých parametrov
  let table = "<tr><th></th>" + chosen.map((b) => `<th>${b.make} ${b.model}</th>`).join("") + "</tr>";
  for (const key in LABELS) {
    table += `<tr><td class="muted">${LABELS[key]}</td>` + chosen.map((b) => `<td>${tr(b[key]) || "—"}</td>`).join("") + "</tr>";
  }
  document.getElementById("table").innerHTML = table;
}

function removeBike(i) {
  chosen.splice(i, 1);
  render();
}

// ---- pridávanie motoriek ----
const form = document.getElementById("add");
const suggestions = document.getElementById("suggestions");
let found = [];   // posledné výsledky hľadania
let timer;

function addBike(i) {
  if (chosen.length >= 4) return alert("Najviac 4 motorky.");
  chosen.push(found[i]);
  form.reset();
  suggestions.innerHTML = "";
  render();
}

// počas písania ukazujeme návrhy – hľadáme až keď používateľ na chvíľu prestane písať
form.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (form.model.value.length < 2) return (suggestions.innerHTML = "");
    found = await searchBikes(form.make.value, form.model.value, form.year.value);
    suggestions.innerHTML = found.slice(0, 8)
      .map((b, i) => `<button type="button" onclick="addBike(${i})">+ ${name(b)}</button>`).join("");
  }, 400);
});

// Enter / tlačidlo Pridať = pridá prvú nájdenú motorku
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  found = await searchBikes(form.make.value, form.model.value, form.year.value);
  if (!found.length) return alert("Motorka sa nenašla.");
  addBike(0);
});

// ---- AI: ceny a verdikt ----
const aiText = document.getElementById("ai-text");

async function showStream(url) {
  aiText.textContent = "MotoAI premýšľa…";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bikes: chosen.map(name) }),
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    aiText.innerHTML = text.replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
  }
}

const pricesBtn = document.getElementById("prices-btn");
if (pricesBtn) {
  pricesBtn.onclick = async () => {
    aiText.textContent = "MotoAI odhaduje ceny…";
    const res = await fetch("/api/ceny", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bikes: chosen.map(name) }),
    });
    aiText.innerText = (await res.json()).text;
  };
  document.getElementById("verdict-btn").onclick = () => showStream("/api/verdikt");
}

render();
