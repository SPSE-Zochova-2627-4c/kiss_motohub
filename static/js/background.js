/*
 * Celostránkové neónové pozadie: perspektívna "cesta" (podlaha + jemný strop)
 * a vznášajúce sa svetielka. Najjasnejšie je pri motorke, k okrajom slabne.
 * Pri scrollovaní sa posúva spolu s motorkou.
 */
(function () {
  var canvas = document.getElementById("bg-canvas");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var stage = document.getElementById("neon-stage");

  // Na stránkach bez motorky (napr. /motorky) je pozadie tlmenejšie
  var INTENSITY = stage ? 1 : 0.6;
  var PARTICLE_COUNT = 95;

  var W = 0, H = 0, dpr = 1;
  var particles = [];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeParticle(randomY) {
    return {
      x: Math.random() * W,
      y: randomY ? Math.random() * H : H + 10,
      r: 0.5 + Math.random() * 1.1,
      vy: 0.08 + Math.random() * 0.35,      // pomalé stúpanie
      vx: (Math.random() - 0.5) * 0.12,
      phase: Math.random() * Math.PI * 2,    // blikanie
      tw: 0.6 + Math.random() * 1.4
    };
  }

  function initParticles() {
    particles = [];
    for (var i = 0; i < PARTICLE_COUNT; i++) particles.push(makeParticle(true));
  }

  // Kde je "srdce" scény – stred motorky, alebo horná časť stránky
  function anchor() {
    if (stage) {
      var r = stage.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height * 0.72, horizon: r.top + r.height * 0.55 };
    }
    return { x: W / 2, y: H * 0.12, horizon: H * 0.05 };
  }

  function glowAlpha(x, y, a, R) {
    var dx = x - a.x, dy = (y - a.y) * 1.3;
    var d2 = (dx * dx + dy * dy) / (R * R);
    return Math.exp(-d2); // 1 pri motorke, ~0 ďaleko
  }

  function drawGrid(a, t) {
    var R = Math.max(W, H) * 0.95;
    var grad = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, R);
    grad.addColorStop(0, "rgba(170,110,255," + 0.3 * INTENSITY + ")");
    grad.addColorStop(0.3, "rgba(155,77,255," + 0.1 * INTENSITY + ")");
    grad.addColorStop(1, "rgba(155,77,255," + 0.03 * INTENSITY + ")");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1;

    var vx = a.x, vy = a.horizon;
    var span = W * 3;

    // --- podlaha: lúče z úbežníka + priečky, ktoré "idú" k divákovi ---
    var floorDepth = Math.max(H - vy, 40) + 200;
    ctx.beginPath();
    var rays = 34;
    for (var i = 0; i <= rays; i++) {
      var bx = vx - span / 2 + (span * i) / rays;
      ctx.moveTo(vx, vy);
      ctx.lineTo(bx, vy + floorDepth);
    }
    var rows = 14;
    var shift = reduceMotion ? 0 : (t * 0.00012) % 1;
    for (var j = 0; j < rows; j++) {
      var k = (j + shift) / rows;
      var y = vy + Math.pow(k, 2.2) * floorDepth;
      if (y <= vy + 1) continue;
      var half = ((y - vy) / floorDepth) * (span / 2);
      ctx.moveTo(vx - half, y);
      ctx.lineTo(vx + half, y);
    }
    ctx.stroke();

    // --- jemný strop (zrkadlený, oveľa slabší) – aby svetlo bolo aj po stranách hore ---
    ctx.save();
    ctx.globalAlpha = 0.3;
    var ceilDepth = Math.max(vy, 40) + 120;
    ctx.beginPath();
    for (var c = 0; c <= rays; c += 2) {
      var tx = vx - span / 2 + (span * c) / rays;
      ctx.moveTo(vx, vy);
      ctx.lineTo(tx, vy - ceilDepth);
    }
    for (var m = 1; m < 8; m++) {
      var kk = (m + shift) / 8;
      var cy = vy - Math.pow(kk, 2.2) * ceilDepth;
      var ch = ((vy - cy) / ceilDepth) * (span / 2);
      ctx.moveTo(vx - ch, cy);
      ctx.lineTo(vx + ch, cy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles(a, t, dt) {
    var R = Math.max(W, H) * 0.5;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!reduceMotion) {
        p.y -= p.vy * dt * 0.06;
        p.x += p.vx * dt * 0.06;
        if (p.y < -10 || p.x < -10 || p.x > W + 10) {
          particles[i] = p = makeParticle(false);
          p.x = Math.random() * W;
        }
      }
      var near = glowAlpha(p.x, p.y, a, R);
      var tw = reduceMotion ? 0.8 : 0.55 + 0.45 * Math.sin(p.phase + t * 0.002 * p.tw);
      var alpha = (0.1 + 0.5 * near) * tw * INTENSITY;
      var size = p.r * (0.9 + near * 0.5);

      // halo + jadro (lacnejšie ako shadowBlur)
      ctx.fillStyle = "rgba(155,77,255," + alpha * 0.18 + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(233,220,255," + alpha + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  var last = 0;
  function frame(t) {
    var dt = last ? Math.min(t - last, 50) : 16;
    last = t;
    ctx.clearRect(0, 0, W, H);
    var a = anchor();
    drawGrid(a, t);
    drawParticles(a, t, dt);
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  resize();
  initParticles();
  window.addEventListener("resize", function () {
    resize();
    initParticles();
    if (reduceMotion) frame(0);
  });
  if (reduceMotion) {
    window.addEventListener("scroll", function () { frame(0); }, { passive: true });
    frame(0);
  } else {
    requestAnimationFrame(frame);
  }
})();
