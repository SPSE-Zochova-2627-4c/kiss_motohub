// Stránka Databáza motoriek – vyhľadávanie, karty, detail, páči sa mi / uložiť
const results = document.getElementById("results");
const loggedIn = results.dataset.logged === "1";
let bikes = [];
let marks = [];   // moje označené motorky zo servera

function isMarked(kind, b) {
  return marks.some((m) => m.kind === kind && m.make === b.make && m.model === b.model && m.year == b.year);
}

function card(b, i) {
  return `
    <div class="panel bike-card" onclick="openDetail(${i})">
      <div class="marks">
        <button class="${isMarked("like", b) ? "on" : ""}" onclick="toggle(event, 'like', ${i})">♥</button>
        <button class="${isMarked("save", b) ? "on" : ""}" onclick="toggle(event, 'save', ${i})">🔖</button>
      </div>
      <h3>${b.make} ${b.model} <small>${b.year}</small></h3>
      <p>${tr(b.type) || ""}</p>
      <p><span class="muted">Výkon:</span> ${b.power || "—"}</p>
      <p><span class="muted">Objem:</span> ${b.displacement || "—"}</p>
      <p><span class="muted">Vodičák:</span> ${licence(b)}</p>
    </div>`;
}

function render() {
  results.innerHTML = bikes.length
    ? `<div class="grid">${bikes.map(card).join("")}</div>`
    : '<p class="muted">Nič sa nenašlo.</p>';
}

function openDetail(i) {
  const b = bikes[i];
  let rows = "";
  for (const key in LABELS) {
    if (b[key]) rows += `<tr><td class="muted">${LABELS[key]}</td><td>${tr(b[key])}</td></tr>`;
  }
  document.getElementById("modal-body").innerHTML = `
    <h2>${b.make} ${b.model} (${b.year})</h2>
    <p>Vhodná pre skupinu: <b>${licence(b)}</b></p>
    <table>${rows}</table>`;
  document.getElementById("modal").classList.add("open");
}

// páči sa mi / uložiť
async function toggle(event, kind, i) {
  event.stopPropagation(); // aby sa neotvoril detail
  if (!loggedIn) return (location.href = "/prihlasenie");
  const b = bikes[i];
  const res = await fetch("/api/ulozene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, make: b.make, model: b.model, year: b.year }),
  });
  marks = await res.json();
  render();
}

async function search(make, model, year) {
  results.innerHTML = '<p class="muted">Hľadám…</p>';
  bikes = await searchBikes(make, model, year);
  if (loggedIn) marks = await (await fetch("/api/ulozene")).json();
  render();
}

const form = document.getElementById("search");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!form.make.value && !form.model.value) return;   // treba zadať aspoň značku alebo model
  search(form.make.value, form.model.value, form.year.value);
});

// odkaz z profilu: /motorky?make=Yamaha&model=R1
const url = new URLSearchParams(location.search);
if (url.get("make")) {
  form.make.value = url.get("make");
  form.model.value = url.get("model") || "";
  search(form.make.value, form.model.value, "");
}
