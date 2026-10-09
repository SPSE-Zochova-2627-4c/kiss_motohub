// Neónová mriežka a svetielka v pozadí stránky (kreslí sa do <canvas id="bg">)
const canvas = document.getElementById("bg");
const ctx = canvas.getContext("2d");
let dots = [];

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  dots = [];
  for (let i = 0; i < 80; i++) {
    dots.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, speed: 0.2 + Math.random() * 0.5 });
  }
}

function draw(time) {
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, horizon = h * 0.35;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(155, 77, 255, 0.12)";

  // čiary zo stredu (úbežník) – vytvárajú "cestu"
  ctx.beginPath();
  for (let i = -20; i <= 20; i++) {
    ctx.moveTo(cx, horizon);
    ctx.lineTo(cx + i * w / 8, h);
  }
  // vodorovné čiary, ktoré sa pomaly posúvajú k nám
  for (let i = 0; i < 12; i++) {
    const k = ((i + time / 4000) % 12) / 12;
    const y = horizon + k * k * (h - horizon);
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // svetielka stúpajú nahor
  ctx.fillStyle = "rgba(210, 180, 255, 0.6)";
  for (const d of dots) {
    d.y -= d.speed;
    if (d.y < 0) d.y = h;
    ctx.fillRect(d.x, d.y, 2, 2);
  }
  requestAnimationFrame(draw);
}

addEventListener("resize", resize);
resize();
requestAnimationFrame(draw);
