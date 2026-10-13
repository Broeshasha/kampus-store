(function () {
  "use strict";
  var K = window.PartnerKit;
  if (!K) return;
  var CFG = K.CFG, T = K.T, PR = T.pr || {}, esc = K.esc, fill = K.fill, toast = K.toast;
  var CAPS = CFG.caps || {}, STORY = CFG.story || {};
  var CURR = { en: "DA", fr: "DA", ar: "د.ج" };
  var P = null;          // the product being promoted
  var root = null;       // the full-screen layer

  // ---------- helpers ----------
  function allImages(images) {
    var out = [];
    (function walk(x, d) {
      if (x == null || d > 5) return;
      if (typeof x === "string") {
        var v = x.trim();
        if (v[0] === "[" || v[0] === "{") { try { return walk(JSON.parse(v), d + 1); } catch (e) {} }
        if (/^(https?:)?\/\//i.test(v) || v[0] === "/") out.push(v);
        return;
      }
      if (Array.isArray(x)) { x.forEach(function (y) { walk(y, d + 1); }); return; }
      if (typeof x === "object") {
        var keys = ["url", "src", "publicUrl", "image", "image_url", "original", "large", "full"];
        for (var i = 0; i < keys.length; i++) if (typeof x[keys[i]] === "string" && x[keys[i]]) return walk(x[keys[i]], d + 1);
        Object.keys(x).forEach(function (k) { walk(x[k], d + 1); });
      }
    })(images, 0);
    var seen = {};
    return out.filter(function (u) { if (seen[u]) return false; seen[u] = 1; return true; });
  }
  function proxy(url, extra) { return "/api/img?" + (extra || "") + "u=" + encodeURIComponent(url); }
  function priceText(n, lang) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " " + (CURR[lang] || "DA");
  }
  function captionFor(p, lang, style) {
    var tpl = ((CAPS[lang] || CAPS.fr || {})[style]) || "";
    return tpl.replace(/\{name\}/g, p.name).replace(/\{price\}/g, priceText(p.sell_price, lang))
      .replace(/\{link\}/g, K.linkFor(p.slug)).replace(/\{code\}/g, K.S.dash.promo_code);
  }
  function copyText(text) {
    return (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject())
      .catch(function () { window.prompt("", text); });
  }
  function clickStats(slug) {
    var r = K.S.clicks.filter(function (c) { return c.slug === slug; })[0];
    return { c: r ? r.clicks : 0, o: r ? r.orders : 0 };
  }
  function isRtl(text) { return /[\u0600-\u06FF]/.test(text || ""); }
  function saveBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function fetchFile(url, name) {
    return fetch(proxy(url)).then(function (r) { if (!r.ok) throw new Error("photo"); return r.blob(); }).then(function (b) {
      return new File([b], name + "." + (b.type.indexOf("png") > -1 ? "png" : "jpg"), { type: b.type || "image/jpeg" });
    });
  }
  function shareFiles(files, text, title) {
    if (navigator.canShare && navigator.canShare({ files: files }) && navigator.share) {
      return navigator.share({ files: files, text: text, title: title });
    }
    toast(PR.shareNoFiles);
    return Promise.resolve();
  }

  // ---------- the image (story 9:16 or post 1:1), drawn with the phone's own canvas ----------
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function wrap(ctx, text, maxW, maxLines) {
    var words = String(text || "").split(/\s+/), lines = [], cur = "";
    words.forEach(function (w) {
      var test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines - 1];
      while (last.length > 1 && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last + "…";
    }
    return lines;
  }
  function contain(ctx, img, x, y, w, h) {
    var s = Math.min(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  var FONT = "Cairo, 'Segoe UI', system-ui, sans-serif";
  function font(w, px) { return w + " " + px + "px " + FONT; }
  // shrink the text until it fits the space (long names / other fonts never overflow)
  function fitPx(ctx, text, weight, px, maxW, minPx) {
    while (px > minPx) { ctx.font = font(weight, px); if (ctx.measureText(text).width <= maxW) break; px -= 2; }
    ctx.font = font(weight, px);
    return px;
  }

  // o = { img, logo, name, price, code, host, S: {pay, wil, code, order}, rtl }
  function drawCard(ctx, W, H, o) {
    var story = H > W;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#3e7bfa"); g.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,.07)";
    ctx.beginPath(); ctx.arc(W * 0.92, H * 0.08, W * 0.32, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.05, H * 0.9, W * 0.28, 0, 7); ctx.fill();
    ctx.textBaseline = "alphabetic";

    function brand(x, y, size) {
      if (o.logo) { ctx.save(); rr(ctx, x, y, size, size, size * 0.24); ctx.clip(); ctx.drawImage(o.logo, x, y, size, size); ctx.restore(); }
      ctx.fillStyle = "#0e0f11"; ctx.textAlign = "left"; ctx.direction = "ltr";
      ctx.font = font(800, Math.round(size * 0.5));
      ctx.fillText("Kampus Store", x + size + 24, y + size * 0.68);
    }
    function pill(cx, y, text, px, h, bg, fg, maxW) {
      while (px > 30) { ctx.font = font(900, px); if (ctx.measureText(text).width + px * 1.1 <= maxW) break; px -= 2; }
      ctx.font = font(900, px);
      var tw = ctx.measureText(text).width, w = tw + px * 1.1;
      ctx.fillStyle = bg; rr(ctx, cx - w / 2, y, w, h, h / 2); ctx.fill();
      ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.fillText(text, cx, y + h * 0.68);
    }
    function photo(x, y, w, h) {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.28)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
      ctx.fillStyle = "#fff"; rr(ctx, x, y, w, h, 56); ctx.fill(); ctx.restore();
      if (o.img) { ctx.save(); rr(ctx, x, y, w, h, 56); ctx.clip(); contain(ctx, o.img, x + 24, y + 24, w - 48, h - 48); ctx.restore(); }
    }
    var nameRtl = isRtl(o.name);

    if (story) {
      brand(90, 90, 120);
      photo(90, 250, 900, 860);
      ctx.fillStyle = "#fff"; ctx.font = font(800, 70); ctx.textAlign = "center"; ctx.direction = nameRtl ? "rtl" : "ltr";
      wrap(ctx, o.name, 900, 2).forEach(function (ln, i) { ctx.fillText(ln, W / 2, 1205 + i * 84); });
      pill(W / 2, 1345, o.price, 112, 160, "#0e0f11", "#fff", 900);
      ctx.fillStyle = "#fff"; ctx.direction = o.rtl ? "rtl" : "ltr"; ctx.textAlign = "center";
      fitPx(ctx, "✅ " + o.S.pay, 800, 50, 900, 26); ctx.fillText("✅ " + o.S.pay, W / 2, 1578);
      fitPx(ctx, o.S.wil, 700, 44, 900, 24); ctx.fillText(o.S.wil, W / 2, 1640);
      ctx.fillStyle = "#fff"; rr(ctx, 130, 1695, 820, 118, 59); ctx.fill();
      ctx.fillStyle = "#0e0f11"; ctx.direction = o.rtl ? "rtl" : "ltr";
      fitPx(ctx, o.S.code + ": " + o.code, 900, 56, 740, 28); ctx.fillText(o.S.code + ": " + o.code, W / 2, 1772);
      ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.direction = "ltr";
      fitPx(ctx, o.S.order + " " + o.host, 700, 38, 960, 22); ctx.fillText(o.S.order + " " + o.host, W / 2, 1870);
    } else {
      brand(50, 40, 84);
      photo(50, 160, 520, 520);
      var x = 620, w = 410;
      ctx.fillStyle = "#fff"; ctx.font = font(800, 52); ctx.textAlign = nameRtl ? "right" : "left"; ctx.direction = nameRtl ? "rtl" : "ltr";
      var tx = nameRtl ? x + w : x;
      wrap(ctx, o.name, w, 3).forEach(function (ln, i) { ctx.fillText(ln, tx, 235 + i * 62); });
      pill(x + w / 2, 440, o.price, 64, 104, "#0e0f11", "#fff", w);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.direction = o.rtl ? "rtl" : "ltr";
      fitPx(ctx, "✅ " + o.S.pay, 800, 34, 420, 18); ctx.fillText("✅ " + o.S.pay, x + w / 2, 600);
      fitPx(ctx, o.S.wil, 700, 30, 420, 18); ctx.fillText(o.S.wil, x + w / 2, 648);
      ctx.fillStyle = "#fff"; rr(ctx, 50, 760, 980, 132, 66); ctx.fill();
      ctx.fillStyle = "#0e0f11"; fitPx(ctx, o.S.code + ": " + o.code, 900, 62, 900, 28); ctx.fillText(o.S.code + ": " + o.code, W / 2, 846);
      ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.direction = "ltr";
      fitPx(ctx, o.S.order + " " + o.host, 700, 38, 980, 22); ctx.fillText(o.S.order + " " + o.host, W / 2, 970);
    }
  }
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("image")); };
      im.src = src;
    });
  }
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.race([
      Promise.all([document.fonts.load("800 40px Cairo"), document.fonts.load("800 40px Cairo", "مرحبا")]),
      new Promise(function (r) { setTimeout(r, 1500); })
    ]).catch(function () {});
  }

  // ---------- the screen ----------
  function viewHtml() {
    var p = P.product, st = clickStats(p.slug), link = K.linkFor(p.slug), picked = K.S.picks.indexOf(p.id) > -1;
    var langBtns = ["ar", "fr", "en"].map(function (l) {
      return '<button type="button" class="chip' + (P.lang === l ? " on" : "") + '" data-p="lang" data-v="' + l + '">' + (l === "ar" ? "عربية" : l.toUpperCase()) + "</button>";
    }).join("");
    var styleBtns = [["short", PR.capShort], ["normal", PR.capNormal], ["story", PR.capStory]].map(function (s) {
      return '<button type="button" class="chip' + (P.style === s[0] ? " on" : "") + '" data-p="style" data-v="' + s[0] + '">' + esc(s[1]) + "</button>";
    }).join("");
    var slides = P.imgs.map(function (u, i) {
      return '<div class="pslide"><img ' + (i ? 'loading="lazy" ' : "") + 'src="' + esc(proxy(u)) + '" alt=""></div>';
    }).join("");
    var thumbs = P.imgs.length > 1 ? '<div class="pthumbs" id="pp-thumbs">' + P.imgs.map(function (u, i) {
      return '<img src="' + esc(proxy(u)) + '" data-p="thumb" data-v="' + i + '" class="' + (i ? "" : "on") + '" alt="">';
    }).join("") + "</div>" : "";
    var how = ["wa", "ig", "fb", "tt"].map(function (k) {
      var h = (PR.how || {})[k]; if (!h) return "";
      return "<details><summary>" + esc(h.t) + "</summary><ol>" + h.s.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ol></details>";
    }).join("");

    return '<div class="promo-in">' +
      '<button type="button" class="back" data-p="close">← ' + esc(PR.back) + "</button>" +
      "<h2>" + esc(p.name) + "</h2>" +
      '<p class="earnline">' + fill(esc(PR.youEarn), { x: "<b>" + esc(K.money(p.earn_per_unit)) + "</b>" }) + " · " + esc(T.price) + " " + esc(K.money(p.sell_price)) + "</p>" +
      '<p class="muted small">' + esc(fill(PR.statsLine, { c: st.c, o: st.o })) + "</p>" +
      '<button type="button" class="mini ' + (picked ? "solid" : "") + '" data-p="pick" id="pp-pick">' + (picked ? esc(PR.picked) : "⭐ " + esc(PR.pick)) + "</button>" +

      '<section class="pbox"><h3>📷 ' + esc(PR.photos) + "</h3>" +
        (P.imgs.length ? '<div class="pslider" id="pp-slider">' + slides + "</div>" + thumbs +
          '<div class="oact"><button class="mini solid" type="button" data-p="savepic">' + esc(PR.savePhoto) + '</button><button class="mini" type="button" data-p="saveall">' + esc(PR.saveAll) + '</button><button class="mini" type="button" data-p="shareall">' + esc(PR.shareAll) + "</button></div>"
          : '<p class="muted">' + esc(PR.noPhotos) + "</p>") + "</section>" +

      '<section class="pbox"><h3>🔗 ' + esc(PR.link) + '</h3><div class="linkrow"><b dir="ltr">' + esc(link) + '</b></div>' +
        '<div class="oact"><button class="mini solid" type="button" data-p="copylink">' + esc(PR.copyLink) + '</button><a class="mini" href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(PR.openLink) + "</a></div></section>" +

      '<section class="pbox"><h3>✍️ ' + esc(PR.captions) + '</h3><div class="chips">' + langBtns + '</div><div class="chips">' + styleBtns + "</div>" +
        '<textarea id="pp-cap" rows="9" dir="auto"></textarea><p class="muted small">' + esc(PR.editHint) + "</p>" +
        '<div class="oact"><button class="mini solid" type="button" data-p="copycap">' + esc(PR.copyCaption) + "</button></div></section>" +

      '<section class="pbox"><h3>🚀 ' + esc(PR.shareNow) + '</h3><div class="shgrid">' +
        '<button type="button" class="shb" style="--c:#25d366" data-p="wa"><i></i>' + esc(PR.whatsapp) + "</button>" +
        '<button type="button" class="shb" style="--c:#1877f2" data-p="fb"><i></i>' + esc(PR.facebook) + "</button>" +
        '<button type="button" class="shb" style="--c:#229ed9" data-p="tg"><i></i>' + esc(PR.telegram) + "</button>" +
        '<button type="button" class="shb" style="--c:#e1306c" data-p="ig"><i></i>' + esc(PR.instagram) + "</button>" +
        '<button type="button" class="shb" style="--c:#3e7bfa" data-p="photoscap"><i></i>' + esc(PR.photosCaption) + "</button></div></section>" +

      '<section class="pbox"><h3>🎨 ' + esc(PR.storyTitle) + '</h3><p class="muted small">' + esc(PR.storyHint) + "</p>" +
        '<div class="chips"><button type="button" class="chip on" data-p="fmt" data-v="story">' + esc(PR.fmtStory) + '</button><button type="button" class="chip" data-p="fmt" data-v="post">' + esc(PR.fmtPost) + "</button></div>" +
        '<div class="oact"><button class="mini solid" type="button" data-p="make">' + esc(PR.makeImage) + '</button></div>' +
        '<div id="pp-canvas" class="canvaswrap"></div><div id="pp-canvas-act" class="oact" hidden><button class="mini solid" type="button" data-p="saveimg">' + esc(PR.saveImage) + '</button><button class="mini" type="button" data-p="shareimg">' + esc(PR.shareImage) + "</button></div></section>" +

      '<section class="pbox"><h3>📖 ' + esc(PR.howTitle) + "</h3>" + how + "</section></div>";
  }

  function el(id) { return root.querySelector("#" + id); }
  function currentCaption() { return el("pp-cap").value; }
  function refreshCaption() { el("pp-cap").value = captionFor(P.product, P.lang, P.style); }
  function mark(sel, attr, val) {
    root.querySelectorAll(sel).forEach(function (b) { b.classList.toggle("on", b.getAttribute(attr) === val); });
  }

  function open(slug) {
    var p = K.S.products.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return;
    P = { product: p, imgs: allImages(p.images), idx: 0, lang: CFG.lang, style: "normal", fmt: "story", blob: null };
    close(true);
    root = document.createElement("div");
    root.id = "promote"; root.className = "promo"; root.setAttribute("role", "dialog");
    root.innerHTML = viewHtml();
    document.body.appendChild(root);
    document.body.classList.add("noscroll");
    root.scrollTop = 0;
    refreshCaption();
    var slider = el("pp-slider");
    if (slider) slider.addEventListener("scroll", function () {
      P.idx = Math.round(slider.scrollLeft / (slider.clientWidth || 1));
      mark("#pp-thumbs img", "data-v", String(P.idx));
    }, { passive: true });
    root.addEventListener("click", onClick);
  }
  function close(silent) {
    if (root) { root.remove(); root = null; }
    if (!silent) document.body.classList.remove("noscroll");
  }

  function saveOne(i) {
    var url = P.imgs[i]; if (!url) return;
    var a = document.createElement("a");
    a.href = proxy(url, "dl=1&name=" + encodeURIComponent(P.product.slug + "-" + (i + 1)) + "&");
    a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  }

  function makeImage() {
    var W = 1080, H = P.fmt === "story" ? 1920 : 1080, S = STORY[P.lang] || STORY.fr;
    var wrapEl = el("pp-canvas"); wrapEl.textContent = PR.drawing; el("pp-canvas-act").hidden = true;
    var host = ""; try { host = new URL(CFG.store).host; } catch (e) {}
    return Promise.all([
      fontsReady(),
      P.imgs.length ? loadImage(proxy(P.imgs[Math.min(P.idx, P.imgs.length - 1)])).catch(function () { return null; }) : Promise.resolve(null),
      loadImage("/logo.png").catch(function () { return null; })
    ]).then(function (r) {
      var c = document.createElement("canvas"); c.width = W; c.height = H;
      drawCard(c.getContext("2d"), W, H, { img: r[1], logo: r[2], name: P.product.name, price: priceText(P.product.sell_price, P.lang), code: K.S.dash.promo_code, host: host, S: S, rtl: P.lang === "ar" });
      c.className = "storycv"; wrapEl.textContent = ""; wrapEl.appendChild(c);
      return new Promise(function (res) { c.toBlob(function (b) { P.blob = b; el("pp-canvas-act").hidden = false; res(); }, "image/png"); });
    }).catch(function () { wrapEl.textContent = PR.drawFail; });
  }

  function onClick(ev) {
    var t = ev.target.closest("[data-p]");
    if (!t) return;
    var act = t.dataset.p, v = t.dataset.v, p = P.product;
    if (act === "close") { close(); return; }
    if (act === "lang") { P.lang = v; mark('[data-p="lang"]', "data-v", v); refreshCaption(); return; }
    if (act === "style") { P.style = v; mark('[data-p="style"]', "data-v", v); refreshCaption(); return; }
    if (act === "fmt") { P.fmt = v; mark('[data-p="fmt"]', "data-v", v); return; }
    if (act === "thumb") { var s = el("pp-slider"); P.idx = parseInt(v, 10); s.scrollTo({ left: P.idx * s.clientWidth, behavior: "smooth" }); mark("#pp-thumbs img", "data-v", v); return; }
    if (act === "savepic") { toast(PR.saved); saveOne(P.idx); return; }
    if (act === "saveall") { toast(PR.saved); P.imgs.forEach(function (u, i) { setTimeout(function () { saveOne(i); }, i * 700); }); return; }
    if (act === "shareall") {
      Promise.all(P.imgs.slice(0, 6).map(function (u, i) { return fetchFile(u, p.slug + "-" + (i + 1)); }))
        .then(function (files) { return shareFiles(files, currentCaption(), p.name); }).catch(function () {});
      return;
    }
    if (act === "copylink") { copyText(K.linkFor(p.slug)).then(function () { toast(T.copied); }); return; }
    if (act === "copycap") { copyText(currentCaption()).then(function () { toast(T.copied); }); return; }
    if (act === "wa") { window.open("https://wa.me/?text=" + encodeURIComponent(currentCaption()), "_blank"); return; }
    if (act === "tg") { window.open("https://t.me/share/url?url=" + encodeURIComponent(K.linkFor(p.slug)) + "&text=" + encodeURIComponent(currentCaption()), "_blank"); return; }
    if (act === "fb") { window.open("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(K.linkFor(p.slug)), "_blank"); return; }
    if (act === "ig") { copyText(currentCaption()).then(function () { toast(PR.instaTip); setTimeout(function () { window.open("https://www.instagram.com/", "_blank"); }, 700); }); return; }
    if (act === "photoscap") {
      Promise.all(P.imgs.slice(0, 6).map(function (u, i) { return fetchFile(u, p.slug + "-" + (i + 1)); }))
        .then(function (files) { return shareFiles(files, currentCaption(), p.name); }).catch(function () {});
      return;
    }
    if (act === "make") { makeImage(); return; }
    if (act === "saveimg") { if (P.blob) saveBlob(P.blob, p.slug + "-" + P.fmt + ".png"); return; }
    if (act === "shareimg") {
      if (!P.blob) return;
      shareFiles([new File([P.blob], p.slug + "-" + P.fmt + ".png", { type: "image/png" })], currentCaption(), p.name).catch(function () {});
      return;
    }
    if (act === "pick") {
      K.rpc("toggle_my_pick", { p_product: p.id }).then(function (on) {
        var i = K.S.picks.indexOf(p.id);
        if (on && i < 0) K.S.picks.push(p.id); if (!on && i > -1) K.S.picks.splice(i, 1);
        var b = el("pp-pick"); b.classList.toggle("solid", !!on); b.textContent = on ? PR.picked : "⭐ " + PR.pick;
      }).catch(function (e) { toast(/too_many/.test(String(e && e.message)) ? PR.tooMany : T.errors.generic); });
    }
  }

  // open from the Products tab (photo or "Promote" button)
  document.getElementById("app").addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-promote]");
    if (t) { ev.preventDefault(); open(t.dataset.promote); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && root) close(); });

  window.PartnerPromote = { drawCard: drawCard, captionFor: captionFor, priceText: priceText, open: open };
})();
