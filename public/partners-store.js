(function () {
  "use strict";
  var K = window.PartnerKit;
  if (!K) return;
  var CFG = K.CFG, T = K.T, ST = T.st || {}, esc = K.esc, toast = K.toast;
  var THEMES = CFG.themes || {};
  var E = null;          // editor state (kept while you move between tabs)
  var root = null;       // where the editor is drawn
  var slugTimer = null;

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
    return out;
  }
  function thumb(p) { var u = allImages(p.images)[0]; return u ? "/api/img?u=" + encodeURIComponent(u) : ""; }
  function productById(id) { return K.S.products.filter(function (p) { return p.id === id; })[0]; }
  function slugify(v) { return String(v || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-").slice(0, 30); }
  function storeUrl() { return CFG.store + "/s/" + E.f.slug; }
  function snap() { return JSON.stringify({ f: E.f, ids: E.ids }); }
  function dirty() { return snap() !== E.snap; }
  function errText(e) {
    var m = String((e && e.message) || e), Er = ST.errors || {};
    var keys = ["reserved_name", "slug_taken", "bad_slug", "bad_name", "bad_social", "bad_logo", "too_many"];
    for (var i = 0; i < keys.length; i++) if (m.indexOf(keys[i]) > -1) return Er[keys[i]];
    return Er.generic || T.errors.generic;
  }
  function $(id) { return root && root.querySelector("#" + id); }

  // ---------- load ----------
  function load() {
    return K.rpc("get_my_store").then(function (s) {
      var d = K.S.dash || {};
      E = {
        isNew: !s,
        f: s ? {
          name: s.name || "", slug: s.slug || "", tagline: s.tagline || "", logo_url: s.logo_url || "", theme: s.theme || "ocean",
          announcement: s.announcement || "", instagram: s.instagram || "", tiktok: s.tiktok || "", facebook: s.facebook || "", chat: !!s.chat_whatsapp
        } : {
          name: d.display_name || "", slug: slugify(d.promo_code), tagline: "", logo_url: "", theme: "ocean",
          announcement: "", instagram: "", tiktok: "", facebook: "", chat: false
        },
        ids: (K.S.picks || []).slice(), slugState: s ? "ok" : "", busy: false, upBusy: false, oldLogos: [], live: false
      };
      E.snap = s ? snap() : "";
      if (!s) checkSlug();
    });
  }

  // ---------- the screen ----------
  function sectionHtml() {
    var f = E.f, th = THEMES;
    var swatches = Object.keys(th).map(function (k) {
      var nm = (th[k].name || {})[CFG.lang] || k;
      return '<button type="button" class="sw' + (f.theme === k ? " on" : "") + '" data-st="theme" data-v="' + k + '" title="' + esc(nm) + '" style="--h:' + th[k].head + ";--s:" + th[k].strong + '"><i></i><span>' + esc(nm) + "</span></button>";
    }).join("");
    return '<div class="stgrid"><div class="stform">' +
      (E.isNew ? '<section class="pbox"><h3>' + esc(ST.createTitle) + '</h3><p class="muted small">' + esc(ST.createHint) + "</p></section>" : '<section class="pbox livebox" id="st-live"></section>') +

      '<section class="pbox"><label class="fl">' + esc(ST.name) + '<input id="st-name" maxlength="40" placeholder="' + esc(ST.namePh) + '" value="' + esc(f.name) + '"></label>' +
        '<label class="fl">' + esc(ST.link) + '<div class="slugrow" dir="ltr"><span>' + esc(hostOnly()) + '/s/</span><input id="st-slug" maxlength="30" value="' + esc(f.slug) + '" autocapitalize="none" autocomplete="off"></div></label>' +
        '<p class="small" id="st-slug-state"></p><p class="muted small">' + esc(ST.linkHint) + "</p>" +
        '<label class="fl">' + esc(ST.tagline) + '<input id="st-tag" maxlength="90" placeholder="' + esc(ST.taglinePh) + '" value="' + esc(f.tagline) + '"></label></section>' +

      '<section class="pbox"><h3>' + esc(ST.logo) + '</h3><div class="logorow"><div id="st-logo-prev" class="lprev"></div><div class="oact">' +
        '<label class="mini solid filebtn"><span id="st-logo-label"></span><input id="st-logo-file" type="file" accept="image/*" hidden></label>' +
        '<button type="button" class="mini" data-st="logo-remove" id="st-logo-remove">' + esc(ST.logoRemove) + "</button></div></div>" +
        '<p class="muted small" id="st-logo-msg">' + esc(ST.logoHint) + "</p></section>" +

      '<section class="pbox"><h3>' + esc(ST.colors) + '</h3><div class="swatches" id="st-themes">' + swatches + "</div></section>" +

      '<section class="pbox"><label class="fl">' + esc(ST.announce) + '<input id="st-ann" maxlength="100" placeholder="' + esc(ST.announcePh) + '" value="' + esc(f.announcement) + '"></label></section>' +

      '<section class="pbox"><h3>' + esc(ST.social) + '</h3>' +
        '<label class="fl">' + esc(ST.instagram) + '<input id="st-ig" dir="ltr" maxlength="60" placeholder="' + esc(ST.handlePh) + '" value="' + esc(f.instagram) + '"></label>' +
        '<label class="fl">' + esc(ST.tiktok) + '<input id="st-tt" dir="ltr" maxlength="60" placeholder="' + esc(ST.handlePh) + '" value="' + esc(f.tiktok) + '"></label>' +
        '<label class="fl">' + esc(ST.facebook) + '<input id="st-fb" dir="ltr" maxlength="60" placeholder="' + esc(ST.handlePh) + '" value="' + esc(f.facebook) + '"></label>' +
        '<label class="chk"><input id="st-chat" type="checkbox"' + (f.chat ? " checked" : "") + "> " + esc(ST.chat) + "</label></section>" +

      '<section class="pbox"><h3>' + esc(ST.products) + '</h3><p class="muted small">' + esc(ST.productsHint) + '</p><div id="st-prods"></div></section>' +
      "</div>" +
      '<aside class="stprev"><h3>' + esc(ST.preview) + '</h3><div class="phone" id="st-preview"></div></aside></div>' +
      '<div class="stbar"><span id="st-dirty" class="small"></span><button type="button" class="mini" data-st="goprev">' + esc(ST.goPreview) + '</button><button type="button" class="btn" id="st-publish" data-st="publish"></button></div>';
  }
  function hostOnly() { try { return new URL(CFG.store).host; } catch (e) { return CFG.store; } }

  function render() {
    if (!root) return;
    root.innerHTML = '<p class="muted small">' + esc(ST.intro) + "</p>" + sectionHtml();
    document.body.classList.add("has-stbar");   // lifts the WhatsApp help button above the Publish bar
    bind();
    paintAll();
  }

  function paintAll() {
    paintLogo(); paintProducts(); paintPreview(); paintStatus(); paintLive(); paintSlugState();
  }

  function paintLogo() {
    var prev = $("st-logo-prev"); if (!prev) return;
    prev.innerHTML = E.f.logo_url ? '<img src="' + esc(E.f.logo_url) + '" alt="">' : '<span>' + esc((E.f.name || "?").slice(0, 1).toUpperCase()) + "</span>";
    $("st-logo-label").textContent = E.upBusy ? ST.logoWorking : (E.f.logo_url ? ST.logoChange : ST.logoUpload);
    $("st-logo-remove").hidden = !E.f.logo_url;
  }

  function paintStatus() {
    var d = $("st-dirty"), b = $("st-publish"); if (!d) return;
    var isDirty = dirty() || E.isNew;
    d.textContent = E.busy ? "" : (isDirty ? ST.unsaved : ST.saved);
    d.className = "small " + (isDirty ? "warn" : "okc");
    b.textContent = E.busy ? ST.publishing : ST.publish;
    b.disabled = E.busy || E.upBusy || !isDirty;
  }

  function paintLive() {
    var el = $("st-live"); if (!el) return;
    el.innerHTML = "<h3>" + esc(ST.live) + '</h3><div class="linkrow"><b dir="ltr">' + esc(storeUrl()) + "</b></div>" +
      '<div class="oact"><button class="mini solid" type="button" data-st="copy">' + esc(T.copy) + '</button><button class="mini" type="button" data-st="share">' + esc(T.share) + '</button><a class="mini" href="' + esc(storeUrl()) + '" target="_blank" rel="noopener">' + esc(ST.open) + "</a></div>";
  }

  function paintSlugState() {
    var el = $("st-slug-state"); if (!el) return;
    var s = E.slugState, map = { ok: ST.ok, taken: ST.taken, invalid: ST.invalid, reserved: ST.reserved, checking: ST.checking };
    el.textContent = map[s] || "";
    el.className = "small " + (s === "ok" ? "okc" : s === "checking" || !s ? "muted" : "warn");
  }
  function checkSlug() {
    var s = E.f.slug;
    if (!s) { E.slugState = "invalid"; paintSlugState(); return; }
    E.slugState = "checking"; paintSlugState();
    clearTimeout(slugTimer);
    slugTimer = setTimeout(function () {
      K.rpc("check_store_slug", { p_slug: s }).then(function (r) {
        if (E.f.slug === s) { E.slugState = r; paintSlugState(); paintStatus(); }
      }).catch(function () { if (E.f.slug === s) { E.slugState = ""; paintSlugState(); } });
    }, 400);
  }

  // ---------- products: pick + drag to order ----------
  function paintProducts() {
    var box = $("st-prods"); if (!box) return;
    var inIds = E.ids.filter(function (id) { return productById(id); });
    var out = K.S.products.filter(function (p) { return E.ids.indexOf(p.id) < 0; });
    var sel = inIds.map(function (id) {
      var p = productById(id), t = thumb(p);
      return '<li class="sitem" data-id="' + esc(id) + '"><span class="dh" title="drag">≡</span>' + (t ? '<img src="' + esc(t) + '" alt="">' : '<span class="noimg"></span>') +
        '<b>' + esc(p.name) + '</b><span class="rowbtns"><button type="button" class="ib" data-st="up" data-id="' + esc(id) + '" title="' + esc(ST.up) + '">▲</button><button type="button" class="ib" data-st="down" data-id="' + esc(id) + '" title="' + esc(ST.down) + '">▼</button><button type="button" class="ib x" data-st="remove" data-id="' + esc(id) + '" title="' + esc(ST.remove) + '">✕</button></span></li>';
    }).join("");
    var rest = out.map(function (p) {
      var t = thumb(p);
      return '<li class="sitem off" data-id="' + esc(p.id) + '">' + (t ? '<img src="' + esc(t) + '" alt="">' : '<span class="noimg"></span>') + "<b>" + esc(p.name) + '</b><button type="button" class="mini solid" data-st="add" data-id="' + esc(p.id) + '">+ ' + esc(ST.add) + "</button></li>";
    }).join("");
    box.innerHTML = '<h4>' + esc(ST.inStore) + " (" + inIds.length + ')</h4><ul class="sortlist" id="st-sel">' + sel + "</ul>" +
      (rest ? "<h4>" + esc(ST.notInStore) + '</h4><ul class="sortlist">' + rest + "</ul>" : "");
    bindDrag();
  }

  var drag = null;
  function bindDrag() {
    var list = $("st-sel"); if (!list) return;
    list.addEventListener("pointerdown", function (e) {
      var h = e.target.closest(".dh"); if (!h) return;
      e.preventDefault();
      var item = h.closest(".sitem");
      drag = { item: item };
      item.classList.add("dragging");
      try { h.setPointerCapture(e.pointerId); } catch (err) {}
    });
    list.addEventListener("pointermove", function (e) {
      if (!drag) return;
      if (e.clientY < 70) window.scrollBy(0, -14); else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
      var others = [].slice.call(list.children).filter(function (x) { return x !== drag.item; });
      for (var i = 0; i < others.length; i++) {
        var r = others[i].getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          list.insertBefore(drag.item, e.clientY < r.top + r.height / 2 ? others[i] : others[i].nextSibling);
          break;
        }
      }
    });
    function end() {
      if (!drag) return;
      drag.item.classList.remove("dragging");
      E.ids = [].slice.call(list.children).map(function (x) { return x.dataset.id; });
      drag = null;
      changed(true);
    }
    list.addEventListener("pointerup", end);
    list.addEventListener("pointercancel", end);
  }
  function move(id, dir) {
    var i = E.ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= E.ids.length) return;
    E.ids.splice(j, 0, E.ids.splice(i, 1)[0]);
    paintProducts(); changed(true);
  }

  // ---------- preview (a small phone) ----------
  function paintPreview() {
    var el = $("st-preview"); if (!el) return;
    var f = E.f, th = THEMES[f.theme] || THEMES.ocean || { head: "#3e7bfa", headInk: "#0e0f11", strong: "#2563eb" };
    var ids = E.ids.length ? E.ids : K.S.products.map(function (p) { return p.id; });
    var tiles = ids.slice(0, 4).map(function (id) {
      var p = productById(id); if (!p) return "";
      var t = thumb(p);
      return '<div class="tile">' + (t ? '<img src="' + esc(t) + '" alt="">' : '<div class="noimg big"></div>') + "<b>" + esc(p.name) + '</b><span style="color:' + th.strong + '">' + esc(K.money(p.sell_price)) + "</span></div>";
    }).join("");
    var socials = [f.instagram && "Instagram", f.tiktok && "TikTok", f.facebook && "Facebook"].filter(Boolean);
    if (f.chat) socials.unshift("💬 WhatsApp");
    el.innerHTML = '<div class="pv-head" style="background:' + th.head + ";color:" + th.headInk + '">' +
        (f.logo_url ? '<img src="' + esc(f.logo_url) + '" alt="">' : "") + "<b>" + esc(f.name || "…") + "</b></div>" +
      (f.announcement ? '<div class="pv-ann">' + esc(f.announcement) + "</div>" : "") +
      '<div class="pv-hero">' + (f.logo_url ? '<img class="pv-logo" src="' + esc(f.logo_url) + '" alt="">' : "") + "<h4>" + esc(f.name || "…") + "</h4>" + (f.tagline ? "<p>" + esc(f.tagline) + "</p>" : "") +
        (socials.length ? '<div class="pv-soc">' + socials.map(function (s) { return "<i>" + esc(s) + "</i>"; }).join("") + "</div>" : "") + "</div>" +
      '<div class="pv-grid">' + tiles + "</div>" +
      (E.ids.length ? "" : '<p class="pv-note">' + esc(ST.previewEmpty) + "</p>") +
      '<div class="pv-foot">Powered by Kampus Store</div>';
  }

  // one change happened: refresh the preview and the "unsaved" line
  function changed(structural) {
    paintPreview(); paintStatus();
    if (structural) { /* lists already repainted by the caller */ }
  }

  // ---------- logo: shrink on the phone, then upload ----------
  function squareBlob(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var S = 512, c = document.createElement("canvas"); c.width = S; c.height = S;
        var ctx = c.getContext("2d"), m = Math.min(im.width, im.height);
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, S, S);
        ctx.drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, S, S);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b && b.type === "image/webp") return res(b);
          c.toBlob(function (j) { j ? res(j) : rej(new Error("blob")); }, "image/jpeg", 0.88);
        }, "image/webp", 0.88);
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error("image")); };
      im.src = url;
    });
  }
  function pathOf(url) { var m = String(url || "").match(/\/storage\/v1\/object\/public\/store-assets\/(.+)$/); return m ? m[1] : null; }
  function uploadLogo(file) {
    E.upBusy = true; paintLogo(); paintStatus(); $("st-logo-msg").textContent = ST.logoWorking;
    var uid = K.userId();
    return squareBlob(file).then(function (blob) {
      var ext = blob.type.indexOf("webp") > -1 ? "webp" : blob.type.indexOf("png") > -1 ? "png" : "jpg";
      var path = uid + "/logo-" + Date.now() + "." + ext;
      return K.getToken(false).then(function (token) {
        return fetch(K.API + "/storage/v1/object/store-assets/" + path, {
          method: "POST", headers: { apikey: K.KEY, Authorization: "Bearer " + token, "Content-Type": blob.type, "x-upsert": "true" }, body: blob
        });
      }).then(function (r) {
        if (!r.ok) throw new Error("upload " + r.status);
        if (E.f.logo_url) E.oldLogos.push(E.f.logo_url);
        E.f.logo_url = K.API + "/storage/v1/object/public/store-assets/" + path;
      });
    }).then(function () { $("st-logo-msg").textContent = ST.logoHint; })
      .catch(function () { $("st-logo-msg").textContent = ST.logoFail; toast(ST.logoFail); })
      .then(function () { E.upBusy = false; paintLogo(); paintPreview(); paintStatus(); });
  }
  function dropOldLogos() {
    var uid = K.userId(), keep = pathOf(E.f.logo_url);
    var old = E.oldLogos.splice(0);
    old.forEach(function (u) {
      var p = pathOf(u);
      if (!p || p === keep || p.indexOf(uid + "/") !== 0) return;
      K.getToken(false).then(function (token) {
        return fetch(K.API + "/storage/v1/object/store-assets/" + p, { method: "DELETE", headers: { apikey: K.KEY, Authorization: "Bearer " + token } });
      }).catch(function () {});
    });
  }

  // ---------- publish ----------
  function publish() {
    if (E.busy || E.upBusy) return;
    var f = E.f;
    if (E.slugState && E.slugState !== "ok") { toast(({ taken: ST.errors.slug_taken, invalid: ST.errors.bad_slug, reserved: ST.errors.reserved_name }[E.slugState]) || ST.checking); return; }
    E.busy = true; paintStatus();
    K.rpc("save_my_store", {
      p_name: f.name, p_slug: f.slug, p_tagline: f.tagline || null, p_logo_url: f.logo_url || null, p_theme: f.theme,
      p_announcement: f.announcement || null, p_instagram: f.instagram || null, p_tiktok: f.tiktok || null, p_facebook: f.facebook || null, p_chat: !!f.chat
    }).then(function () { return K.rpc("save_my_picks", { p_ids: E.ids }); })
      .then(function () {
        K.S.picks = E.ids.slice();
        E.isNew = false; E.snap = snap(); E.busy = false;
        dropOldLogos();
        toast(ST.live);
        render();
        window.scrollTo(0, 0);
      })
      .catch(function (e) { E.busy = false; paintStatus(); toast(errText(e)); });
  }

  // ---------- events ----------
  function bind() {
    var map = { "st-name": "name", "st-tag": "tagline", "st-ann": "announcement", "st-ig": "instagram", "st-tt": "tiktok", "st-fb": "facebook" };
    Object.keys(map).forEach(function (id) {
      var el = $(id);
      el.addEventListener("input", function () {
        E.f[map[id]] = el.value;
        if (id === "st-name") paintLogo();
        changed();
      });
    });
    var slug = $("st-slug");
    slug.addEventListener("input", function () {
      var v = slugify(slug.value);
      if (v !== slug.value) slug.value = v;
      E.f.slug = v; checkSlug(); changed();
    });
    $("st-chat").addEventListener("change", function () { E.f.chat = $("st-chat").checked; changed(); });
    $("st-logo-file").addEventListener("change", function (e) { var fl = e.target.files && e.target.files[0]; if (fl) uploadLogo(fl); e.target.value = ""; });

    root.onclick = function (ev) {
      var t = ev.target.closest("[data-st]"); if (!t) return;
      var a = t.dataset.st, id = t.dataset.id;
      if (a === "theme") {
        E.f.theme = t.dataset.v;
        root.querySelectorAll(".sw").forEach(function (b) { b.classList.toggle("on", b.dataset.v === E.f.theme); });
        changed();
      } else if (a === "logo-remove") { E.f.logo_url = ""; paintLogo(); changed(); }
      else if (a === "add") {
        if (E.ids.length >= 30) { toast(ST.errors.too_many); return; }
        E.ids.push(id); paintProducts(); changed(true);
      }
      else if (a === "remove") { E.ids.splice(E.ids.indexOf(id), 1); paintProducts(); changed(true); }
      else if (a === "up") move(id, -1);
      else if (a === "down") move(id, 1);
      else if (a === "publish") publish();
      else if (a === "goprev") { var pv = $("st-preview"); if (pv) pv.scrollIntoView({ behavior: "smooth", block: "center" }); }
      else if (a === "copy") {
        (navigator.clipboard ? navigator.clipboard.writeText(storeUrl()) : Promise.reject()).then(function () { toast(T.copied); }).catch(function () { window.prompt("", storeUrl()); });
      } else if (a === "share") {
        if (navigator.share) navigator.share({ title: E.f.name, text: E.f.name, url: storeUrl() }).catch(function () {});
        else if (navigator.clipboard) navigator.clipboard.writeText(storeUrl()).then(function () { toast(T.copied); });
      }
    };
  }

  window.PartnerStore = {
    mount: function (el) {
      root = el;
      if (!root) return;
      if (E) {
        if (!dirty() && !E.isNew) { E.ids = (K.S.picks || []).slice(); E.snap = snap(); }   // picked something in the Promote screen meanwhile
        render(); return;
      }
      root.innerHTML = '<p class="muted center pad">' + esc(T.loading) + "</p>";
      load().then(function () { if (document.body.contains(root)) render(); }).catch(function () {
        root.innerHTML = '<p class="error center pad">' + esc(T.errors.generic) + "</p>";
      });
    }
  };
})();
