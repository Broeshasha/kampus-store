(function () {
  "use strict";
  window.__ADMIN_OK = true;                  // tells the page that this script started
  var CFG = window.__CFG || {};
  var app = document.getElementById("app");
  var API = String(CFG.url || "").replace(/\/$/, "");
  var KEY = CFG.anon;
  var SKEY = "kampus_admin_session";

  var S = {
    tab: "orders", group: "all", q: "", orders: [], counts: {}, me: "", busy: {},
    loadedOnce: false, waLang: "fr", dz: null, dzMsg: ""
  };
  try { S.waLang = localStorage.getItem("kampus_wa_lang") || "fr"; } catch (e) {}
  var routing = false, timer = null, syncTimer = null;

  var G_ICON = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';

  // ---------- login session (same method as the partners site) ----------
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
        method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      if (!r.ok) throw new Error("refresh");
      var j = await r.json();
      writeSession({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || nowSec() + (j.expires_in || 3600), user: j.user || s.user });
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

  // calls to our own server (the part that talks to DropDZ)
  async function server(path, body, method) {
    method = method || (body ? "POST" : "GET");
    var go = function (token) {
      return fetch("/api/admin/" + path, {
        method: method,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: method === "POST" ? JSON.stringify(body || {}) : undefined
      });
    };
    var token = await getToken(false);
    var res = await go(token);
    if (res.status === 401) { token = await getToken(true); if (token) res = await go(token); }
    var data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) { var err = new Error(data.message || data.error || "Error " + res.status); err.status = res.status; throw err; }
    return data;
  }

  function takeOAuthResult() {
    var hp = new URLSearchParams(location.hash.replace(/^#/, ""));
    var qp = new URLSearchParams(location.search);
    var out = null;
    if (hp.get("access_token")) {
      out = { access_token: hp.get("access_token"), refresh_token: hp.get("refresh_token"), expires_at: nowSec() + (parseInt(hp.get("expires_in"), 10) || 3600) };
    } else if (hp.get("error") || qp.get("error")) {
      out = { error: true };
    }
    if (out) { try { history.replaceState(null, "", location.pathname); } catch (e) {} }
    return out;
  }
  function startGoogle() {
    var url = API + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(location.origin + "/admin");
    (window.__nav || function (u) { location.href = u; })(url);
  }

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " DA"; }
  function toast(msg, bad) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, bad ? 5000 : 2200);
  }
  function ago(ts) {
    var s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m";
    if (s < 86400) return Math.round(s / 3600) + "h";
    return Math.round(s / 86400) + "d";
  }
  function hm(ts) {
    try { return new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
  }
  function find(id) { return S.orders.filter(function (o) { return o.id === id; })[0]; }

  var STAGE_LABEL = {
    new: "To contact", whatsapped: "WhatsApped", sent: "Sent to DropDZ", confirmed: "Confirmed by agent",
    no_answer: "Not answering", wrong_number: "Wrong number", processing: "In preparation",
    shipped: "Shipped", delivered: "Delivered", returned: "Returned", cancelled: "Cancelled"
  };
  var STAGE_TONE = {
    new: "amber", whatsapped: "blue", sent: "blue", confirmed: "blue", processing: "blue", shipped: "blue",
    delivered: "green", no_answer: "red", wrong_number: "red", returned: "red", cancelled: "grey"
  };
  var ORDER = { new: 0, whatsapped: 1, sent: 2, no_answer: 2, wrong_number: 2, confirmed: 3, processing: 3, shipped: 4, delivered: 5 };
  var STEPS = ["Received", "WhatsApped", "API sent", "Confirmed", "Shipped", "Delivered"];

  // ---------- WhatsApp message (3 languages) ----------
  function waText(o) {
    var total = money((o.unit_price_dzd || 0) * (o.quantity || 1));
    var n = String(o.buyer_full_name || "").split(" ")[0];
    var p = o.product_name || "";
    var T = {
      fr: "Bonjour " + n + " 👋 C'est Kampus Store. Vous avez commandé " + p + " × " + o.quantity + " (" + total + "). Pouvez-vous confirmer votre commande et votre adresse (" + o.buyer_commune + ", " + o.buyer_wilaya + ") ? Merci !",
      en: "Hello " + n + " 👋 This is Kampus Store. You ordered " + p + " × " + o.quantity + " (" + total + "). Can you confirm your order and your address (" + o.buyer_commune + ", " + o.buyer_wilaya + ")? Thank you!",
      ar: "مرحبًا " + n + " 👋 معك Kampus Store. لقد طلبت " + p + " × " + o.quantity + " (" + total + "). هل تؤكد طلبك وعنوانك (" + o.buyer_commune + "، " + o.buyer_wilaya + ")؟ شكرًا لك!"
    };
    return T[S.waLang] || T.fr;
  }
  function waLink(o) {
    var phone = String(o.buyer_phone || "").replace(/\D/g, "").replace(/^0/, "213");
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(waText(o));
  }

  // ---------- views ----------
  function viewAuth(msg) {
    return '<section class="abox center"><h1>Admin</h1><p class="muted">Sign in with the Google account of an admin.</p>' +
      (msg ? '<p class="error">' + esc(msg) + "</p>" : "") +
      '<button id="google" class="gbtn" type="button">' + G_ICON + "<span>Continue with Google</span></button></section>";
  }
  function viewNoAccess() {
    return '<section class="abox center"><h1>No access</h1><p class="muted">This Google account is not an admin. Ask the owner to switch <b>is_admin</b> on for your profile.</p></section>';
  }

  function stepper(o) {
    var at = ORDER[o.stage] != null ? ORDER[o.stage] : 0;
    var dead = o.stage === "cancelled" || o.stage === "returned";
    var tips = [hm(o.created_at), o.whatsapped_at ? hm(o.whatsapped_at) + (o.whatsapped_by_name ? " · " + o.whatsapped_by_name : "") : "", o.sent_at ? hm(o.sent_at) + (o.sent_by_name ? " · " + o.sent_by_name : "") : "", "", "", o.delivered_at ? hm(o.delivered_at) : ""];
    return '<ol class="steps' + (dead ? " dead" : "") + '">' + STEPS.map(function (s, i) {
      var done = !dead && i <= at;
      return '<li class="' + (done ? "done" : "") + (!dead && i === at ? " now" : "") + '"><i></i><span>' + esc(s) + "</span>" + (done && tips[i] ? "<small>" + esc(tips[i]) + "</small>" : "") + "</li>";
    }).join("") + "</ol>";
  }

  function orderCard(o) {
    var busy = S.busy[o.id];
    var open = o.stage === "new" || o.stage === "whatsapped";
    var finished = o.stage === "delivered" || o.stage === "returned" || o.stage === "cancelled";
    var wa = '<button class="abtn wa' + (o.whatsapped_at ? " done" : "") + '" type="button" data-act="wa" data-id="' + esc(o.id) + '">' +
      (o.whatsapped_at ? "✓ WhatsApped" : "💬 WhatsApp") + "</button>";
    var api = open
      ? '<button class="abtn api" type="button" data-act="send" data-id="' + esc(o.id) + '"' + (busy ? " disabled" : "") + ">" + (busy === "send" ? "Sending…" : "📤 Call API") + "</button>"
      : (o.dropdz_order_number ? '<span class="sentchip">✓ Sent · ' + esc(o.dropdz_order_number) + "</span>" : "");
    var cancel = !finished ? '<button class="abtn ghost" type="button" data-act="cancel" data-id="' + esc(o.id) + '"' + (busy ? " disabled" : "") + ">✕ Cancel</button>" : "";
    var refresh = o.dropdz_order_number && !finished ? '<button class="abtn ghost" type="button" data-act="refresh" data-id="' + esc(o.id) + '" title="Ask DropDZ for the latest status">↻</button>' : "";
    var dzline = o.dropdz_status ? '<div class="dzline">DropDZ: <b>' + esc(o.dropdz_status) + "</b>" + (o.dropdz_shipping_dzd != null ? " · shipping " + money(o.dropdz_shipping_dzd) : "") + "</div>" : "";
    return '<article class="ocard" data-id="' + esc(o.id) + '">' +
      '<div class="otop"><span class="pill ' + (STAGE_TONE[o.stage] || "grey") + '">' + esc(STAGE_LABEL[o.stage] || o.stage) + "</span>" +
        '<span class="muted small">#' + esc(String(o.id).slice(0, 6).toUpperCase()) + " · " + esc(ago(o.created_at)) + " · " + esc(o.source) + "</span>" +
        (o.promo_code ? '<span class="chip-adv">' + esc(o.promo_code) + "</span>" : "") + "</div>" +
      '<div class="ocust"><b>' + esc(o.buyer_full_name) + '</b> <a class="tel" href="tel:' + esc(o.buyer_phone) + '" dir="ltr">' + esc(o.buyer_phone) + "</a></div>" +
      '<div class="muted small">' + esc(o.buyer_commune) + ", " + esc(o.buyer_wilaya) + " — " + esc(o.buyer_address) + "</div>" +
      '<div class="oprod">' + esc(o.product_name) + " × " + esc(o.quantity) + " · <b>" + money((o.unit_price_dzd || 0) * (o.quantity || 1)) + "</b>" +
        (o.commission_dzd ? ' <span class="muted small">(commission ' + money(o.commission_dzd) + ")</span>" : "") + "</div>" +
      stepper(o) + dzline +
      (o.send_error ? '<p class="error small">⚠ ' + esc(o.send_error) + "</p>" : "") +
      '<div class="oact">' + wa + api + cancel + refresh + "</div></article>";
  }

  function chipsHtml() {
    var defs = [["all", "All"], ["new", "To contact"], ["whatsapped", "WhatsApped"], ["dropdz", "At DropDZ"], ["shipped", "Shipped"], ["delivered", "Delivered"], ["problem", "Problems"]];
    return defs.map(function (d) {
      return '<button type="button" class="chip' + (S.group === d[0] ? " on" : "") + '" data-group="' + d[0] + '">' + d[1] + ' <b>' + (S.counts[d[0]] != null ? S.counts[d[0]] : 0) + "</b></button>";
    }).join("");
  }
  function listHtml() {
    if (!S.loadedOnce) return '<p class="muted center pad">Loading…</p>';
    return S.orders.length ? S.orders.map(orderCard).join("") : '<p class="muted center pad">No orders here.</p>';
  }

  function viewShell() {
    return '<nav class="aseg"><button type="button" data-tab="orders" class="' + (S.tab === "orders" ? "on" : "") + '">Orders</button>' +
      '<button type="button" data-tab="settings" class="' + (S.tab === "settings" ? "on" : "") + '">Settings</button></nav>' +
      '<div id="tabbody">' + (S.tab === "orders" ? viewOrdersBody() : viewSettings()) + "</div>";
  }
  function viewOrdersBody() {
    return '<div class="asearch"><input id="oq" type="search" placeholder="Search name, phone, order number…" value="' + esc(S.q) + '"><button id="oref" class="abtn ghost" type="button">↻</button></div>' +
      '<div id="chips" class="chips">' + chipsHtml() + '</div><div id="olist">' + listHtml() + "</div>";
  }
  function viewSettings() {
    var d = S.dz;
    function row(ok, label) { return '<li class="' + (ok ? "ok" : "no") + '">' + (ok ? "✓ " : "✗ ") + esc(label) + "</li>"; }
    return '<section class="abox"><h3>DropDZ connection</h3>' +
      (d ? '<ul class="checks">' + row(d.api_key, "API key found on the server (DROPDZ_API_KEY)") + row(d.webhook_registered, "Webhook registered at DropDZ") + row(d.webhook_secret_saved, "Webhook secret saved") + "</ul>"
         : '<p class="muted">Checking…</p>') +
      '<div class="oact"><button class="abtn" type="button" data-set="test">Test connection</button>' +
      '<button class="abtn" type="button" data-set="webhook">Connect webhook</button>' +
      '<button class="abtn ghost" type="button" data-set="reconcile">Check order statuses now</button></div>' +
      (S.dzMsg ? '<p class="small dzmsg">' + esc(S.dzMsg) + "</p>" : "") +
      '<p class="muted small">Signed in as <b>' + esc(S.me) + "</b>. Webhook address: <span dir=\"ltr\">" + esc(location.origin) + "/api/dropdz-webhook</span></p></section>";
  }

  function paint() {
    var body = document.getElementById("tabbody");
    if (body) { body.innerHTML = S.tab === "orders" ? viewOrdersBody() : viewSettings(); }
  }
  function paintList() {
    var l = document.getElementById("olist"), c = document.getElementById("chips");
    if (l) l.innerHTML = listHtml();
    if (c) c.innerHTML = chipsHtml();
    var n = S.counts["new"] || 0;
    document.title = (n ? "(" + n + ") " : "") + "Admin — Kampus Store";
  }

  // ---------- data ----------
  async function loadOrders(quiet) {
    try {
      var r = await Promise.all([
        rpc("admin_orders", { p_group: S.group === "all" ? null : S.group, p_q: S.q || null, p_limit: 100, p_offset: 0 }),
        rpc("admin_order_counts")
      ]);
      S.orders = r[0] || [];
      S.counts = r[1] || {};
      S.loadedOnce = true;
      if (S.tab === "orders") paintList();
    } catch (e) {
      if (!quiet) toast("Could not load orders: " + e.message, true);
    }
  }
  function merge(o, patch) { Object.keys(patch).forEach(function (k) { o[k] = patch[k]; }); }

  async function route() {
    if (routing) return;
    routing = true;
    try {
      var s = readSession();
      if (!s) { setTop(false); app.innerHTML = viewAuth(); return; }
      setTop(true);
      var isAdmin = await rpc("ks_is_admin");
      if (isAdmin !== true) { app.innerHTML = viewNoAccess(); return; }
      var u = (s.user && (s.user.user_metadata || {})) || {};
      S.me = u.full_name || u.name || (s.user && s.user.email) || "admin";
      app.innerHTML = viewShell();
      await loadOrders();
      clearInterval(timer);
      timer = setInterval(function () { if (!document.hidden && S.tab === "orders") loadOrders(true); }, 30000);
      // no cron on the free Cloudflare plan: while this page is open, ask DropDZ for fresh statuses every 10 minutes
      var autoSync = function () { server("reconcile", {}).then(function () { return loadOrders(true); }).catch(function () {}); };
      autoSync();
      clearInterval(syncTimer);
      syncTimer = setInterval(function () { if (!document.hidden) autoSync(); }, 600000);
    } catch (e) {
      console.error(e);
      if (e && e.status === 401) { writeSession(null); setTop(false); app.innerHTML = viewAuth(); }
      else app.innerHTML = '<p class="error center pad">Something went wrong. Refresh the page.</p>';
    } finally { routing = false; }
  }
  function setTop(on) {
    document.getElementById("logout").hidden = !on;
    document.getElementById("walang").hidden = !on;
  }

  // ---------- actions ----------
  async function actWhatsapp(id) {
    var o = find(id); if (!o) return;
    window.open(waLink(o), "_blank");          // open the chat first (must happen inside the tap)
    try {
      var r = await server("whatsapp", { order_id: id });
      merge(o, r.order); paintList();
    } catch (e) { toast("WhatsApp opened, but saving failed: " + e.message, true); }
  }
  async function actSend(id) {
    var o = find(id); if (!o) return;
    var msg = o.whatsapped_at ? "Send this order to DropDZ now?" : "You have not WhatsApped this customer yet.\nSend to DropDZ anyway?";
    if (!window.confirm(msg)) return;
    S.busy[id] = "send"; paintList();
    try {
      var r = await server("send", { order_id: id });
      merge(o, r.order); toast("Sent to DropDZ ✓ " + (r.order.dropdz_order_number || ""));
    } catch (e) {
      toast(e.message, true);
      o.send_error = e.message;
    }
    delete S.busy[id]; paintList(); loadOrders(true);
  }
  async function actCancel(id) {
    var o = find(id); if (!o) return;
    if (!window.confirm("Cancel this order?" + (o.dropdz_order_number ? "\nDropDZ will be asked to cancel it too." : ""))) return;
    S.busy[id] = "cancel"; paintList();
    try { var r = await server("cancel", { order_id: id }); merge(o, r.order); toast("Order cancelled"); }
    catch (e) { toast(e.message, true); }
    delete S.busy[id]; paintList(); loadOrders(true);
  }
  async function actRefresh(id) {
    var o = find(id); if (!o) return;
    try { var r = await server("refresh", { order_id: id }); merge(o, r.order); paintList(); toast("Status: " + (STAGE_LABEL[o.stage] || o.stage)); }
    catch (e) { toast(e.message, true); }
  }

  async function loadDz() {
    try { S.dz = await server("dropdz-status", null, "GET"); } catch (e) { S.dz = null; S.dzMsg = e.message; }
    paint();
  }
  async function settingAction(kind) {
    S.dzMsg = "Working…"; paint();
    try {
      var r = kind === "test" ? await server("dropdz-test", {}) : kind === "webhook" ? await server("dropdz-webhook-register", {}) : await server("reconcile", {});
      S.dzMsg = kind === "reconcile" ? "Checked " + r.checked + " orders, updated " + r.updated + (r.failed ? ", failed " + r.failed : "") + "." : (r.message || (r.ok ? "Done." : "Failed."));
      if (r.fields_returned && !r.secret_saved) S.dzMsg += " Fields: " + r.fields_returned.join(", ");
    } catch (e) { S.dzMsg = e.message; }
    await loadDz();
  }

  // ---------- events ----------
  app.addEventListener("click", function (ev) {
    var t = ev.target.closest("button");
    if (!t) return;
    if (t.id === "google") { t.disabled = true; startGoogle(); return; }
    if (t.dataset.tab) { S.tab = t.dataset.tab; paint(); document.querySelectorAll(".aseg button").forEach(function (b) { b.classList.toggle("on", b.dataset.tab === S.tab); }); if (S.tab === "settings") loadDz(); else loadOrders(true); return; }
    if (t.dataset.group) { S.group = t.dataset.group; S.loadedOnce = false; paintList(); loadOrders(); return; }
    if (t.id === "oref") { loadOrders(); return; }
    if (t.dataset.set) { settingAction(t.dataset.set); return; }
    var act = t.dataset.act;
    if (act === "wa") actWhatsapp(t.dataset.id);
    else if (act === "send") actSend(t.dataset.id);
    else if (act === "cancel") actCancel(t.dataset.id);
    else if (act === "refresh") actRefresh(t.dataset.id);
  });

  var qTimer = null;
  app.addEventListener("input", function (ev) {
    if (ev.target.id !== "oq") return;
    S.q = ev.target.value.trim();
    clearTimeout(qTimer);
    qTimer = setTimeout(function () { loadOrders(); }, 300);
  });

  var wl = document.getElementById("walang");
  wl.value = S.waLang;
  wl.addEventListener("change", function () {
    S.waLang = wl.value;
    try { localStorage.setItem("kampus_wa_lang", S.waLang); } catch (e) {}
  });

  document.getElementById("logout").addEventListener("click", function () {
    var s = readSession();
    if (s) fetch(API + "/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + s.access_token } }).catch(function () {});
    writeSession(null); clearInterval(timer); clearInterval(syncTimer);
    route();
  });

  // ---------- start ----------
  (async function init() {
    var r = takeOAuthResult(), msg = "";
    if (r && r.error) msg = "Google sign-in failed. Please try again.";
    else if (r && r.access_token) {
      try {
        var ur = await fetch(API + "/auth/v1/user", { headers: { apikey: KEY, Authorization: "Bearer " + r.access_token } });
        if (ur.ok) r.user = await ur.json();
      } catch (e) {}
      writeSession(r);
    }
    if (msg) { setTop(false); app.innerHTML = viewAuth(msg); return; }
    route();
  })();
})();
