(function () {
  "use strict";
  window.__PARTNERS_OK = true;               // tells the page that this script started
  var CFG = window.__CFG || {};
  var T = CFG.T || {};
  var E = T.errors || {};
  var app = document.getElementById("app");
  var API = String(CFG.url || "").replace(/\/$/, "");
  var KEY = CFG.anon;
  var SKEY = "kampus_partner_session";

  var S = {
    tab: "overview", dash: null, userName: "",
    products: [], orders: [], payouts: [], wilayas: [], picks: [], clicks: [],
    msg: "", msgOk: false
  };
  var routing = false;

  // Google blocks sign-in inside the in-app browsers of Instagram / Facebook / TikTok...
  var inApp = /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Snapchat|Line\/|; wv\)/i.test(navigator.userAgent || "");
  var G_ICON = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

  // ---------- login session (kept in this browser; no external library needed) ----------
  var mem = null;
  function readSession() {
    if (mem) return mem;
    try { return JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) { return null; }
  }
  function writeSession(s) {
    mem = s;
    try { if (s) localStorage.setItem(SKEY, JSON.stringify(s)); else localStorage.removeItem(SKEY); } catch (e) {}
  }
  function nowSec() { return Math.floor(Date.now() / 1000); }

  async function getToken(force) {
    var s = readSession();
    if (!s) return null;
    if (!force && s.expires_at - nowSec() > 60) return s.access_token;
    if (!s.refresh_token) { writeSession(null); return null; }
    try {
      var r = await fetch(API + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      if (!r.ok) throw new Error("refresh");
      var j = await r.json();
      writeSession({
        access_token: j.access_token, refresh_token: j.refresh_token,
        expires_at: j.expires_at || nowSec() + (j.expires_in || 3600), user: j.user || s.user
      });
      return j.access_token;
    } catch (e) { writeSession(null); return null; }
  }

  function rawRest(path, opts, token) {
    return fetch(API + "/rest/v1/" + path, {
      method: opts.method || "GET",
      headers: { apikey: KEY, Authorization: "Bearer " + (token || KEY), "Content-Type": "application/json" },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
  }
  async function rest(path, opts) {
    opts = opts || {};
    var token = await getToken(false);
    var res = await rawRest(path, opts, token);
    if (res.status === 401 && token) { token = await getToken(true); res = await rawRest(path, opts, token); }
    var body = null;
    try { body = await res.json(); } catch (e) {}
    if (!res.ok) {
      var err = new Error((body && (body.message || body.msg)) || "HTTP " + res.status);
      err.status = res.status;
      throw err;
    }
    return body;
  }
  function rpc(name, args) { return rest("rpc/" + name, { method: "POST", body: args || {} }); }

  // coming back from Google: the login arrives in the address bar
  function takeOAuthResult() {
    var hp = new URLSearchParams(location.hash.replace(/^#/, ""));
    var qp = new URLSearchParams(location.search);
    var out = null;
    if (hp.get("access_token")) {
      out = {
        access_token: hp.get("access_token"), refresh_token: hp.get("refresh_token"),
        expires_at: nowSec() + (parseInt(hp.get("expires_in"), 10) || 3600)
      };
    } else if (hp.get("error") || qp.get("error")) {
      out = { error: hp.get("error_description") || qp.get("error_description") || "oauth" };
    }
    if (out) { try { history.replaceState(null, "", location.pathname); } catch (e) {} }
    return out;
  }
  function startGoogle() {
    var url = API + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(location.origin + "/partners");
    (window.__nav || function (u) { location.href = u; })(url);
  }

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " " + (T.currency || "DA");
  }
  function fill(str, o) {
    return String(str || "").replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ""; });
  }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2000);
  }
  function fmtDate(x) {
    var loc = CFG.lang === "ar" ? "ar-DZ-u-nu-latn" : CFG.lang === "fr" ? "fr-FR" : "en-GB";
    try { return new Date(x).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return ""; }
  }
  // find the first picture whatever the format of the "images" column
  function firstImage(images) {
    var found = "";
    (function walk(x, d) {
      if (found || x == null || d > 5) return;
      if (typeof x === "string") {
        var v = x.trim();
        if (v[0] === "[" || v[0] === "{") { try { return walk(JSON.parse(v), d + 1); } catch (e) {} }
        if (/^(https?:)?\/\//i.test(v) || v[0] === "/") found = v;
        return;
      }
      if (Array.isArray(x)) { x.forEach(function (y) { walk(y, d + 1); }); return; }
      if (typeof x === "object") {
        var keys = ["url", "src", "publicUrl", "image", "image_url", "original", "large", "full"];
        for (var i = 0; i < keys.length; i++) if (typeof x[keys[i]] === "string" && x[keys[i]]) return walk(x[keys[i]], d + 1);
        Object.keys(x).forEach(function (k) { walk(x[k], d + 1); });
      }
    })(images, 0);
    return found;
  }
  function errText(err) {
    var m = String((err && (err.message || err)) || "").toLowerCase();
    var keys = ["invalid_name", "invalid_phone", "invalid_wilaya"];
    for (var i = 0; i < keys.length; i++) if (m.indexOf(keys[i]) > -1) return E[keys[i]];
    return E.generic;
  }
  function linkFor(slug) {
    return CFG.store + "/p/" + encodeURIComponent(slug) + "?ref=" + encodeURIComponent(S.dash.promo_code);
  }
  function storeLink() { return CFG.store + "/?ref=" + encodeURIComponent(S.dash.promo_code); }
  function setLoggedIn(on) { document.getElementById("logout").hidden = !on; }

  // ---------- language buttons ----------
  document.querySelectorAll("[data-lang]").forEach(function (b) {
    b.addEventListener("click", function () {
      document.cookie = "lang=" + b.dataset.lang + "; path=/; max-age=31536000; SameSite=Lax";
      location.reload();
    });
  });

  // ---------- views ----------
  function msgHtml() {
    return S.msg ? '<p class="' + (S.msgOk ? "ok" : "error") + '">' + esc(S.msg) + "</p>" : "";
  }

  function viewAuth() {
    var tip = inApp
      ? '<div class="notice"><p>' + esc(T.inAppTip) + '</p><button class="mini" type="button" data-copy="' + esc(location.href.split("#")[0]) + '">' + esc(T.copyPage) + "</button></div>"
      : "";
    return '<section class="box auth center"><h1>' + esc(T.title) + '</h1><p class="muted">' + esc(T.tagline) + "</p>" +
      tip + msgHtml() +
      '<button id="google" class="gbtn" type="button">' + G_ICON + "<span>" + esc(T.google) + "</span></button></section>";
  }

  function viewRegister() {
    var opts = '<option value="">' + esc(T.chooseWilaya) + "</option>" +
      S.wilayas.map(function (w) { return '<option value="' + esc(w.id) + '">' + esc(w.name) + "</option>"; }).join("");
    return '<section class="box auth"><h1>' + esc(T.registerTitle) + '</h1><p class="muted">' + esc(T.registerHint) + "</p>" +
      '<form id="reg-form" class="form flat" novalidate>' +
        "<label>" + esc(T.name) + '<input name="name" autocomplete="name" value="' + esc(S.userName) + '" required></label>' +
        "<label>" + esc(T.phone) + '<input name="phone" type="tel" dir="ltr" autocomplete="tel" required></label>' +
        "<label>" + esc(T.wilaya) + '<select name="wilaya" required>' + opts + "</select></label>" +
        msgHtml() +
        '<button class="btn big" type="submit">' + esc(T.createBtn) + "</button></form></section>";
  }

  function viewInactive() { return '<section class="box center"><p>' + esc(T.inactive) + "</p></section>"; }

  function statBox(label, value, cls, hint) {
    return '<div class="stat ' + (cls || "") + '"><span>' + esc(label) + "</span><strong>" + value + "</strong>" +
      (hint ? "<small>" + esc(hint) + "</small>" : "") + "</div>";
  }

  function viewOverview() {
    var d = S.dash;
    var pays = S.payouts.length
      ? S.payouts.map(function (p) {
          return '<li><span>' + esc(fmtDate(p.paid_at)) + (p.method ? " · " + esc(p.method) : "") + "</span><b>" + money(p.amount_dzd) + "</b></li>";
        }).join("")
      : '<li class="muted">' + esc(T.noPayments) + "</li>";
    var PR = T.pr || {};
    var guideDone = false;
    try { guideDone = localStorage.getItem("kampus_guide_done") === "1"; } catch (e) {}
    var guide = guideDone || !PR.guide ? "" : '<div class="box guide"><h3>' + esc(PR.guideTitle) + "</h3><ol>" +
      PR.guide.map(function (g) { return "<li>" + esc(g) + "</li>"; }).join("") + '</ol><button type="button" class="mini solid" data-guide-close="1">' + esc(PR.gotIt) + "</button></div>";
    var tc = 0, to = 0;
    S.clicks.forEach(function (c) { tc += c.clicks || 0; to += c.orders || 0; });
    var myPage = CFG.store + "/a/" + d.promo_code;
    var pageBox = PR.myPage ? '<div class="box"><div class="kv"><span>' + esc(PR.myPage) + " — " + esc(PR.myPageHint) + '</span><b class="url" dir="ltr">' + esc(myPage) + "</b>" +
      '<button class="mini" type="button" data-copy="' + esc(myPage) + '">' + esc(T.copy) + "</button>" +
      '<button class="mini" type="button" data-share data-url="' + esc(myPage) + '" data-title="Kampus Store">' + esc(T.share) + "</button></div></div>" : "";
    return guide + '<div class="stats">' +
        statBox(T.balance, money(d.balance_dzd), "main", T.balanceHint) +
        statBox(T.pending, money(d.pending_dzd)) +
        statBox(T.earned, money(d.earned_dzd)) +
        statBox(T.paid, money(d.paid_dzd)) +
        statBox(T.ordersTotal, d.orders_total) +
        statBox(T.delivered, d.orders_delivered) +
      "</div>" +
      '<p class="muted small center">' + esc(fill(T.rate, { p: d.commission_percent })) + "</p>" +
      (PR.statsLine ? '<p class="muted small center">' + esc(fill(PR.statsLine, { c: tc, o: to })) + "</p>" : "") +
      '<div class="box"><div class="kv"><span>' + esc(T.yourCode) + '</span><b class="code" dir="ltr">' + esc(d.promo_code) + "</b>" +
        '<button class="mini" type="button" data-copy="' + esc(d.promo_code) + '">' + esc(T.copy) + "</button></div>" +
      '<div class="kv"><span>' + esc(T.yourLink) + '</span><b class="url" dir="ltr">' + esc(storeLink()) + "</b>" +
        '<button class="mini" type="button" data-copy="' + esc(storeLink()) + '">' + esc(T.copy) + "</button>" +
        '<button class="mini" type="button" data-share data-url="' + esc(storeLink()) + '" data-title="' + esc(fill(T.shareText, { name: "Kampus Store" })) + '">' + esc(T.share) + "</button></div></div>" +
      pageBox +
      '<div class="box"><h3>' + esc(T.payments) + '</h3><ul class="list">' + pays + "</ul></div>";
  }

  function viewProducts() {
    var list = S.products.slice().sort(function (a, b) { return b.earn_per_unit - a.earn_per_unit; });
    var cards = list.map(function (p) {
      var img = firstImage(p.images);
      var stockTxt = p.stock <= 0 ? T.outStock : p.stock <= 5 ? fill(T.lowStock, { n: p.stock }) : fill(T.inStock, { n: p.stock });
      var stockCls = p.stock <= 0 ? "out" : p.stock <= 5 ? "low" : "";
      var url = linkFor(p.slug);
      return '<article class="pcard" data-name="' + esc(String(p.name || "").toLowerCase()) + '">' +
        '<button type="button" class="pimg pbtn" data-promote="' + esc(p.slug) + '">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : "") + "</button>" +
        '<div class="pinfo"><h3>' + esc(p.name) + (S.picks.indexOf(p.id) > -1 ? ' <span title="My page">⭐</span>' : "") + "</h3>" +
          '<div class="muted small">' + esc(T.price) + ": " + money(p.sell_price) + "</div>" +
          '<div class="earn">' + esc(T.earnPer) + " <b>" + money(p.earn_per_unit) + "</b> " + esc(T.perSale) + "</div>" +
          '<div class="stock ' + stockCls + '">' + esc(stockTxt) +
            (p.stock > 0 && p.earn_per_unit > 0 ? " · " + esc(T.ifSoldAll) + ": <b>" + money(p.stock * p.earn_per_unit) + "</b>" : "") + "</div>" +
          '<div class="actions">' +
            '<button class="mini solid" type="button" data-promote="' + esc(p.slug) + '">📣 ' + esc((T.pr || {}).promote || "Promote") + "</button>" +
            '<button class="mini" type="button" data-copy="' + esc(url) + '">' + esc(T.copyLink) + "</button>" +
            '<button class="mini" type="button" data-share data-url="' + esc(url) + '" data-title="' + esc(fill(T.shareText, { name: p.name })) + '">' + esc(T.share) + "</button>" +
          "</div></div></article>";
    }).join("");
    return '<input id="pq" class="search" type="search" placeholder="' + esc(T.searchProducts) + '">' +
      '<div class="plist">' + (cards || '<p class="muted center">' + esc(T.noProducts) + "</p>") + "</div>";
  }

  function viewOrders() {
    if (!S.orders.length) return '<p class="muted center pad">' + esc(T.noOrders) + "</p>";
    var ST = T.stages || {}, steps = T.steps || [];
    var AT = { "new": 0, whatsapped: 1, sent: 2, no_answer: 2, wrong_number: 2, confirmed: 2, processing: 2, shipped: 3, delivered: 4 };
    return '<ul class="olist">' + S.orders.map(function (o) {
      var dead = o.bucket === "dead";
      var at = AT[o.stage] != null ? AT[o.stage] : 0;
      var bar = '<ol class="pstep' + (dead ? " dead" : "") + '">' + steps.map(function (s, i) {
        return '<li class="' + (!dead && i <= at ? "done" : "") + '"><i></i><span>' + esc(s) + "</span></li>";
      }).join("") + "</ol>";
      return '<li class="order ' + esc(o.bucket) + '">' +
        '<div class="o-top"><b>' + esc(o.product_name) + "</b><span> × " + esc(o.quantity) + "</span></div>" +
        '<div class="muted small">' + esc(o.buyer_first_name) + " · " + esc(o.buyer_wilaya) + " · " + esc(fmtDate(o.created_at)) + "</div>" +
        bar +
        '<div class="o-bot"><span class="pill ' + esc(o.bucket) + '">' + esc(ST[o.stage] || o.stage) + "</span>" +
        '<b class="com">' + money(o.commission_dzd) + "</b></div></li>";
    }).join("") + "</ul>";
  }

  function viewDash() {
    var tabs = [["overview", T.overview], ["products", T.products], ["orders", T.orders]];
    var body = S.tab === "products" ? viewProducts() : S.tab === "orders" ? viewOrders() : viewOverview();
    return '<div class="greet"><h1>' + esc(fill(T.hi, { name: S.dash.display_name })) + "</h1>" +
      '<button id="refresh" class="mini" type="button">↻ ' + esc(T.refresh) + "</button></div>" +
      '<nav class="seg tabs">' + tabs.map(function (t) {
        return '<button type="button" data-tab="' + t[0] + '" class="' + (S.tab === t[0] ? "on" : "") + '">' + esc(t[1]) + "</button>";
      }).join("") + "</nav>" + body;
  }

  function render(view) {
    var map = { auth: viewAuth, register: viewRegister, inactive: viewInactive, dash: viewDash };
    app.innerHTML = view === "loading" ? '<p class="muted center pad">' + esc(T.loading) + "</p>" : map[view]();
  }

  // ---------- data ----------
  async function loadWilayas() {
    if (S.wilayas.length) return;
    S.wilayas = (await rest("wilayas?select=id,name&order=id")) || [];
  }
  async function loadAll() {
    var soft = function () { return null; };
    var r = await Promise.all([
      rpc("get_my_dashboard"),
      rpc("get_my_products").catch(soft),
      rpc("get_my_orders").catch(soft),
      rest("advertiser_payouts?select=amount_dzd,method,paid_at&voided_at=is.null&order=paid_at.desc").catch(soft),
      rpc("get_my_picks").catch(soft),
      rpc("get_my_clicks").catch(soft)
    ]);
    if (r[0] && !r[0].inactive) S.dash = r[0];
    S.products = r[1] || [];
    S.orders = r[2] || [];
    S.payouts = r[3] || [];
    S.picks = (r[4] || []).map(function (x) { return x.product_id; });
    S.clicks = r[5] || [];
  }

  async function route() {
    if (routing) return;
    routing = true;
    try {
      var s = readSession();
      if (!s) { S.dash = null; setLoggedIn(false); render("auth"); return; }
      setLoggedIn(true);
      var meta = (s.user && s.user.user_metadata) || {};
      S.userName = meta.full_name || meta.name || "";
      render("loading");
      var d = await rpc("get_my_dashboard");
      if (!d) { await loadWilayas(); S.dash = null; render("register"); return; }
      if (d.inactive) { render("inactive"); return; }
      await loadAll();
      render("dash");
    } catch (e) {
      console.error(e);
      if (e && e.status === 401) { writeSession(null); setLoggedIn(false); render("auth"); }
      else app.innerHTML = '<p class="error center pad">' + esc(E.generic) + "</p>";
    } finally {
      routing = false;
    }
  }

  // tools for partners-promote.js
  window.PartnerKit = {
    CFG: CFG, T: T, S: S, esc: esc, money: money, fill: fill, toast: toast, rpc: rpc,
    linkFor: linkFor, storeLink: storeLink,
    reload: function () { return loadAll().then(function () { render("dash"); }); }
  };

  // ---------- events ----------
  app.addEventListener("click", function (ev) {
    var t = ev.target.closest("button");
    if (!t) return;
    if (t.id === "google") { t.disabled = true; startGoogle(); return; }
    if (t.dataset.tab) { S.tab = t.dataset.tab; render("dash"); return; }
    if (t.dataset.copy) {
      (navigator.clipboard ? navigator.clipboard.writeText(t.dataset.copy) : Promise.reject())
        .then(function () { toast(T.copied); })
        .catch(function () { window.prompt("", t.dataset.copy); });
      return;
    }
    if (t.hasAttribute("data-share")) {
      var url = t.dataset.url, title = t.dataset.title || "";
      if (navigator.share) navigator.share({ title: title, text: title, url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast(T.copied); });
      return;
    }
    if (t.dataset.guideClose) { try { localStorage.setItem("kampus_guide_done", "1"); } catch (e) {} render("dash"); return; }
    if (t.id === "refresh") { loadAll().then(function () { render("dash"); }).catch(function () {}); }
  });

  app.addEventListener("input", function (ev) {
    if (ev.target.id !== "pq") return;
    var term = ev.target.value.trim().toLowerCase();
    app.querySelectorAll(".pcard").forEach(function (c) { c.hidden = term && c.dataset.name.indexOf(term) === -1; });
  });

  app.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var f = ev.target;
    if (f.id !== "reg-form") return;
    var btn = f.querySelector("button[type=submit]");
    btn.disabled = true;
    S.msg = ""; S.msgOk = false;
    try {
      await rpc("register_advertiser", {
        p_name: f.elements.name.value, p_phone: f.elements.phone.value, p_wilaya: parseInt(f.elements.wilaya.value, 10)
      });
      await route();
    } catch (e) {
      S.msg = errText(e);
      S.userName = f.elements.name.value;
      render("register");
    }
  });

  document.getElementById("logout").addEventListener("click", function () {
    var s = readSession();
    if (s) fetch(API + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + s.access_token } }).catch(function () {});
    writeSession(null);
    S.dash = null; S.tab = "overview"; S.msg = "";
    route();
  });

  // ---------- start ----------
  (async function init() {
    var r = takeOAuthResult();
    if (r && r.error) {
      S.msg = E.oauth || E.generic;
    } else if (r && r.access_token) {
      render("loading");
      try {
        var ur = await fetch(API + "/auth/v1/user", { headers: { apikey: KEY, Authorization: "Bearer " + r.access_token } });
        if (ur.ok) r.user = await ur.json();
      } catch (e) {}
      writeSession(r);
    }
    route();
  })();
})();
