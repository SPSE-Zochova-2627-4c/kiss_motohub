// Lokácie – špendlíky na mape, filtre, hľadanie, vzdialenosť a pridávanie miesta
const map = createMap();

// špendlík s ikonkou kategórie (namiesto obrázka použijeme emoji v krúžku)
function pin(icon) {
  return L.divIcon({ className: "pin", html: icon, iconSize: [36, 36] });
}

// ---------- zoznam lokácií (aj odporúčané miesta) ----------
const cards = [...document.querySelectorAll(".place-card")];
const showBtn = document.getElementById("show-map");
if (showBtn) {
  // každej karte vytvoríme špendlík na mape
  cards.forEach((card) => {
    card.marker = L.marker([card.dataset.lat, card.dataset.lng], { icon: pin(card.dataset.icon) })
      // nadpis karty už bezpečne ošetrila Jinja (žiadne <script> z názvu miesta)
      .bindPopup(card.querySelector("h3").outerHTML + `<a href="${card.href}">${card.classList.contains("tip") ? "Navigovať" : "Zobraziť detail"}</a>`)
      .addTo(map);
  });

  // mapa je najprv skrytá – ukážeme ju až po kliknutí na tlačidlo
  showBtn.addEventListener("click", () => {
    const box = document.getElementById("map");
    box.hidden = !box.hidden;
    showBtn.textContent = box.hidden ? "🗺️ Zobraziť mapu" : "Skryť mapu";
    map.invalidateSize();   // skrytá mapa si musí prepočítať veľkosť
    map.fitBounds(L.featureGroup(cards.map((c) => c.marker)).getBounds(), { padding: [40, 40], maxZoom: 12 });
  });

  let category = "";

  // zobrazí iba karty a špendlíky, ktoré sedia s kategóriou aj hľadaným textom
  function filter() {
    const text = document.getElementById("find").value.toLowerCase();
    cards.forEach((card) => {
      const ok = (!category || card.dataset.category === category) && card.textContent.toLowerCase().includes(text);
      card.hidden = !ok;
      ok ? card.marker.addTo(map) : card.marker.remove();
    });
  }

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelector(".chip.on").classList.remove("on");
      chip.classList.add("on");
      category = chip.dataset.category;
      filter();
    });
  });
  document.getElementById("find").addEventListener("input", filter);

  // zoradenie podľa vzdialenosti od mojej polohy (poloha z prehliadača)
  document.getElementById("near").addEventListener("click", () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      const me = [pos.coords.latitude, pos.coords.longitude];
      L.circleMarker(me, { color: "#45d4ff" }).addTo(map).bindTooltip("Tu si ty");
      cards.forEach((card) => {
        card.km = map.distance(me, [card.dataset.lat, card.dataset.lng]) / 1000;
        card.querySelector(".distance").textContent = `📍 ${card.km.toFixed(1)} km od teba`;
      });
      cards.sort((a, b) => a.km - b.km).forEach((card) => card.parentElement.appendChild(card));
    }, () => alert("Prehliadač nepovolil zistiť polohu."));
  });
}

// ---------- detail miesta ----------
const box = document.getElementById("map").dataset;
if (box.lat) {
  map.setView([box.lat, box.lng], 13);
  L.marker([box.lat, box.lng], { icon: pin(box.icon) }).addTo(map);
}

// ---------- nové miesto: kliknutím na mapu položíme špendlík ----------
const form = document.getElementById("place-form");
if (form) {
  let marker = null;

  function place(latlng) {
    if (!marker) {
      marker = L.marker(latlng, { draggable: true }).addTo(map);
      marker.on("dragend", () => save(marker.getLatLng()));   // špendlík sa dá potiahnuť
    }
    marker.setLatLng(latlng);
    save(latlng);
  }

  function save(latlng) {
    document.getElementById("lat").value = latlng.lat;
    document.getElementById("lng").value = latlng.lng;
  }

  map.on("click", (e) => place(e.latlng));

  document.getElementById("here").addEventListener("click", () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      map.setView(latlng, 15);
      place(latlng);
    }, () => alert("Prehliadač nepovolil zistiť polohu."));
  });

  form.addEventListener("submit", (e) => {
    if (!marker) {
      e.preventDefault();
      alert("Najprv klikni na mapu, kde sa miesto nachádza.");
    }
  });
}
