// Trasy – kreslenie a zobrazenie trás na mape (createMap je v map.js)
const map = createMap();

const COLOR = "#8a3dff";

// cesta po skutočných cestách cez zadané body (bezplatná služba OSRM)
async function road(points) {
  try {
    const coords = points.map((p) => `${p[1]},${p[0]}`).join(";");   // OSRM chce [lng, lat]
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const data = await (await fetch(url)).json();
    return data.routes[0].geometry.coordinates.map((c) => [c[1], c[0]]);
  } catch {
    return points;  // keď služba nefunguje, spojíme body rovnými čiarami
  }
}

// ---------- zoznam trás: mapa sa ukáže až po kliknutí ----------
const showBtn = document.getElementById("show-map");
if (showBtn) {
  const box = document.getElementById("map");
  const lines = L.featureGroup().addTo(map);   // trasy od jazdcov

  function showMap(bounds) {
    box.hidden = false;
    showBtn.textContent = "Skryť mapu";
    map.invalidateSize();   // mapa bola skrytá, musí si prepočítať svoju veľkosť
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
  }

  document.querySelectorAll(".route-card:not(.tip)").forEach((card) => {
    const line = L.polyline(JSON.parse(card.dataset.points), { color: COLOR, weight: 4 }).addTo(lines);
    line.bindTooltip(card.querySelector("h3").innerHTML);   // ošetrený názov z Jinja
    line.on("click", () => (location.href = card.href));
  });

  showBtn.addEventListener("click", () => {
    if (box.hidden) return showMap(lines.getBounds());
    box.hidden = true;
    showBtn.textContent = "🗺️ Zobraziť mapu";
  });

  // odporúčaná trasa – prvýkrát ju dokreslíme po cestách, potom ju len ukážeme
  document.querySelectorAll(".tip button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest(".tip");
      if (!card.line) {
        card.line = L.polyline(await road(JSON.parse(card.dataset.points)), { color: COLOR, weight: 5 }).addTo(map);
        card.line.bindTooltip(card.querySelector("h3").innerHTML);
      }
      showMap(card.line.getBounds());
      box.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

// ---------- detail trasy ----------
const detail = document.getElementById("map").dataset.points;
if (detail) {
  const points = JSON.parse(detail);
  const line = L.polyline(points, { color: COLOR, weight: 5 }).addTo(map);
  L.circleMarker(points[0], { color: "#5ee0a0" }).addTo(map).bindTooltip("Štart");
  L.circleMarker(points[points.length - 1], { color: "#ff6fb5" }).addTo(map).bindTooltip("Cieľ");
  map.fitBounds(line.getBounds(), { padding: [30, 30] });
}

// ---------- nová trasa: kreslenie klikaním ----------
const form = document.getElementById("route-form");
if (form) {
  let points = [];       // všetky body čiary
  let segments = [];     // koľko bodov pridal každý klik (kvôli tlačidlu Späť)
  let markers = [];
  const line = L.polyline([], { color: COLOR, weight: 5 }).addTo(map);

  function update() {
    line.setLatLngs(points);
    // dĺžka = súčet vzdialeností medzi susednými bodmi
    let meters = 0;
    for (let i = 1; i < points.length; i++) meters += map.distance(points[i - 1], points[i]);
    const km = (meters / 1000).toFixed(1);
    document.getElementById("length").textContent = km;
    document.getElementById("length-input").value = km;
    document.getElementById("points").value = JSON.stringify(points);
  }

  map.on("click", async (e) => {
    const clicked = [e.latlng.lat, e.latlng.lng];
    markers.push(L.circleMarker(clicked, { color: "#fff", radius: 5 }).addTo(map));
    const added = points.length ? (await road([points[points.length - 1], clicked])).slice(1) : [clicked];
    points.push(...added);
    segments.push(added.length);
    update();
  });

  document.getElementById("undo").addEventListener("click", () => {
    if (!segments.length) return;
    points.splice(points.length - segments.pop());
    map.removeLayer(markers.pop());
    update();
  });
}
