(function () {
  var T = window.__T || {};
  var KEY = "ks_ref";

  // ---------- language buttons (AR / FR / EN) ----------
  document.querySelectorAll("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.cookie = "lang=" + b.dataset.lang + "; path=/; max-age=31536000; SameSite=Lax";
      location.reload();
    });
  });

  // ---------- remember which advertiser sent the visitor (30 days) ----------
  try {
    var p = new URLSearchParams(location.search).get("ref");
    if (p) {
      p = p.trim().toUpperCase().slice(0, 30);
      if (/^[A-Z0-9_-]{2,30}$/.test(p)) localStorage.setItem(KEY, JSON.stringify({ c: p, e: Date.now() + 30 * 864e5 }));
    }
  } catch (e) {}
  function getRef() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || "null");
      if (o && o.e > Date.now()) return o.c;
    } catch (e) {}
    return "";
  }

  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2200);
  }

  // ---------- share buttons (cards + product page) ----------
  document.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-share]");
    if (!btn) return;
    ev.preventDefault();
    var url = location.origin + btn.getAttribute("data-url");
    var ref = getRef();
    if (ref) url += "?ref=" + encodeURIComponent(ref);
    var title = btn.getAttribute("data-title") || document.title;
    if (navigator.share) {
      navigator.share({ title: title, text: title, url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { toast(T.linkCopied); });
    } else {
      window.prompt("Link:", url);
    }
  });

  // ---------- home page: search + category filter ----------
  var q = document.getElementById("q");
  if (q) {
    var cards = [].slice.call(document.querySelectorAll(".card"));
    var chips = [].slice.call(document.querySelectorAll(".chip"));
    var empty = document.getElementById("empty");
    var cat = "";
    var apply = function () {
      var term = q.value.trim().toLowerCase(), shown = 0;
      cards.forEach(function (c) {
        var ok = (!term || c.dataset.name.indexOf(term) > -1) && (!cat || c.dataset.cat === cat);
        c.hidden = !ok;
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    };
    q.addEventListener("input", apply);
    chips.forEach(function (ch) {
      ch.addEventListener("click", function () {
        chips.forEach(function (x) { x.classList.remove("on"); });
        ch.classList.add("on");
        cat = ch.dataset.cat;
        apply();
      });
    });
  }

  // ---------- product page: back button ----------
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-back]");
    if (!b) return;
    ev.preventDefault();
    var fromStore = false;
    try { fromStore = document.referrer && new URL(document.referrer).origin === location.origin; } catch (e) {}
    if (fromStore && history.length > 1) history.back(); else location.href = "/";
  });

  // ---------- product page: swipe gallery ----------
  var slider = document.getElementById("slider");
  if (slider) {
    var dots = [].slice.call(document.querySelectorAll("#dots span"));
    var thumbs = [].slice.call(document.querySelectorAll("#thumbs img"));
    var mark = function (i) {
      dots.forEach(function (d, k) { d.classList.toggle("on", k === i); });
      thumbs.forEach(function (t, k) { t.classList.toggle("on", k === i); });
    };
    slider.addEventListener("scroll", function () {
      mark(Math.round(slider.scrollLeft / (slider.clientWidth || 1)));
    }, { passive: true });
    thumbs.forEach(function (t) {
      t.addEventListener("click", function () {
        var i = parseInt(t.dataset.idx, 10) || 0;
        slider.scrollTo({ left: i * slider.clientWidth, behavior: "smooth" });
        mark(i);
      });
    });
  }

  // ---------- product page: order form ----------
  var form = document.getElementById("order-form");
  if (!form) return;
  var price = Number(form.dataset.price) || 0;
  var wil = form.elements.wilaya, com = form.elements.commune, qty = form.elements.qty;
  var totalEl = document.getElementById("total");
  var errEl = document.getElementById("form-error");
  form.elements.promo.value = getRef();

  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " " + (T.currency || "DA"); }
  qty.addEventListener("input", function () {
    totalEl.textContent = fmt(price * (parseInt(qty.value, 10) || 1));
  });

  function opt(value, text) {
    var o = document.createElement("option");
    o.value = value; o.textContent = text;
    return o;
  }
  wil.addEventListener("change", function () {
    com.innerHTML = "";
    com.appendChild(opt("", T.chooseCommune));
    com.disabled = true;
    if (!wil.value) return;
    fetch("/api/communes?wilaya=" + encodeURIComponent(wil.value))
      .then(function (r) { return r.json(); })
      .then(function (list) {
        list.forEach(function (c) { com.appendChild(opt(c.name, c.name)); });
        com.disabled = false;
      })
      .catch(function () { com.disabled = false; });
  });

  function showError(code) {
    var E = T.errors || {};
    errEl.textContent = E[code] || E.server || "Error";
    errEl.hidden = false;
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    errEl.hidden = true;
    var btn = form.querySelector("button[type=submit]");
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = T.sending;
    var body = {
      product_id: form.dataset.product,
      name: form.elements.name.value,
      phone: form.elements.phone.value,
      wilaya: wil.value,
      commune: com.value,
      address: form.elements.address.value,
      qty: qty.value,
      promo: form.elements.promo.value,
      website: form.elements.website.value
    };
    fetch("/api/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d.ok) {
          form.hidden = true;
          document.getElementById("order-ref").textContent = res.d.ref;
          document.getElementById("thanks").hidden = false;
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          showError(res.d && res.d.error);
          btn.disabled = false; btn.textContent = label;
        }
      })
      .catch(function () { showError("server"); btn.disabled = false; btn.textContent = label; });
  });
})();
