/*
 * cropper.js – vlastný nástroj na výber výrezu fotky (bez externých knižníc).
 *
 * Použitie:
 *   Cropper.open(file, { aspect: 1, round: true, title: "..." })
 *     .then(function (result) { ... })   // result = {x, y, w, h, preview, state}
 *
 * Ako to funguje (matematika):
 *   - Na obrazovke je "rám" (kruh alebo obdĺžnik) – to, čo sa uloží.
 *   - Fotka pod ním sa dá posúvať (tx, ty) a zväčšovať (scale).
 *   - Fotka musí rám vždy celý zakrývať – minimálne zväčšenie je preto
 *       minScale = max(šírka rámu / šírka fotky, výška rámu / výška fotky)
 *   - Výsledok prepočítame na PODIELY fotky (0 – 1), napr.
 *       x = (ľavý okraj rámu − ľavý okraj fotky) / zobrazená šírka fotky
 *     Server (uploads.py) z týchto podielov vyreže pixely z originálu.
 */
(function () {
  var PAD = 28; // okraj okolo rámu, kde vidno stmavenú zvyšnú časť fotky

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  }

  function open(file, options) {
    options = options || {};
    var aspect = options.aspect || 1; // šírka / výška rámu
    var round = !!options.round;

    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Obrázok sa nepodarilo načítať.")); };
      img.onload = function () { build(img, url, aspect, round, options, resolve, reject); };
      img.src = url;
    });
  }

  function build(img, url, aspect, round, options, resolve, reject) {
    var nw = img.naturalWidth, nh = img.naturalHeight;

    // --- rozmery rámu podľa veľkosti obrazovky ---
    var maxW = Math.min(window.innerWidth - 64, aspect > 1.5 ? 820 : 440);
    var maxH = Math.min(window.innerHeight - 280, 440);
    var fw = maxW, fh = fw / aspect;
    if (fh > maxH) { fh = maxH; fw = fh * aspect; }
    fw = Math.round(fw); fh = Math.round(fh);
    var sw = fw + PAD * 2, sh = fh + PAD * 2; // veľkosť celej plochy
    var fx = PAD, fy = PAD;                    // poloha rámu na ploche

    // --- HTML okna ---
    var overlay = el("div", "crop-overlay");
    var box = el("div", "crop-box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.appendChild(el("h3", null, options.title || "Vyber výrez"));
    box.appendChild(el("p", "crop-hint", "Potiahni fotku myšou alebo prstom. Priblíž posuvníkom alebo kolieskom myši."));

    var stage = el("div", "crop-stage");
    stage.style.width = sw + "px";
    stage.style.height = sh + "px";
    stage.tabIndex = 0;
    stage.setAttribute("aria-label", "Plocha výrezu – šípky posúvajú, + a − približujú");
    img.className = "crop-img";
    img.draggable = false;
    stage.appendChild(img);
    var frame = el("div", "crop-frame" + (round ? " round" : ""));
    frame.style.left = fx + "px"; frame.style.top = fy + "px";
    frame.style.width = fw + "px"; frame.style.height = fh + "px";
    stage.appendChild(frame);
    box.appendChild(stage);

    var zoomRow = el("div", "crop-zoom",
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M8 11h6"/></svg>' +
      '<input type="range" min="0" max="1000" value="0" aria-label="Priblíženie">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M11 8v6"/></svg>');
    var slider = zoomRow.querySelector("input");
    box.appendChild(zoomRow);

    var actions = el("div", "crop-actions");
    var cancelBtn = el("button", "btn-ghost", "Zrušiť");
    var okBtn = el("button", "btn-primary", "Použiť výrez");
    cancelBtn.type = okBtn.type = "button";
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    // --- stav: posun a zväčšenie fotky ---
    var minScale = Math.max(fw / nw, fh / nh);
    var maxScale = minScale * 5;
    var scale = minScale;
    var tx = fx + (fw - nw * scale) / 2; // vycentrovať na rám
    var ty = fy + (fh - nh * scale) / 2;

    // pokračovanie v úprave predchádzajúceho výrezu (tlačidlo "Upraviť výrez")
    if (options.state) {
      scale = Math.min(maxScale, Math.max(minScale, fw / (options.state.w * nw)));
      tx = fx - options.state.x * nw * scale;
      ty = fy - options.state.y * nh * scale;
    }

    // fotka nesmie odkryť rám – obmedzíme posun
    function clamp() {
      tx = Math.min(fx, Math.max(fx + fw - nw * scale, tx));
      ty = Math.min(fy, Math.max(fy + fh - nh * scale, ty));
    }

    function render() {
      clamp();
      img.style.width = nw * scale + "px";
      img.style.height = nh * scale + "px";
      img.style.transform = "translate(" + tx + "px," + ty + "px)";
      // posuvník používa logaritmickú stupnicu – priblíženie pôsobí rovnomerne
      slider.value = Math.round(1000 * Math.log(scale / minScale) / Math.log(maxScale / minScale));
    }

    // priblíženie okolo stredu rámu (bod v strede zostane na mieste)
    function zoomTo(newScale) {
      newScale = Math.min(maxScale, Math.max(minScale, newScale));
      var cx = fx + fw / 2, cy = fy + fh / 2;
      var px = (cx - tx) / scale, py = (cy - ty) / scale; // bod fotky pod stredom rámu
      scale = newScale;
      tx = cx - px * scale;
      ty = cy - py * scale;
      render();
    }

    slider.addEventListener("input", function () {
      zoomTo(minScale * Math.pow(maxScale / minScale, slider.value / 1000));
    });

    stage.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoomTo(scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    }, { passive: false });

    // --- ťahanie myšou aj prstom (Pointer Events) ---
    var drag = null;
    stage.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY, tx: tx, ty: ty };
      stage.setPointerCapture(e.pointerId);
      stage.classList.add("dragging");
    });
    stage.addEventListener("pointermove", function (e) {
      if (!drag) return;
      tx = drag.tx + (e.clientX - drag.x);
      ty = drag.ty + (e.clientY - drag.y);
      render();
    });
    function endDrag() { drag = null; stage.classList.remove("dragging"); }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);

    // --- klávesnica (prístupnosť) ---
    stage.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 30 : 8;
      if (e.key === "ArrowLeft") tx += step;
      else if (e.key === "ArrowRight") tx -= step;
      else if (e.key === "ArrowUp") ty += step;
      else if (e.key === "ArrowDown") ty -= step;
      else if (e.key === "+" || e.key === "=") return zoomTo(scale * 1.1);
      else if (e.key === "-") return zoomTo(scale / 1.1);
      else return;
      e.preventDefault();
      render();
    });

    function close() {
      overlay.remove();
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEsc);
    }
    function onEsc(e) { if (e.key === "Escape") { close(); URL.revokeObjectURL(url); reject(new Error("cancel")); } }
    document.addEventListener("keydown", onEsc);

    cancelBtn.addEventListener("click", function () { close(); URL.revokeObjectURL(url); reject(new Error("cancel")); });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) { close(); URL.revokeObjectURL(url); reject(new Error("cancel")); }
    });

    okBtn.addEventListener("click", function () {
      // výrez ako podiely fotky 0 – 1 (tieto čísla pôjdu na server)
      var dw = nw * scale, dh = nh * scale;
      var result = {
        x: (fx - tx) / dw,
        y: (fy - ty) / dh,
        w: fw / dw,
        h: fh / dh,
      };
      // náhľad výsledku nakreslíme do <canvas> (ukáže sa ešte pred nahratím)
      var outW = aspect > 1.5 ? 1000 : 300, outH = Math.round(outW / aspect);
      var canvas = document.createElement("canvas");
      canvas.width = outW; canvas.height = outH;
      canvas.getContext("2d").drawImage(img, result.x * nw, result.y * nh, result.w * nw, result.h * nh, 0, 0, outW, outH);
      result.preview = canvas.toDataURL("image/jpeg", 0.9);
      result.state = { x: result.x, y: result.y, w: result.w };
      close();
      URL.revokeObjectURL(url);
      resolve(result);
    });

    render();
    stage.focus();
  }

  window.Cropper = { open: open };
})();
