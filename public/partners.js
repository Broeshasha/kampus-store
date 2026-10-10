(function () {
  "use strict";
  var CFG = window.__CFG || {};
  var T = CFG.T || {};
  var E = T.errors || {};
  var app = document.getElementById("app");

  if (!window.supabase) {
    app.innerHTML = '<p class="error center pad">' + (E.generic || "Error") + "</p>";
    return;
  }
  var sb = window.supabase.createClient(CFG.url, CFG.anon);

  var S = {
    authTab: "login", tab: "overview", dash: null,
    products: [], orders: [], payouts: [], wilayas: [],
    recovery: false, msg: "", msgOk: false
  };
  var routing = false;

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
    if (m.indexOf("invalid login") > -1) return E.invalid_credentials;
    if (m.indexOf("already registered") > -1 || m.indexOf("already been registered") > -1) return E.email_exists;
    if (m.indexOf("at least") > -1 && m.indexOf("password") > -1) return E.weak_password;
    if (m.indexOf("rate limit") > -1 || m.indexOf("too many") > -1) return E.rate_limit;
    if (m.indexOf("not confirmed") > -1) return E.not_confirmed;
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
    var login = S.authTab === "login";
    return '<section class="box auth">' +
      "<h1>" + esc(T.title) + '</h1><p class="muted">' + esc(T.tagline) + "</p>" +
      '<div class="seg">' +
        '<button type="button" data-authtab="login" class="' + (login ? "on" : "") + '">' + esc(T.login) + "</button>" +
        '<button type="button" data-authtab="signup" class="' + (!login ? "on" : "") + '">' + esc(T.signup) + "</button>" +
      "</div>" +
      '<form id="auth-form" class="form flat" novalidate>' +
        "<label>" + esc(T.email) + '<input name="email" type="email" dir="ltr" autocomplete="email" required></label>' +
        "<label>" + esc(T.password) + '<input name="password" type="password" dir="ltr" minlength="6" autocomplete="' + (login ? "current-password" : "new-password") + '" required></label>' +
        msgHtml() +
        '<button class="btn big" type="submit">' + esc(login ? T.loginBtn : T.signupBtn) + "</button>" +
        (login ? '<button type="button" id="forgot" class="link">' + esc(T.forgot) + "</button>" : "") +
      "</form></section>";
  }

  function viewRecovery() {
    return '<section class="box auth"><h1>' + esc(T.newPasswordTitle) + "</h1>" +
      '<form id="recovery-form" class="form flat" novalidate>' +
        "<label>" + esc(T.newPassword) + '<input name="password" type="password" dir="ltr" minlength="6" autocomplete="new-password" required></label>' +
        msgHtml() +
        '<button class="btn big" type="submit">' + esc(T.savePassword) + "</button></form></section>";
  }

  function viewRegister() {
    var opts = '<option value="">' + esc(T.chooseWilaya) + "</option>" +
      S.wilayas.map(function (w) { return '<option value="' + esc(w.id) + '">' + esc(w.name) + "</option>"; }).join("");
    return '<section class="box auth"><h1>' + esc(T.registerTitle) + '</h1><p class="muted">' + esc(T.registerHint) + "</p>" +
      '<form id="reg-form" class="form flat" novalidate>' +
        "<label>" + esc(T.name) + '<input name="name" autocomplete="name" required></label>' +
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
    return '<div class="stats">' +
        statBox(T.balance, money(d.balance_dzd), "main", T.balanceHint) +
        statBox(T.pending, money(d.pending_dzd)) +
        statBox(T.earned, money(d.earned_dzd)) +
        statBox(T.paid, money(d.paid_dzd)) +
        statBox(T.ordersTotal, d.orders_total) +
        statBox(T.delivered, d.orders_delivered) +
      "</div>" +
      '<p class="muted small center">' + esc(fill(T.rate, { p: d.commission_percent })) + "</p>" +
      '<div class="box"><div class="kv"><span>' + esc(T.yourCode) + '</span><b class="code" dir="ltr">' + esc(d.promo_code) + "</b>" +
        '<button class="mini" type="button" data-copy="' + esc(d.promo_code) + '">' + esc(T.copy) + "</button></div>" +
      '<div class="kv"><span>' + esc(T.yourLink) + '</span><b class="url" dir="ltr">' + esc(storeLink()) + "</b>" +
        '<button class="mini" type="button" data-copy="' + esc(storeLink()) + '">' + esc(T.copy) + "</button>" +
        '<button class="mini" type="button" data-share data-url="' + esc(storeLink()) + '" data-title="' + esc(fill(T.shareText, { name: "Kampus Store" })) + '">' + esc(T.share) + "</button></div></div>" +
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
        '<div class="pimg">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : "") + "</div>" +
        '<div class="pinfo"><h3>' + esc(p.name) + "</h3>" +
          '<div class="muted small">' + esc(T.price) + ": " + money(p.sell_price) + "</div>" +
          '<div class="earn">' + esc(T.earnPer) + " <b>" + money(p.earn_per_unit) + "</b> " + esc(T.perSale) + "</div>" +
          '<div class="stock ' + stockCls + '">' + esc(stockTxt) +
            (p.stock > 0 && p.earn_per_unit > 0 ? " · " + esc(T.ifSoldAll) + ": <b>" + money(p.stock * p.earn_per_unit) + "</b>" : "") + "</div>" +
          '<div class="actions">' +
            '<button class="mini" type="button" data-copy="' + esc(url) + '">' + esc(T.copyLink) + "</button>" +
            '<button class="mini solid" type="button" data-share data-url="' + esc(url) + '" data-title="' + esc(fill(T.shareText, { name: p.name })) + '">' + esc(T.share) + "</button>" +
          "</div></div></article>";
    }).join("");
    return '<input id="pq" class="search" type="search" placeholder="' + esc(T.searchProducts) + '">' +
      '<div class="plist">' + (cards || '<p class="muted center">' + esc(T.noProducts) + "</p>") + "</div>";
  }

  function viewOrders() {
    if (!S.orders.length) return '<p class="muted center pad">' + esc(T.noOrders) + "</p>";
    var label = { delivered: T.stDelivered, pending: T.stPending, dead: T.stDead };
    return '<ul class="olist">' + S.orders.map(function (o) {
      return '<li class="order ' + esc(o.bucket) + '">' +
        '<div class="o-top"><b>' + esc(o.product_name) + "</b><span> × " + esc(o.quantity) + "</span></div>" +
        '<div class="muted small">' + esc(o.buyer_first_name) + " · " + esc(o.buyer_wilaya) + " · " + esc(fmtDate(o.created_at)) + "</div>" +
        '<div class="o-bot"><span class="pill ' + esc(o.bucket) + '">' + esc(label[o.bucket] || o.status) + "</span>" +
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
    var map = { auth: viewAuth, recovery: viewRecovery, register: viewRegister, inactive: viewInactive, dash: viewDash };
    app.innerHTML = view === "loading" ? '<p class="muted center pad">' + esc(T.loading) + "</p>" : map[view]();
  }

  // ---------- data ----------
  async function loadWilayas() {
    if (S.wilayas.length) return;
    var r = await sb.from("wilayas").select("id,name").order("id");
    S.wilayas = r.data || [];
  }
  async function loadAll() {
    var r = await Promise.all([
      sb.rpc("get_my_dashboard"),
      sb.rpc("get_my_products"),
      sb.rpc("get_my_orders"),
      sb.from("advertiser_payouts").select("amount_dzd,method,paid_at").order("paid_at", { ascending: false })
    ]);
    if (r[0].data && !r[0].data.inactive) S.dash = r[0].data;
    S.products = r[1].data || [];
    S.orders = r[2].data || [];
    S.payouts = r[3].data || [];
  }

  async function route() {
    if (routing) return;
    routing = true;
    try {
      var s = await sb.auth.getSession();
      var session = s.data && s.data.session;
      if (!session) { S.dash = null; setLoggedIn(false); render("auth"); return; }
      setLoggedIn(true);
      if (S.recovery) { render("recovery"); return; }
      render("loading");
      var d = await sb.rpc("get_my_dashboard");
      if (d.error) throw d.error;
      if (!d.data) { await loadWilayas(); S.dash = null; render("register"); return; }
      if (d.data.inactive) { render("inactive"); return; }
      await loadAll();
      render("dash");
    } catch (e) {
      console.error(e);
      app.innerHTML = '<p class="error center pad">' + esc(E.generic) + "</p>";
    } finally {
      routing = false;
    }
  }

  // ---------- events ----------
  app.addEventListener("click", function (ev) {
    var t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.authtab) { S.authTab = t.dataset.authtab; S.msg = ""; render("auth"); return; }
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
    if (t.id === "refresh") { loadAll().then(function () { render("dash"); }); return; }
    if (t.id === "forgot") {
      var email = (app.querySelector("input[name=email]") || {}).value;
      if (!email) return;
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/partners" }).then(function (r) {
        S.msg = r.error ? errText(r.error) : T.resetSent; S.msgOk = !r.error; render("auth");
      });
    }
  });

  app.addEventListener("input", function (ev) {
    if (ev.target.id !== "pq") return;
    var term = ev.target.value.trim().toLowerCase();
    app.querySelectorAll(".pcard").forEach(function (c) { c.hidden = term && c.dataset.name.indexOf(term) === -1; });
  });

  app.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var f = ev.target, btn = f.querySelector("button[type=submit]");
    btn.disabled = true;
    S.msg = ""; S.msgOk = false;
    try {
      if (f.id === "auth-form") {
        var email = f.elements.email.value.trim(), password = f.elements.password.value;
        var r;
        if (S.authTab === "login") {
          r = await sb.auth.signInWithPassword({ email: email, password: password });
          if (r.error) throw r.error;
          await route();
        } else {
          r = await sb.auth.signUp({ email: email, password: password, options: { emailRedirectTo: location.origin + "/partners" } });
          if (r.error) throw r.error;
          if (r.data && r.data.session) await route();
          else { S.authTab = "login"; S.msg = T.checkEmail; S.msgOk = true; render("auth"); }
        }
      } else if (f.id === "reg-form") {
        var rr = await sb.rpc("register_advertiser", {
          p_name: f.elements.name.value, p_phone: f.elements.phone.value, p_wilaya: parseInt(f.elements.wilaya.value, 10)
        });
        if (rr.error) throw rr.error;
        await route();
      } else if (f.id === "recovery-form") {
        var up = await sb.auth.updateUser({ password: f.elements.password.value });
        if (up.error) throw up.error;
        S.recovery = false;
        toast(T.passwordSaved);
        await route();
      }
    } catch (e) {
      S.msg = errText(e);
      var v = f.id === "reg-form" ? "register" : f.id === "recovery-form" ? "recovery" : "auth";
      render(v);
    }
  });

  document.getElementById("logout").addEventListener("click", async function () {
    await sb.auth.signOut();
    S.dash = null; S.tab = "overview"; S.msg = "";
    route();
  });

  sb.auth.onAuthStateChange(function (event) {
    if (event === "PASSWORD_RECOVERY") { S.recovery = true; setTimeout(route, 0); }
    else if (event === "SIGNED_IN" && !S.dash && !S.recovery) setTimeout(route, 0);
  });

  route();
})();
