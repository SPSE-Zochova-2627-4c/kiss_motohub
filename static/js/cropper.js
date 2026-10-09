// Výber výrezu fotky pred nahratím (profilovka 1:1, banner 5:1).
// Fotku v okne posúvaš myšou a približuješ posuvníkom. Na server pošleme
// výrez ako podiely 0–1 (x, y, šírka, výška) a Python fotku oreže (app.save_image).
document.querySelectorAll(".photo-form input[type=file]").forEach((input) => {
  input.addEventListener("change", () => openCropper(input));
});

function openCropper(input) {
  const form = input.closest("form");
  const ratio = Number(input.dataset.ratio);
  const frameW = ratio === 1 ? 300 : 600;
  const frameH = frameW / ratio;

  const overlay = document.createElement("div");
  overlay.className = "modal open";
  overlay.innerHTML = `
    <div class="panel modal-box crop">
      <h2>Vyber výrez</h2>
      <div class="crop-frame ${ratio === 1 ? "round" : ""}" style="width:${frameW}px;height:${frameH}px"><img></div>
      <input type="range" min="1" max="4" step="0.01" value="1">
      <button class="btn">Uložiť</button>
    </div>`;
  document.body.appendChild(overlay);

  const img = overlay.querySelector("img");
  const zoom = overlay.querySelector("input");
  img.src = URL.createObjectURL(input.files[0]);
  img.draggable = false;  // inak prehliadač začne obrázok "presúvať" ako súbor

  let scale, x = 0, y = 0, base;   // x, y = posun fotky v rámiku (px)

  function update() {
    scale = base * zoom.value;
    // fotka nesmie odkryť prázdne miesto v rámiku
    x = Math.min(0, Math.max(frameW - img.naturalWidth * scale, x));
    y = Math.min(0, Math.max(frameH - img.naturalHeight * scale, y));
    img.style.width = img.naturalWidth * scale + "px";
    img.style.left = x + "px";
    img.style.top = y + "px";
  }

  img.onload = () => {
    base = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight); // fotka vyplní rámik
    update();
  };
  img.onerror = () => { overlay.remove(); alert("Tento súbor nie je obrázok."); };
  zoom.oninput = update;

  // posúvanie myšou
  let drag = null;
  img.onpointerdown = (e) => { drag = { mx: e.clientX, my: e.clientY, x, y }; img.setPointerCapture(e.pointerId); };
  img.onpointermove = (e) => {
    if (!drag) return;
    x = drag.x + e.clientX - drag.mx;
    y = drag.y + e.clientY - drag.my;
    update();
  };
  img.onpointerup = () => (drag = null);

  overlay.querySelector("button").onclick = () => {
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const values = { x: -x / w, y: -y / h, w: frameW / w, h: frameH / h };
    for (const key in values) {
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = key;
      hidden.value = values[key];
      form.appendChild(hidden);
    }
    form.submit();
  };
}
