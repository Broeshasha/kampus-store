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
    products: [], orders: [], payouts: [], wilayas: [],
    profile: null, form: null,
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
    var keys = ["invalid_name", "invalid_phone", "invalid_wilaya", "invalid_country"];
    for (var i = 0; i < keys.length; i++) if (m.indexOf(keys[i]) > -1) return E[keys[i]];
    return E.generic;
  }
  function linkFor(slug) {
    return CFG.store + "/p/" + encodeURIComponent(slug) + "?ref=" + encodeURIComponent(S.dash.promo_code);
  }
  function storeLink() { return CFG.store + "/?ref=" + encodeURIComponent(S.dash.promo_code); }
  function setLoggedIn(on) { document.getElementById("logout").hidden = !on; }

  // ---------- countries & phone numbers ----------
  // ISO country code : dial code.  Algeria first = default. (the screen sorts the rest by name)
  var DIAL_RAW = "DZ:213,US:1,GB:44,RU:7,AF:93,AL:355,AD:376,AO:244,AI:1,AG:1,AR:54,AM:374,AW:297,AU:61,AT:43,AZ:994,BS:1,BH:973,BD:880,BB:1,BY:375,BE:32,BZ:501,BJ:229,BM:1,BT:975,BO:591,BA:387,BW:267,BR:55,BN:673,BG:359,BF:226,BI:257,KH:855,CM:237,CA:1,CV:238,KY:1,CF:236,TD:235,CL:56,CN:86,CO:57,KM:269,CG:242,CD:243,CR:506,CI:225,HR:385,CU:53,CY:357,CZ:420,DK:45,DJ:253,DM:1,DO:1,EC:593,EG:20,SV:503,GQ:240,ER:291,EE:372,SZ:268,ET:251,FJ:679,FI:358,FR:33,GA:241,GM:220,GE:995,DE:49,GH:233,GR:30,GD:1,GT:502,GN:224,GW:245,GY:592,HT:509,HN:504,HK:852,HU:36,IS:354,IN:91,ID:62,IR:98,IQ:964,IE:353,IL:972,IT:39,JM:1,JP:81,JO:962,KZ:7,KE:254,KI:686,XK:383,KW:965,KG:996,LA:856,LV:371,LB:961,LS:266,LR:231,LY:218,LI:423,LT:370,LU:352,MO:853,MG:261,MW:265,MY:60,MV:960,ML:223,MT:356,MH:692,MR:222,MU:230,MX:52,FM:691,MD:373,MC:377,MN:976,ME:382,MA:212,MZ:258,MM:95,NA:264,NR:674,NP:977,NL:31,NZ:64,NI:505,NE:227,NG:234,KP:850,MK:389,NO:47,OM:968,PK:92,PW:680,PS:970,PA:507,PG:675,PY:595,PE:51,PH:63,PL:48,PT:351,PR:1,QA:974,RO:40,RW:250,KN:1,LC:1,VC:1,WS:685,SM:378,ST:239,SA:966,SN:221,RS:381,SC:248,SL:232,SG:65,SK:421,SI:386,SB:677,SO:252,ZA:27,KR:82,SS:211,ES:34,LK:94,SD:249,SR:597,SE:46,CH:41,SY:963,TW:886,TJ:992,TZ:255,TH:66,TL:670,TG:228,TO:676,TT:1,TN:216,TR:90,TM:993,TV:688,UG:256,UA:380,AE:971,UY:598,UZ:998,VU:678,VE:58,VN:84,YE:967,ZM:260,ZW:263,GP:590,MQ:596,RE:262,GF:594,NC:687,PF:689,GL:299,FO:298,GI:350,JE:44,GG:44,IM:44,CW:599,SX:1,MS:1,TC:1,VG:1,VI:1,GU:1,MP:1";
  var DEFAULT_COUNTRY = "DZ";
  var DIAL = {}, CODES = [];
  DIAL_RAW.split(",").forEach(function (p) { var a = p.split(":"); DIAL[a[0]] = a[1]; CODES.push(a[0]); });
  var E164 = /^\+[1-9]\d{6,14}$/;

  var regionNames = null;
  try { regionNames = new Intl.DisplayNames([CFG.lang === "ar" ? "ar" : CFG.lang === "fr" ? "fr" : "en"], { type: "region" }); } catch (e) {}
  function countryName(c) { try { return (regionNames && regionNames.of(c)) || c; } catch (e) { return c; } }
  function flag(c) {
    try { return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65); } catch (e) { return ""; }
  }
  var sortedCountries = null;
  function countryOptions(sel) {
    if (!sortedCountries) {
      var cmp = function (a, b) { return a.n.localeCompare(b.n, CFG.lang); };
      var all = CODES.map(function (c) { return { c: c, n: countryName(c) }; }).filter(function (x) { return x.c !== DEFAULT_COUNTRY; }).sort(cmp);
      all.unshift({ c: DEFAULT_COUNTRY, n: countryName(DEFAULT_COUNTRY) });
      sortedCountries = all;
    }
    return sortedCountries.map(function (x) {
      return '<option value="' + x.c + '"' + (x.c === sel ? " selected" : "") + ">" + esc(flag(x.c) + " " + x.n + " (+" + DIAL[x.c] + ")") + "</option>";
    }).join("");
  }

  // which country does this international number (digits only, no +) belong to?
  function detectCountry(digits, current) {
    if (DIAL[current] && digits.indexOf(DIAL[current]) === 0) return current;
    for (var len = 3; len >= 1; len--) {
      var pre = digits.slice(0, len);
      for (var i = 0; i < CODES.length; i++) if (DIAL[CODES[i]] === pre) return CODES[i];
    }
    return null;
  }
  // what the person typed + the chosen country  ->  { phone: "+263771234567", country: "ZW" }  (or null if not valid)
  function toE164(input, country) {
    var raw = String(input || "").trim();
    var digits = raw.replace(/\D/g, "");
    if (!digits) return null;
    var phone;
    if (/^(\+|00)/.test(raw)) {                 // typed with + or 00: full international number
      digits = digits.replace(/^00/, "");
      var c2 = detectCountry(digits, country);
      if (!c2) return null;
      country = c2;
      phone = "+" + digits;
    } else if (country === "DZ") {              // Algeria: 05.. / 06.. / 07..  or  5.. / 6.. / 7..
      if (/^0[567]\d{8}$/.test(digits)) digits = digits.slice(1);
      phone = "+213" + digits;
    } else {                                    // any other country: dial code + number (leading 0 removed)
      phone = "+" + DIAL[country] + digits.replace(/^0+/, "");
    }
    if (!E164.test(phone)) return null;
    if (country === "DZ" && !/^\+213[567]\d{8}$/.test(phone)) return null;
    return { phone: phone, country: country };
  }
  // saved phone -> what we show in the box (without the dial code)
  function natFromStored(phone, country) {
    var raw = String(phone || ""), d = raw.replace(/\D/g, "");
    if (!d) return "";
    if (raw.charAt(0) !== "+") return d;        // older accounts: 0555123456
    var dial = DIAL[country] || "";
    if (!dial || d.indexOf(dial) !== 0) return raw;
    d = d.slice(dial.length);
    return country === "DZ" ? "0" + d : d;
  }

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

  // one form used by "create account" and by "my profile"
  function profileForm(id, v, btn) {
    var wopts = '<option value="">' + esc(T.chooseWilaya) + "</option>" +
      S.wilayas.map(function (w) {
        return '<option value="' + esc(w.id) + '"' + (String(w.id) === String(v.wilaya) ? " selected" : "") + ">" + esc(w.name) + "</option>";
      }).join("");
    return '<form id="' + id + '" class="form flat" novalidate>' +
      "<label>" + esc(T.name) + '<input name="name" autocomplete="name" value="' + esc(v.name) + '" required></label>' +
      "<label>" + esc(T.country) + '<select name="country">' + countryOptions(v.country) + "</select></label>" +
      "<label>" + esc(T.phone) + '<span class="phone-row" dir="ltr"><span class="dial">+' + esc(DIAL[v.country] || "") + '</span>' +
        '<input name="phone" type="tel" inputmode="tel" dir="ltr" autocomplete="tel-national" value="' + esc(v.nat) + '" required></span></label>' +
      '<p class="muted small">' + esc(T.phoneHint) + "</p>" +
      '<label class="wilaya-wrap"' + (v.country === "DZ" ? "" : " hidden") + ">" + esc(T.wilaya) + '<select name="wilaya">' + wopts + "</select></label>" +
      msgHtml() +
      '<button class="btn big" type="submit">' + esc(btn) + "</button></form>";
  }

  function viewRegister() {
    var v = S.form || { name: S.userName, country: DEFAULT_COUNTRY, nat: "", wilaya: "" };
    return '<section class="box auth"><h1>' + esc(T.registerTitle) + '</h1><p class="muted">' + esc(T.registerHint) + "</p>" +
      profileForm("reg-form", v, T.createBtn) + "</section>";
  }

  function viewProfile() {
    var p = S.profile || {};
    var country = p.phone_country || DEFAULT_COUNTRY;
    var v = S.form || {
      name: p.display_name || S.dash.display_name || "", country: country,
      nat: natFromStored(p.phone, country), wilaya: p.wilaya_id || ""
    };
    return '<div class="box"><h3>' + esc(T.profileTitle) + "</h3>" + profileForm("prof-form", v, T.saveBtn) + "</div>" +
      '<p class="muted small center">' + esc(T.promoLocked) + "</p>";
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
    var tabs = [["overview", T.overview], ["products", T.products], ["orders", T.orders], ["profile", T.profile]];
    var body = S.tab === "products" ? viewProducts() : S.tab === "orders" ? viewOrders() : S.tab === "profile" ? viewProfile() : viewOverview();
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
      rpc("get_my_profile").catch(soft),
      loadWilayas().catch(soft)
    ]);
    if (r[0] && !r[0].inactive) S.dash = r[0];
    S.products = r[1] || [];
    S.orders = r[2] || [];
    S.payouts = r[3] || [];
    S.profile = r[4] || null;
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

  // ---------- events ----------
  app.addEventListener("click", function (ev) {
    var t = ev.target.closest("button");
    if (!t) return;
    if (t.id === "google") { t.disabled = true; startGoogle(); return; }
    if (t.dataset.tab) { S.tab = t.dataset.tab; S.msg = ""; S.form = null; render("dash"); return; }
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
    if (t.id === "refresh") { loadAll().then(function () { render("dash"); }).catch(function () {}); }
  });

  // keep the "+213" box and the wilaya field in step with the chosen country
  function syncCountry(f) {
    var c = f.elements.country.value;
    var dial = f.querySelector(".dial");
    if (dial) dial.textContent = "+" + (DIAL[c] || "");
    var w = f.querySelector(".wilaya-wrap");
    if (w) w.hidden = c !== DEFAULT_COUNTRY;
  }
  app.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el && el.name === "country" && el.form) syncCountry(el.form);
  });

  app.addEventListener("input", function (ev) {
    var el = ev.target;
    if (el.id === "pq") {
      var term = el.value.trim().toLowerCase();
      app.querySelectorAll(".pcard").forEach(function (c) { c.hidden = term && c.dataset.name.indexOf(term) === -1; });
      return;
    }
    // number typed with + : pick the matching country automatically
    if (el.name === "phone" && el.form && /^\s*\+/.test(el.value)) {
      var c = detectCountry(el.value.replace(/\D/g, ""), el.form.elements.country.value);
      if (c && c !== el.form.elements.country.value) { el.form.elements.country.value = c; syncCountry(el.form); }
    }
  });

  // read + check the form; returns { v: values to show again, args: values for the server, err: error key }
  function readProfile(f) {
    var country = f.elements.country.value;
    var v = { name: f.elements.name.value, country: country, nat: f.elements.phone.value, wilaya: f.elements.wilaya.value };
    if (v.name.trim().length < 3) return { v: v, err: "invalid_name" };
    var ph = toE164(v.nat, country);
    if (!ph) return { v: v, err: "invalid_phone" };
    v.country = ph.country;
    var wid = parseInt(v.wilaya, 10);
    if (ph.country === DEFAULT_COUNTRY && !(wid > 0)) return { v: v, err: "invalid_wilaya" };
    return { v: v, args: { p_name: v.name.trim(), p_phone: ph.phone, p_wilaya: ph.country === DEFAULT_COUNTRY ? wid : null, p_country: ph.country } };
  }

  app.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var f = ev.target;
    if (f.id !== "reg-form" && f.id !== "prof-form") return;
    var isReg = f.id === "reg-form";
    var btn = f.querySelector("button[type=submit]");
    S.msg = ""; S.msgOk = false;
    var r = readProfile(f);
    S.form = r.v;
    if (r.err) { S.msg = E[r.err] || E.generic; render(isReg ? "register" : "dash"); return; }
    btn.disabled = true;
    try {
      if (isReg) {
        await rpc("register_advertiser", r.args);
        S.form = null;
        await route();
      } else {
        var saved = await rpc("update_my_profile", r.args);
        S.profile = saved || S.profile;
        if (S.dash) S.dash.display_name = r.args.p_name;
        S.form = null; S.msg = T.saved; S.msgOk = true;
        render("dash");
      }
    } catch (e) {
      S.msg = errText(e);
      render(isReg ? "register" : "dash");
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
