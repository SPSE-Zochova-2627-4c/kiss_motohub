/*
 * Interaktívna neónová motorka na homepage.
 *  - koleso    -> roztočí sa
 *  - kapotáž   -> wheelie
 *  - svetlo    -> zabliká diaľkové
 *  - výfuk     -> plyn: dym, plameň, otras a zvuk motora
 * Zvuk sa generuje cez Web Audio API (žiadne zvukové súbory).
 *
 * Je to "easter egg" – na stránke nie sú žiadne tlačidlá ani nápoveda.
 * Návštevník si iba všimne, že sa časti motorky pri prejdení myšou rozžiaria
 * (CSS .hot:hover) a že sa na ne dá kliknúť.
 */
(function () {
  var svg = document.getElementById("neon-bike");
  if (!svg) return;
  var rig = document.getElementById("bike-rig");
  var wheelRear = document.getElementById("wheel-rear");
  var wheelFront = document.getElementById("wheel-front");
  var smoke = document.getElementById("smoke");
  var SVGNS = "http://www.w3.org/2000/svg";

  var soundOn = true; // zvuk sa prehrá iba po kliknutí (prehliadače inak zvuk blokujú)
  var audio = null;

  // Spustí CSS animáciu znova, aj keď práve beží
  function replay(el, cls, ms) {
    el.classList.remove(cls);
    void el.getBoundingClientRect(); // reflow
    el.classList.add(cls);
    clearTimeout(el["_t_" + cls]);
    el["_t_" + cls] = setTimeout(function () { el.classList.remove(cls); }, ms);
  }

  // ---------------- zvuk motora ----------------
  function getAudio() {
    if (!audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === "suspended") audio.resume();
    return audio;
  }

  function engineSound(duration, peak) {
    if (!soundOn) return;
    var ac = getAudio();
    if (!ac) return;
    var t = ac.currentTime;
    var d = duration || 1.6;
    var top = peak || 170;

    var master = ac.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(0.16, t + 0.06);
    master.gain.setValueAtTime(0.16, t + d * 0.7);
    master.gain.exponentialRampToValueAtTime(0.0001, t + d);

    var filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(500, t);
    filter.frequency.linearRampToValueAtTime(1600, t + d * 0.45);
    filter.frequency.linearRampToValueAtTime(400, t + d);
    filter.Q.value = 4;

    // "búchanie" valcov – rýchla modulácia hlasitosti
    var chop = ac.createGain();
    chop.gain.value = 0.55;
    var lfo = ac.createOscillator();
    lfo.type = "square";
    var lfoDepth = ac.createGain();
    lfoDepth.gain.value = 0.45;
    lfo.connect(lfoDepth);
    lfoDepth.connect(chop.gain);

    var o1 = ac.createOscillator();
    var o2 = ac.createOscillator();
    o1.type = "sawtooth";
    o2.type = "square";
    o2.detune.value = -1200; // o oktávu nižšie = "basy"

    [o1.frequency, o2.frequency, lfo.frequency].forEach(function (f, i) {
      var k = i === 2 ? 0.5 : 1; // LFO v polovici frekvencie
      f.setValueAtTime(45 * k, t);
      f.exponentialRampToValueAtTime(60 * k, t + d * 0.1);
      f.exponentialRampToValueAtTime(top * k, t + d * 0.38);
      f.exponentialRampToValueAtTime(top * 0.75 * k, t + d * 0.5);
      f.exponentialRampToValueAtTime(top * 1.05 * k, t + d * 0.62);
      f.exponentialRampToValueAtTime(42 * k, t + d);
    });

    var o2g = ac.createGain();
    o2g.gain.value = 0.6;
    o1.connect(chop);
    o2.connect(o2g);
    o2g.connect(chop);
    chop.connect(filter);
    filter.connect(master);
    master.connect(ac.destination);

    [o1, o2, lfo].forEach(function (o) { o.start(t); o.stop(t + d + 0.05); });
  }

  function clickSound() {
    if (!soundOn) return;
    var ac = getAudio();
    if (!ac) return;
    var t = ac.currentTime;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(1800, t);
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + 0.06);
  }

  // ---------------- dym z výfuku ----------------
  function puff(delay) {
    setTimeout(function () {
      var c = document.createElementNS(SVGNS, "circle");
      var startX = 280 + Math.random() * 6;
      var startY = 276 + Math.random() * 6;
      c.setAttribute("cx", startX);
      c.setAttribute("cy", startY);
      c.setAttribute("r", 7);
      c.setAttribute("fill", Math.random() < 0.3 ? "rgba(255,122,217,.75)" : "rgba(214,190,255,.65)");
      // zväčšovať okolo vlastného stredu, nie okolo rohu celého SVG
      c.style.transformBox = "fill-box";
      c.style.transformOrigin = "center";
      smoke.appendChild(c);
      var dx = -(50 + Math.random() * 80);
      var dy = -(15 + Math.random() * 55);
      if (c.animate) {
        var anim = c.animate(
          [
            { transform: "translate(0,0) scale(1)", opacity: 0.9 },
            { transform: "translate(" + dx + "px," + dy + "px) scale(" + (3 + Math.random() * 2) + ")", opacity: 0 }
          ],
          { duration: 900 + Math.random() * 500, easing: "cubic-bezier(.2,.6,.3,1)" }
        );
        anim.onfinish = function () { c.remove(); };
      } else {
        setTimeout(function () { c.remove(); }, 1000);
      }
    }, delay);
  }

  // ---------------- akcie ----------------
  var actions = {
    "spin-rear": function () { replay(wheelRear, "spin", 1300); clickSound(); },
    "spin-front": function () { replay(wheelFront, "spin", 1300); clickSound(); },
    "spin-both": function () {
      replay(wheelRear, "spin", 1300);
      replay(wheelFront, "spin", 1300);
      engineSound(1.1, 120);
    },
    lights: function () {
      replay(rig, "lights", 1500);
      clickSound();
      setTimeout(clickSound, 380);
    },
    rev: function () {
      replay(svg, "rev", 1500);
      replay(rig, "flame-on", 1300);
      for (var i = 0; i < 14; i++) puff(i * 80);
      engineSound(1.6, 175);
    },
    wheelie: function () {
      if (rig.classList.contains("wheelie")) return;
      replay(rig, "wheelie", 2600);
      replay(wheelRear, "spin-long", 2600);
      replay(rig, "flame-on", 900);
      for (var i = 0; i < 8; i++) puff(i * 90);
      engineSound(2.4, 190);
    }
  };

  function run(name) {
    if (actions[name]) actions[name]();
  }

  // kliknutie priamo na časti motorky
  svg.addEventListener("click", function (e) {
    var hot = e.target.closest("[data-action]");
    if (hot) run(hot.getAttribute("data-action"));
  });

})();
