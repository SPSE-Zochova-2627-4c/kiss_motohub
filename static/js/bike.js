// Easter egg – interaktívna motorka na homepage.
// Klik na koleso = roztočí sa, kapotáž = wheelie, svetlo = zabliká, výfuk = plyn.
const bike = document.getElementById("neon-bike");
const rig = document.getElementById("bike-rig");

// pridá CSS triedu, ktorá spustí animáciu, a po čase ju zas odoberie
function animate(element, cls, ms) {
  element.classList.remove(cls);
  void element.offsetWidth; // trik, aby sa animácia spustila aj druhýkrát
  element.classList.add(cls);
  setTimeout(() => element.classList.remove(cls), ms);
}

// jednoduchý zvuk motora cez Web Audio API (bez zvukových súborov)
function engineSound(seconds) {
  const audio = new AudioContext();
  const osc = audio.createOscillator();
  const volume = audio.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(50, audio.currentTime);
  osc.frequency.exponentialRampToValueAtTime(180, audio.currentTime + seconds / 2);
  osc.frequency.exponentialRampToValueAtTime(45, audio.currentTime + seconds);
  volume.gain.setValueAtTime(0.08, audio.currentTime);
  volume.gain.linearRampToValueAtTime(0, audio.currentTime + seconds);
  osc.connect(volume).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + seconds);
}

const actions = {
  "spin-rear": () => animate(document.getElementById("wheel-rear"), "spin", 1300),
  "spin-front": () => animate(document.getElementById("wheel-front"), "spin", 1300),
  "lights": () => animate(rig, "lights", 1500),
  "rev": () => { animate(bike, "shake", 1200); animate(rig, "flame-on", 1200); engineSound(1.4); },
  "wheelie": () => { animate(rig, "wheelie", 2500); animate(document.getElementById("wheel-rear"), "spin", 2500); engineSound(2.4); },
};

bike.addEventListener("click", (e) => {
  const part = e.target.closest("[data-action]");
  if (part) actions[part.dataset.action]();
});
