// Spoločné funkcie pre stránky Motorky a Porovnanie

// slovenské názvy parametrov, ktoré vracia API Ninjas
const LABELS = {
  type: "Typ", engine: "Motor", displacement: "Objem", power: "Výkon", torque: "Krútiaci moment",
  top_speed: "Max. rýchlosť", cooling: "Chladenie", gearbox: "Prevodovka", transmission: "Koncový prevod",
  front_brakes: "Predné brzdy", rear_brakes: "Zadné brzdy", front_tire: "Predná pneumatika",
  rear_tire: "Zadná pneumatika", dry_weight: "Suchá hmotnosť", total_weight: "Hmotnosť",
  seat_height: "Výška sedla", wheelbase: "Rázvor", fuel_capacity: "Nádrž",
};

// preklad najčastejších anglických hodnôt
const TRANSLATE = {
  "Sport": "Športová", "Naked bike": "Naked", "Touring": "Cestovná", "Allround": "Univerzálna",
  "Enduro / offroad": "Enduro", "Custom / cruiser": "Cruiser", "Scooter": "Skúter",
  "Liquid": "Kvapalinové", "Air": "Vzduchové", "Chain": "Reťaz", "Belt": "Remeň",
  "Shaft drive (cardan)": "Kardan",
};

function tr(value) {
  return TRANSLATE[value] || value;
}

// vytiahne číslo pred jednotkou, napr. number("73.4 HP (53.6 kW)", "kW") -> 53.6
function number(text, unit) {
  const match = (text || "").match(new RegExp("([\\d.]+)\\s*" + unit));
  return match ? parseFloat(match[1]) : null;
}

// pre ktorú vodičskú skupinu je motorka (podľa výkonu v kW)
function licence(bike) {
  const kw = number(bike.power, "kW");
  if (kw === null) return "?";
  if (kw <= 11) return "A1";
  if (kw <= 35) return "A2";
  if (kw <= 70) return "A2 (obmedzená)";
  return "A";
}

// zoznam značiek – prehliadač ich ponúka pri písaní do poľa "Značka"
const BRANDS = ["Aprilia", "BMW", "Ducati", "Harley-Davidson", "Honda", "Husqvarna", "Indian", "Kawasaki",
  "KTM", "Moto Guzzi", "MV Agusta", "Piaggio", "Royal Enfield", "Suzuki", "Triumph", "Vespa", "Yamaha"];
const brandList = document.getElementById("brands");
if (brandList) brandList.innerHTML = BRANDS.map((b) => `<option value="${b}">`).join("");

async function searchBikes(make, model, year) {
  const params = new URLSearchParams({ make, model, year });
  const res = await fetch("/api/motorky?" + params);
  return res.json();
}
