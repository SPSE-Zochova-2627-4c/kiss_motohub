/*
 * moto-common.js – spoločné veci pre stránky s motorkami
 * (databáza motoriek aj porovnanie).
 *
 *  MotoCommon.GROUPS      ... slovenské názvy parametrov z API Ninjas v skupinách
 *  MotoCommon.tr(v)       ... preklad anglických hodnôt ("Liquid" -> "Kvapalinové")
 *  MotoCommon.num.*       ... vytiahnutie čísla z textu API ("200.0 HP (146.0 kW)" -> 146)
 *  MotoCommon.licence(b)  ... orientačná vhodnosť pre vodičské skupiny A1 / A2 / A
 */
(function () {
// Slovenské názvy polí z API Ninjas, rozdelené do prehľadných skupín
var GROUPS = [
  { title: "Motor", fields: [
    ["engine", "Typ motora"], ["displacement", "Zdvihový objem"], ["bore_stroke", "Vŕtanie × zdvih"],
    ["compression", "Kompresný pomer"], ["valves_per_cylinder", "Ventily na valec"],
    ["fuel_system", "Palivový systém"], ["fuel_control", "Riadenie ventilov"], ["ignition", "Zapaľovanie"],
    ["lubrication", "Mazanie"], ["cooling", "Chladenie"], ["starter", "Štartér"]
  ]},
  { title: "Výkon", fields: [
    ["power", "Výkon"], ["torque", "Krútiaci moment"], ["top_speed", "Maximálna rýchlosť"]
  ]},
  { title: "Prevodovka", fields: [
    ["gearbox", "Počet stupňov"], ["transmission", "Koncový prevod"], ["clutch", "Spojka"]
  ]},
  { title: "Podvozok", fields: [
    ["frame", "Rám"], ["front_suspension", "Predné odpruženie"], ["front_wheel_travel", "Zdvih predného kolesa"],
    ["rear_suspension", "Zadné odpruženie"], ["rear_wheel_travel", "Zdvih zadného kolesa"]
  ]},
  { title: "Brzdy a pneumatiky", fields: [
    ["front_brakes", "Predné brzdy"], ["rear_brakes", "Zadné brzdy"],
    ["front_tire", "Predná pneumatika"], ["rear_tire", "Zadná pneumatika"]
  ]},
  { title: "Rozmery a hmotnosť", fields: [
    ["dry_weight", "Suchá hmotnosť"], ["total_weight", "Pohotovostná hmotnosť"], ["seat_height", "Výška sedla"],
    ["wheelbase", "Rázvor"], ["ground_clearance", "Svetlá výška"], ["total_length", "Celková dĺžka"],
    ["total_width", "Celková šírka"], ["total_height", "Celková výška"], ["fuel_capacity", "Objem nádrže"]
  ]}
];

// Preklad najčastejších hodnôt, ktoré API vracia po anglicky
var VALUE_SK = {
  "sport": "Športová", "naked bike": "Naked", "touring": "Cestovná", "sport touring": "Športovo-cestovná",
  "custom / cruiser": "Cruiser", "enduro / offroad": "Enduro / terénna", "allround": "Univerzálna",
  "scooter": "Skúter", "classic": "Klasická", "super motard": "Supermoto", "trial": "Trial",
  "cross / motocross": "Motokros", "minibike, sport": "Minibike", "prototype / concept model": "Prototyp",
  "atv": "Štvorkolka", "unspecified category": "Nešpecifikovaná",
  "liquid": "Kvapalinové", "air": "Vzduchové", "oil & air": "Olejovo-vzduchové",
  "electric": "Elektrický", "electric & kick": "Elektrický a nožný", "kick": "Nožný",
  "chain": "Reťaz", "shaft drive (cardan)": "Kardan", "belt": "Remeň",
  "injection": "Vstrekovanie", "carburettor": "Karburátor", "carburetor": "Karburátor",
  "wet sump": "Mokrá kľuková skriňa", "dry sump": "Suchá kľuková skriňa"
};

function tr(value) {
  if (!value) return value;
  var key = String(value).trim().toLowerCase();
  if (VALUE_SK[key]) return VALUE_SK[key];
  if (/^\d+-speed$/.test(key)) return key.replace("-speed", " stupňov");
  return value;
}

function escapeHtml(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


// Krátke, čitateľné verzie hlavných údajov pre horné dlaždice
function shortPower(v) {
  if (!v) return "";
  var kw = /([\d.]+)\s*kW/i.exec(v), hp = /([\d.]+)\s*HP/i.exec(v);
  var parts = [];
  if (kw) parts.push(Math.round(parseFloat(kw[1])) + " kW");
  if (hp) parts.push(Math.round(parseFloat(hp[1])) + " k");
  return parts.join(" / ") || v;
}
function shortCcm(v) {
  var m = /([\d.]+)\s*ccm/i.exec(v || "");
  return m ? Math.round(parseFloat(m[1])) + " cm³" : v;
}


// ---------------------------------------------------------------------------
// Čísla z textov API. API vracia napr. "200.0 HP (146.0 kW)  @ 13500 RPM",
// preto číslo hľadáme regulárnym výrazom podľa jednotky.
// ---------------------------------------------------------------------------
function grab(text, re) {
  var m = re.exec(text || "");
  return m ? parseFloat(m[1]) : null;
}
var num = {
  // výkon v kW (ak API uvádza iba koňe, prepočítame: 1 HP = 0,7457 kW)
  kw: function (b) {
    var kw = grab(b.power, /([\d.]+)\s*kW/i);
    if (kw != null) return kw;
    var hp = grab(b.power, /([\d.]+)\s*HP/i);
    return hp != null ? Math.round(hp * 0.7457 * 10) / 10 : null;
  },
  hp: function (b) {
    var hp = grab(b.power, /([\d.]+)\s*HP/i);
    if (hp != null) return hp;
    var kw = grab(b.power, /([\d.]+)\s*kW/i);
    return kw != null ? Math.round(kw / 0.7457) : null;
  },
  nm: function (b) { return grab(b.torque, /([\d.]+)\s*Nm/i); },
  ccm: function (b) { return grab(b.displacement, /([\d.]+)\s*ccm/i); },
  // hmotnosť: prednostne pohotovostná (s tekutinami), inak suchá
  kg: function (b) { return grab(b.total_weight, /([\d.]+)\s*kg/i) || grab(b.dry_weight, /([\d.]+)\s*kg/i); },
  kmh: function (b) { return grab(b.top_speed, /([\d.]+)\s*km\/h/i); },
  seat: function (b) { return grab(b.seat_height, /([\d.]+)\s*mm/i); },
  fuel: function (b) { return grab(b.fuel_capacity, /([\d.]+)\s*lit/i); },
  // pomer výkon / hmotnosť v kW/kg – dôležitý pre skupinu A2 (max. 0,2)
  ratio: function (b) {
    var kw = num.kw(b), kg = num.kg(b);
    return kw && kg ? Math.round((kw / kg) * 1000) / 1000 : null;
  },
};

// ---------------------------------------------------------------------------
// Vodičské oprávnenie (orientačne, podľa pravidiel EÚ):
//   A1: do 125 cm³ a 11 kW
//   A2: do 35 kW a pomer max. 0,2 kW/kg; motorku do 70 kW možno obmedziť na 35 kW
//   A : bez obmedzenia
// ---------------------------------------------------------------------------
function licence(b) {
  var kw = num.kw(b), ccm = num.ccm(b), ratio = num.ratio(b);
  if (kw == null) return { key: "unknown", label: "Neznáme", note: "API neuvádza výkon." };
  if (kw <= 11 && ccm != null && ccm <= 125) return { key: "a1", label: "A1", note: "Do 125 cm³ a 11 kW." };
  if (kw <= 35 && (ratio == null || ratio <= 0.2)) return { key: "a2", label: "A2", note: "Spĺňa limit 35 kW." };
  if (kw <= 70) return { key: "a2r", label: "A2 s obmedzením", note: "Dá sa obmedziť na 35 kW (pôvodne do 70 kW)." };
  return { key: "a", label: "Iba A", note: "Výkon nad 70 kW – nedá sa obmedziť pre A2." };
}

window.MotoCommon = {
  GROUPS: GROUPS,
  VALUE_SK: VALUE_SK,
  tr: tr,
  escapeHtml: escapeHtml,
  shortPower: shortPower,
  shortCcm: shortCcm,
  num: num,
  licence: licence,
};
})();
