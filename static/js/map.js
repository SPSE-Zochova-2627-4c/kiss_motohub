// Spoločné nastavenie mapy pre Trasy aj Lokácie (Leaflet + OpenStreetMap, bez API kľúča)
function createMap() {
  const map = L.map("map", { minZoom: 5 }).setView([48.7, 19.5], 7);   // stred Slovenska
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
  return map;
}
