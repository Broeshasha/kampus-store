(function () {
  "use strict";
  var K = window.AdminKit;
  if (!K) return;
  var esc = K.esc, money = K.money, rpc = K.rpc, toast = K.toast;

  var PERIODS = [[1, "24h"], [7, "7 days"], [30, "30 days"], [90, "90 days"], [0, "All time"]];
  var COLORS = ["#3e7bfa", "#16a34a", "#f59e0b", "#8b5cf6", "#14b8a6", "#ef4444", "#64748b"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  var D = {
    days: 30, loaded: false, loadedAt: 0, loading: false, errors: {},
    ov: null, att: null, products: [], cats: [], advs: [], regions: [], hours: null,
    prodSort: "profit", prodCat: "", advSort: "balance",
    panel: null, payouts: {}
  };

  // ---------- small helpers ----------
  function num(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function pct(n) { return n == null || isNaN(n) ? "—" : Math.round(n) + "%"; }
  function rate(good, bad) { var t = (good || 0) + (bad || 0); return t > 0 ? (good * 100) / t : null; }
  function shortDay(s) { var p = String(s).split("-"); return p.length === 3 ? parseInt(p[2], 10) + " " + MONTHS[parseInt(p[1], 10) - 1] : s; }
  function niceMax(v) {
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
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
  function periodLabel() { return (PERIODS.filter(function (p) { return p[0] === D.days; })[0] || [0, ""])[1]; }

  // ---------- tiny chart toolkit (no outside libraries) ----------
  function lineChart(labels, series, fmt) {
    var W = 640, H = 220, L = 40, R = 10, T = 14, B = 26, n = labels.length;
    var max = 0;
    series.forEach(function (s) { s.values.forEach(function (v) { if (v > max) max = v; }); });
    max = niceMax(Math.max(max, 1));
    var iw = W - L - R, ih = H - T - B;
    function x(i) { return L + (n <= 1 ? iw / 2 : (iw * i) / (n - 1)); }
    function y(v) { return T + ih - (ih * v) / max; }
    var grid = [0, 0.5, 1].map(function (f) {
      var yy = y(max * f);
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="gl"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" class="gt" text-anchor="end">' + fmt(max * f) + "</text>";
    }).join("");
    var every = Math.max(1, Math.ceil(n / 6));
    var xl = labels.map(function (lb, i) {
      return i % every === 0 || i === n - 1 ? '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" class="gt" text-anchor="middle">' + esc(shortDay(lb)) + "</text>" : "";
    }).join("");
    var paths = series.map(function (s) {
      var pts = s.values.map(function (v, i) { return x(i).toFixed(1) + "," + y(v).toFixed(1); });
      var area = s.area ? '<polygon fill="' + s.color + '" opacity=".13" points="' + L + "," + (T + ih) + " " + pts.join(" ") + " " + x(n - 1).toFixed(1) + "," + (T + ih) + '"/>' : "";
      return area + '<polyline fill="none" stroke="' + s.color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + pts.join(" ") + '"/>';
    }).join("");
    return '<svg viewBox="0 0 ' + W + " " + H + '" class="chart" role="img">' + grid + xl + paths + "</svg>";
  }

  function barChart(values, labels, color, fmt, labelEvery) {
    var W = 640, H = 190, L = 40, R = 10, T = 12, B = 24, n = values.length;
    var hi = 0, lo = 0;
    values.forEach(function (v) { if (v > hi) hi = v; if (v < lo) lo = v; });
    hi = niceMax(Math.max(hi, 1));
    if (lo < 0) lo = -niceMax(-lo);
    var iw = W - L - R, ih = H - T - B, bw = (iw / Math.max(n, 1)) * 0.68;
    function y(v) { return T + ih - (ih * (v - lo)) / (hi - lo); }
    var y0 = y(0);
    var grid = [lo < 0 ? lo : null, 0, hi].filter(function (v) { return v !== null; }).map(function (v) {
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="gl"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" class="gt" text-anchor="end">' + fmt(v) + "</text>";
    }).join("");
    var every = labelEvery || Math.max(1, Math.ceil(n / 8));
    var bars = values.map(function (v, i) {
      var cx = L + (iw * (i + 0.5)) / n, top = Math.min(y(v), y0), h = Math.max(Math.abs(y(v) - y0), v !== 0 ? 1.5 : 0);
      var lab = i % every === 0 ? '<text x="' + cx.toFixed(1) + '" y="' + (H - 7) + '" class="gt" text-anchor="middle">' + esc(labels[i]) + "</text>" : "";
      return '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="' + (v < 0 ? "#ef4444" : color) + '"><title>' + esc(labels[i]) + ": " + fmt(v) + "</title></rect>" + lab;
    }).join("");
    return '<svg viewBox="0 0 ' + W + " " + H + '" class="chart" role="img">' + grid + bars + "</svg>";
  }

  function donut(items, fmt) {
    var total = items.reduce(function (a, i) { return a + Math.max(i.value, 0); }, 0);
    if (total <= 0) return '<p class="muted small">No data in this period.</p>';
    var off = 0, segs = items.map(function (i, k) {
      var p = (Math.max(i.value, 0) * 100) / total, c = i.color || COLORS[k % COLORS.length];
      var seg = '<circle r="15.9155" cx="21" cy="21" fill="transparent" stroke="' + c + '" stroke-width="6" stroke-dasharray="' + p.toFixed(2) + " " + (100 - p).toFixed(2) + '" stroke-dashoffset="' + (25 - off).toFixed(2) + '"/>';
      off += p;
      return seg;
    }).join("");
    var legend = items.map(function (i, k) {
      var c = i.color || COLORS[k % COLORS.length];
      return '<li><i style="background:' + c + '"></i><span>' + esc(i.label) + "</span><b>" + fmt(i.value) + " · " + Math.round((Math.max(i.value, 0) * 100) / total) + "%</b></li>";
    }).join("");
    return '<div class="donut"><svg viewBox="0 0 42 42" class="dsvg" role="img"><circle r="15.9155" cx="21" cy="21" fill="transparent" stroke="#eef1f7" stroke-width="6"/>' + segs +
      '<text x="21" y="22.5" text-anchor="middle" class="dtot">' + esc(fmt(total)) + "</text></svg><ul class=\"legend\">" + legend + "</ul></div>";
  }

  function hbars(items, color) {
    var max = items.reduce(function (a, i) { return Math.max(a, i.value); }, 1);
    if (!items.length) return '<p class="muted small">No data in this period.</p>';
    return items.map(function (i, k) {
      var c = i.color || color || COLORS[k % COLORS.length];
      return '<div class="hb"><div class="hb-top"><span>' + esc(i.label) + "</span><b>" + esc(i.text) + '</b></div><div class="hb-bar"><i style="width:' + Math.max(1.5, (Math.max(i.value, 0) * 100) / max).toFixed(1) + "%;background:" + c + '"></i></div>' +
        (i.sub ? '<small class="muted">' + esc(i.sub) + "</small>" : "") + "</div>";
    }).join("");
  }

  function card(title, body, extra) { return '<section class="dcard' + (extra ? " " + extra : "") + '"><h3>' + esc(title) + "</h3>" + body + "</section>"; }
  function kpi(label, value, sub, tone) {
    return '<div class="kpi ' + (tone || "") + '"><span>' + esc(label) + "</span><strong>" + value + "</strong>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div>";
  }
  function periodBar() {
    return '<div class="dbar"><div class="chips">' + PERIODS.map(function (p) {
      return '<button type="button" class="chip' + (D.days === p[0] ? " on" : "") + '" data-days="' + p[0] + '">' + p[1] + "</button>";
    }).join("") + '</div><button type="button" class="abtn ghost" data-refresh="1" title="Reload">↻</button></div>';
  }

  // ---------- smart tips (simple rules you can read and change) ----------
  function insights() {
    var out = [], A = D.att || {}, k = (D.ov && D.ov.kpi) || {};
    function add(tone, icon, text, tab) { out.push({ tone: tone, icon: icon, text: text, tab: tab }); }

    if (A.new_over_2h > 0) add("bad", "⏰", A.new_over_2h + " order" + (A.new_over_2h > 1 ? "s are" : " is") + " waiting more than 2 hours for a first contact (oldest: " + A.oldest_new_hours + "h). Fast contact means fewer lost orders.", "orders");
    else if (A.new_total > 0) add("info", "📥", A.new_total + " new order" + (A.new_total > 1 ? "s" : "") + " to contact.", "orders");
    if (A.send_errors > 0) add("bad", "⚠️", A.send_errors + " order" + (A.send_errors > 1 ? "s" : "") + " failed to send to DropDZ. Open Orders to see the error.", "orders");
    if (A.whatsapped_stale > 0) add("warn", "💬", A.whatsapped_stale + " order" + (A.whatsapped_stale > 1 ? "s" : "") + " were WhatsApped over 24h ago but not sent to DropDZ yet.", "orders");
    if (A.no_answer > 0) add("warn", "📵", A.no_answer + " customer" + (A.no_answer > 1 ? "s" : "") + " did not answer DropDZ's call.", "orders");
    if (A.advertisers_owed > 0) add("warn", "💰", A.advertisers_owed + " advertiser" + (A.advertisers_owed > 1 ? "s are" : " is") + " waiting to be paid: " + money(A.owed_total) + " in total.", "advertisers");

    var long = D.days === 0 || D.days >= 30;
    D.products.forEach(function (p) {
      if (!p.is_active) return;
      if (p.stock <= 0 && p.units > 0) add("bad", "⛔", p.name + " is OUT OF STOCK but customers want it (" + p.units + " sold in " + periodLabel() + ").", "products");
      else if (p.per_day > 0 && p.days_left != null && p.days_left <= 5 && p.stock > 0) add("warn", "📦", "Restock " + p.name + ": about " + Math.round(p.days_left * 10) / 10 + " days of stock left (" + p.stock + " units at " + p.per_day + " per day).", "products");
      if (p.delivered_units + p.lost_units >= 5 && p.return_rate >= 35) add("bad", "↩️", p.name + ": " + pct(p.return_rate) + " of its orders are returned or cancelled. Check quality, price or the ads that sell it.", "products");
      if (p.units > 0 && p.margin_pct != null && p.margin_pct < 15) add("warn", "💸", p.name + " has a thin margin (" + p.margin_pct + "%). Raise the price or the advertiser percentage may eat the profit.", "products");
      if (long && p.units === 0 && p.stock >= 5) add("info", "💤", p.name + " had no orders in " + periodLabel() + ". Promote it or drop it.", "products");
    });
    var top = D.products.filter(function (p) { return p.profit > 0; })[0];
    if (top) add("good", "🏆", "Best performer: " + top.name + " — " + money(top.profit) + " net profit in " + periodLabel() + " (" + top.delivered_units + " delivered).", "products");

    D.advs.forEach(function (a) {
      var r = rate(a.delivered, a.lost);
      if (a.delivered + a.lost >= 5 && r < 50) add("bad", "🚩", "Advertiser " + a.promo_code + " has only " + pct(r) + " delivered (" + a.lost + " lost of " + (a.delivered + a.lost) + "). Their traffic may be poor.", "advertisers");
    });
    var bestAdv = D.advs.slice().sort(function (a, b) { return b.delivered - a.delivered; })[0];
    if (bestAdv && bestAdv.delivered > 0) add("good", "⭐", "Top advertiser: " + (bestAdv.display_name || bestAdv.promo_code) + " (" + bestAdv.promo_code + ") with " + bestAdv.delivered + " delivered orders.", "advertisers");

    D.regions.forEach(function (r) {
      var rt = rate(r.delivered, r.lost);
      if (r.delivered + r.lost >= 6 && rt < 50) add("warn", "🗺️", r.wilaya + ": only " + pct(rt) + " of orders end delivered. Delivery there may be a problem.", "overview");
    });
    if (D.hours && D.hours.hours && D.hours.hours.some(function (v) { return v > 0; })) {
      var hrs = D.hours.hours, best = 0;
      hrs.forEach(function (v, i) { if (v > hrs[best]) best = i; });
      add("info", "🕒", "Most orders arrive around " + pad(best) + ":00–" + pad((best + 1) % 24) + ":00 (Algeria time). Run your ads and be ready to answer then.", "overview");
    }
    if (k.cohort_delivered + k.cohort_lost >= 5) {
      var dr = rate(k.cohort_delivered, k.cohort_lost);
      if (dr < 60) add("bad", "📉", "Only " + pct(dr) + " of finished orders were delivered in " + periodLabel() + ". Confirm customers better before sending to DropDZ.", "orders");
    }
    var order = { bad: 0, warn: 1, good: 2, info: 3 };
    out.sort(function (a, b) { return order[a.tone] - order[b.tone]; });
    return out.slice(0, 10);
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // ---------- loading ----------
  function loadAll(force) {
    if (D.loading) return Promise.resolve();
    if (!force && D.loaded && Date.now() - D.loadedAt < 30000) return Promise.resolve();
    D.loading = true; D.errors = {};
    var soft = function (name) { return function (e) { D.errors[name] = e.message; return null; }; };
    var d = D.days;
    return Promise.all([
      rpc("admin_overview", { p_days: d }).catch(soft("overview")),
      rpc("admin_attention").catch(soft("attention")),
      rpc("admin_products", { p_days: d }).catch(soft("products")),
      rpc("admin_categories", { p_days: d }).catch(soft("categories")),
      rpc("admin_advertisers", { p_days: d }).catch(soft("advertisers")),
      rpc("admin_regions", { p_days: d }).catch(soft("regions")),
      rpc("admin_hours", { p_days: d }).catch(soft("hours"))
    ]).then(function (r) {
      D.ov = r[0]; D.att = r[1]; D.products = r[2] || []; D.cats = r[3] || []; D.advs = r[4] || []; D.regions = r[5] || []; D.hours = r[6];
      D.loaded = true; D.loadedAt = Date.now(); D.loading = false;
      K.repaint();
    }).catch(function () { D.loading = false; });
  }
  function errBox() {
    var keys = Object.keys(D.errors);
    if (!keys.length) return "";
    var forbidden = keys.some(function (k) { return /function|does not exist|schema cache/i.test(D.errors[k]); });
    return '<div class="dcard bad"><b>Some numbers could not load.</b> ' + (forbidden ? "Run <code>step5_dashboard.sql</code> in Supabase first." : esc(D.errors[keys[0]])) + "</div>";
  }

  // ---------- OVERVIEW ----------
  function viewOverview() {
    if (!D.loaded) return periodBar() + '<p class="muted center pad">Loading the dashboard…</p>';
    var o = D.ov, k = (o && o.kpi) || {}, A = D.att || {};
    var net = (k.gross || 0) - (k.commission || 0) - (k.return_loss || 0);
    var dr = rate(k.cohort_delivered, k.cohort_lost);
    var html = periodBar() + errBox();

    html += '<div class="kpis">' +
      kpi("Net profit", money(net), "gross − advertiser commission − return shipping", net >= 0 ? "good big" : "bad big") +
      kpi("Revenue (delivered)", money(k.revenue)) +
      kpi("Gross profit", money(k.gross), "our price − DZ price") +
      kpi("Advertiser commission", money(k.commission), A.owed_total ? money(A.owed_total) + " still to pay" : "nothing to pay") +
      kpi("Orders placed", num(k.placed), "in " + periodLabel()) +
      kpi("Delivered", num(k.delivered)) +
      kpi("In progress now", num(k.in_progress), A.new_total ? A.new_total + " still to contact" : "") +
      kpi("Delivery rate", pct(dr), (k.cohort_lost || 0) + " lost (cancelled / returned)", dr != null && dr < 60 ? "bad" : "") +
      "</div>";

    var tips = insights();
    html += card("What to do now", tips.length
      ? '<ul class="tips">' + tips.map(function (t) {
          return '<li class="tip ' + t.tone + '"><span class="ti">' + t.icon + "</span><span>" + esc(t.text) + '</span><button type="button" class="tgo" data-goto="' + t.tab + '">Open →</button></li>';
        }).join("") + "</ul>"
      : '<p class="muted">Nothing urgent. Come back after more orders arrive.</p>');

    var daily = (o && o.daily) || [];
    var labels = daily.map(function (d) { return d.day; });
    html += '<div class="dgrid2">' +
      card("Orders per day", lineChart(labels, [{ values: daily.map(function (d) { return d.orders; }), color: "#3e7bfa", area: true }, { values: daily.map(function (d) { return d.delivered; }), color: "#16a34a" }], num) +
        '<p class="legend2"><i style="background:#3e7bfa"></i>placed <i style="background:#16a34a"></i>delivered</p>') +
      card("Net profit per day (on delivery date)", barChart(daily.map(function (d) { return d.profit; }), daily.map(function (d) { return shortDay(d.day); }), "#16a34a", num)) +
      "</div>";

    var f = (o && o.funnel) || {};
    var steps = [["Placed", f.placed], ["Contacted", f.contacted], ["Sent to DropDZ", f.sent], ["Confirmed", f.confirmed], ["Shipped", f.shipped], ["Delivered", f.delivered]];
    html += '<div class="dgrid2">' +
      card("Where orders drop out", hbars(steps.map(function (s, i) {
        return { label: s[0], value: s[1] || 0, text: num(s[1]) + (f.placed ? " · " + Math.round(((s[1] || 0) * 100) / f.placed) + "%" : ""), color: i === steps.length - 1 ? "#16a34a" : "#3e7bfa" };
      }))) +
      card("Where orders come from", donut([
        { label: "Website, no advertiser", value: k.src_web_direct || 0 },
        { label: "Website via advertisers", value: k.src_web_adv || 0 },
        { label: "App", value: k.src_app || 0 }], num)) +
      "</div>";

    var topP = D.products.filter(function (p) { return p.profit > 0 || p.units > 0; }).sort(function (a, b) { return b.profit - a.profit || b.units - a.units; }).slice(0, 6);
    var catItems = D.cats.map(function (c) { return { label: c.category, value: c.profit > 0 ? c.profit : 0 }; });
    var catFmt = money;
    if (!catItems.some(function (c) { return c.value > 0; })) { catItems = D.cats.map(function (c) { return { label: c.category, value: c.units }; }); catFmt = function (v) { return num(v) + " units"; }; }
    html += '<div class="dgrid2">' +
      card("Best products (net profit)", hbars(topP.map(function (p) { return { label: p.name, value: Math.max(p.profit, 0), text: money(p.profit), sub: p.delivered_units + " delivered of " + p.units + " ordered" }; }), "#3e7bfa") +
        '<button type="button" class="tgo wide" data-goto="products">All products →</button>') +
      card("Best categories", donut(catItems, catFmt)) +
      "</div>";

    var topA = D.advs.filter(function (a) { return a.orders > 0; }).sort(function (a, b) { return b.delivered - a.delivered || b.orders - a.orders; }).slice(0, 6);
    html += '<div class="dgrid2">' +
      card("Top advertisers (delivered orders)", hbars(topA.map(function (a) {
        return { label: (a.display_name || "") + " · " + a.promo_code, value: a.delivered, text: a.delivered + " delivered", sub: "of " + a.orders + " orders · " + pct(rate(a.delivered, a.lost)) + " delivered · owed " + money(a.balance) };
      }), "#8b5cf6") + '<button type="button" class="tgo wide" data-goto="advertisers">All advertisers →</button>') +
      card("Orders by wilaya", hbars(D.regions.slice(0, 8).map(function (r) {
        return { label: r.wilaya, value: r.orders, text: r.orders + " orders", sub: pct(rate(r.delivered, r.lost)) + " delivered of finished orders" };
      }), "#14b8a6")) +
      "</div>";

    var H = D.hours || { hours: [], weekdays: [] };
    var hv = (H.hours && H.hours.length ? H.hours : new Array(24).fill(0));
    html += '<div class="dgrid2">' +
      card("When people order (hour, Algeria time)", barChart(hv, hv.map(function (v, i) { return pad(i); }), "#f59e0b", num, 3)) +
      card("Which day", barChart(H.weekdays && H.weekdays.length ? H.weekdays : new Array(7).fill(0), WEEK, "#f59e0b", num, 1)) +
      "</div>";

    html += '<p class="muted small center">Net profit does not include your ad spend or delivery fees paid by you on delivered orders. Return shipping uses the shipping cost DropDZ reports.</p>';
    return html;
  }

  // ---------- ADVERTISERS ----------
  function advSorted() {
    var s = D.advSort, list = D.advs.slice();
    var f = { balance: function (a, b) { return b.balance - a.balance; }, earned: function (a, b) { return b.earned - a.earned; },
      orders: function (a, b) { return b.orders - a.orders; }, quality: function (a, b) { return (rate(b.delivered, b.lost) || -1) - (rate(a.delivered, a.lost) || -1); } };
    return list.sort(f[s] || f.balance);
  }
  function waAdvLink(a) {
    var phone = String(a.phone || "").replace(/\D/g, "").replace(/^0/, "213");
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent("Hello " + (a.display_name || "") + " 👋 Kampus Store here. Your balance right now is " + money(a.balance) + ".");
  }
  function advPanel(a) {
    var P = D.panel;
    if (!P || P.id !== a.advertiser_id) return "";
    if (P.kind === "pay") {
      return '<div class="apanel"><h4>Pay ' + esc(a.display_name || a.promo_code) + '</h4>' +
        '<label>Amount (DA)<input type="number" id="pay-amount" min="1" max="' + a.balance + '" value="' + a.balance + '" inputmode="numeric"></label>' +
        '<label>Method<select id="pay-method"><option>CCP</option><option>BaridiMob</option><option>Flexy</option><option>Cash</option><option>Other</option></select></label>' +
        '<label>Note (optional)<input id="pay-note" maxlength="120" placeholder="reference, receipt number…"></label>' +
        '<div class="oact"><button class="abtn api" type="button" data-adv="paygo" data-id="' + esc(a.advertiser_id) + '">Confirm payment</button><button class="abtn ghost" type="button" data-adv="close">Cancel</button></div>' +
        '<p class="muted small">This records the payment. Their balance goes down by this amount (full amount = 0 DA). Nothing is deleted.</p></div>';
    }
    if (P.kind === "history") {
      var rows = D.payouts[a.advertiser_id];
      return '<div class="apanel"><h4>Payments to ' + esc(a.display_name || a.promo_code) + "</h4>" + (!rows ? '<p class="muted">Loading…</p>' : !rows.length ? '<p class="muted">No payments yet.</p>' :
        '<ul class="list">' + rows.map(function (r) {
          return '<li class="' + (r.voided_at ? "voided" : "") + '"><span>' + esc(new Date(r.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })) + " · " + esc(r.method || "—") + (r.paid_by_name ? " · by " + esc(r.paid_by_name) : "") + (r.note ? " · " + esc(r.note) : "") + (r.voided_at ? " · CANCELLED" : "") + "</span><b>" + money(r.amount_dzd) + "</b>" +
            (r.voided_at ? "" : '<button class="mini" type="button" data-adv="void" data-pid="' + esc(r.payout_id) + '" data-id="' + esc(a.advertiser_id) + '">Cancel payment</button>') + "</li>";
        }).join("") + "</ul>") + '<div class="oact"><button class="abtn ghost" type="button" data-adv="close">Close</button></div></div>';
    }
    if (P.kind === "edit") {
      return '<div class="apanel"><h4>Edit ' + esc(a.display_name || a.promo_code) + "</h4>" +
        '<label>Commission % (of our profit)<input type="number" id="edit-pct" min="0" max="100" value="' + a.commission_percent + '" inputmode="numeric"></label>' +
        '<label class="chk"><input type="checkbox" id="edit-active"' + (a.active ? " checked" : "") + "> Account active</label>" +
        '<p class="muted small">A new percentage applies to NEW orders only. Old orders keep the percentage they were placed with.</p>' +
        '<div class="oact"><button class="abtn api" type="button" data-adv="save" data-id="' + esc(a.advertiser_id) + '">Save</button><button class="abtn ghost" type="button" data-adv="close">Cancel</button></div></div>';
    }
    return "";
  }
  function advCard(a) {
    var r = rate(a.delivered, a.lost);
    return '<article class="advcard' + (a.active ? "" : " paused") + '" data-id="' + esc(a.advertiser_id) + '">' +
      '<div class="ahead"><div><b class="aname">' + esc(a.display_name || "—") + '</b> <span class="chip-adv">' + esc(a.promo_code) + "</span>" + (a.active ? "" : ' <span class="pill grey">Paused</span>') +
      '<div class="muted small">' + esc(a.wilaya || "") + ' · <a class="tel" href="tel:' + esc(a.phone) + '" dir="ltr">' + esc(a.phone || "") + "</a> · " + a.commission_percent + "% commission</div></div>" +
      '<div class="abal"><span>Balance to pay</span><strong>' + money(a.balance) + "</strong></div></div>" +
      '<div class="amet">' +
        '<div><span>Orders</span><b>' + a.orders + "</b></div><div><span>Delivered</span><b>" + a.delivered + "</b></div>" +
        "<div><span>Delivered rate</span><b>" + pct(r) + "</b></div><div><span>Pending</span><b>" + money(a.pending) + "</b></div>" +
        "<div><span>Earned (all time)</span><b>" + money(a.earned) + "</b></div><div><span>Paid (all time)</span><b>" + money(a.paid) + "</b></div></div>" +
      '<div class="oact">' +
        '<button class="abtn api" type="button" data-adv="pay" data-id="' + esc(a.advertiser_id) + '"' + (a.balance > 0 ? "" : " disabled") + ">💰 Mark as paid</button>" +
        '<button class="abtn ghost" type="button" data-adv="history" data-id="' + esc(a.advertiser_id) + '">🕑 Payments</button>' +
        '<button class="abtn ghost" type="button" data-adv="edit" data-id="' + esc(a.advertiser_id) + '">✏ Edit</button>' +
        (a.phone ? '<a class="abtn ghost" target="_blank" rel="noopener" href="' + esc(waAdvLink(a)) + '">💬 WhatsApp</a>' : "") + "</div>" +
      advPanel(a) + "</article>";
  }
  function viewAdvertisers() {
    if (!D.loaded) return periodBar() + '<p class="muted center pad">Loading…</p>';
    var owed = D.advs.reduce(function (a, x) { return a + Math.max(x.balance, 0); }, 0);
    var paid = D.advs.reduce(function (a, x) { return a + x.paid; }, 0);
    var delivered = D.advs.reduce(function (a, x) { return a + x.delivered; }, 0);
    var sorts = [["balance", "Owed"], ["earned", "Earned"], ["orders", "Orders"], ["quality", "Delivery rate"]];
    return periodBar() + errBox() +
      '<div class="kpis">' + kpi("Owed to advertisers now", money(owed), "", owed > 0 ? "warn big" : "") + kpi("Paid out so far", money(paid)) +
        kpi("Advertisers", D.advs.length, D.advs.filter(function (a) { return a.active; }).length + " active") + kpi("Delivered via advertisers", num(delivered), "in " + periodLabel()) + "</div>" +
      '<div class="chips">' + sorts.map(function (s) { return '<button type="button" class="chip' + (D.advSort === s[0] ? " on" : "") + '" data-asort="' + s[0] + '">Sort: ' + s[1] + "</button>"; }).join("") + "</div>" +
      (D.advs.length ? advSorted().map(advCard).join("") : '<p class="muted center pad">No advertisers yet. They appear here when someone signs up at /partners.</p>');
  }

  // ---------- PRODUCTS ----------
  function badges(p, topIds) {
    var b = [];
    if (topIds.indexOf(p.product_id) > -1) b.push(["🏆 Top seller", "good"]);
    if (p.is_active && p.stock <= 0) b.push(["⛔ Out of stock", "bad"]);
    else if (p.per_day > 0 && p.days_left != null && p.days_left <= 5) b.push(["📦 Restock soon", "warn"]);
    if (p.delivered_units + p.lost_units >= 5 && p.return_rate >= 35) b.push(["↩ High returns", "bad"]);
    if (p.units > 0 && p.margin_pct != null && p.margin_pct < 15) b.push(["💸 Thin margin", "warn"]);
    if (p.units === 0 && p.stock >= 5 && (D.days === 0 || D.days >= 30)) b.push(["💤 No sales", "grey"]);
    if (!p.is_active) b.push(["Hidden", "grey"]);
    return b.map(function (x) { return '<span class="pill ' + x[1] + '">' + x[0] + "</span>"; }).join(" ");
  }
  function prodSorted() {
    var list = D.products.filter(function (p) { return !D.prodCat || p.category === D.prodCat; });
    var f = {
      profit: function (a, b) { return b.profit - a.profit || b.units - a.units; },
      units: function (a, b) { return b.units - a.units; },
      revenue: function (a, b) { return b.revenue - a.revenue; },
      returns: function (a, b) { return (b.return_rate || -1) - (a.return_rate || -1); },
      stock: function (a, b) { return (a.days_left == null ? 9999 : a.days_left) - (b.days_left == null ? 9999 : b.days_left); }
    };
    return list.sort(f[D.prodSort] || f.profit);
  }
  function prodCard(p, topIds) {
    var img = firstImage(p.images);
    var stock = p.stock <= 0 ? "0 in stock" : p.stock + " in stock" + (p.days_left != null ? " · ~" + Math.round(p.days_left) + " days left" : "");
    return '<article class="pcard2" data-name="' + esc(String(p.name || "").toLowerCase()) + '">' +
      '<div class="pimg2">' + (img ? '<img loading="lazy" src="' + esc(img) + '" alt="">' : "") + "</div>" +
      '<div class="pbody"><div class="ptitle"><b>' + esc(p.name) + '</b> <span class="muted small">' + esc(p.category) + "</span></div>" +
      '<div class="pbadges">' + badges(p, topIds) + "</div>" +
      '<div class="pmet">' +
        "<div><span>Net profit</span><b class=\"" + (p.profit > 0 ? "gr" : "") + '">' + money(p.profit) + "</b></div>" +
        "<div><span>Units ordered</span><b>" + p.units + "</b></div>" +
        "<div><span>Delivered</span><b>" + p.delivered_units + "</b></div>" +
        "<div><span>Returned / cancelled</span><b>" + pct(p.return_rate) + "</b></div>" +
        "<div><span>Price → margin</span><b>" + money(p.sell_price) + " · " + (p.margin_pct == null ? "—" : p.margin_pct + "%") + "</b></div>" +
        "<div><span>Cost (DZ price)</span><b>" + money(p.cost_price) + "</b></div></div>" +
      '<div class="muted small">' + esc(stock) + (p.per_day > 0 ? " · selling " + p.per_day + "/day" : "") + "</div></div></article>";
  }
  function viewProducts() {
    if (!D.loaded) return periodBar() + '<p class="muted center pad">Loading…</p>';
    var topIds = D.products.filter(function (p) { return p.profit > 0; }).slice(0, 3).map(function (p) { return p.product_id; });
    var cats = [""].concat(D.cats.map(function (c) { return c.category; }));
    var sorts = [["profit", "Net profit"], ["units", "Units"], ["revenue", "Revenue"], ["returns", "Returns (high)"], ["stock", "Stock left (low)"]];
    var catItems = D.cats.map(function (c) { return { label: c.category, value: c.profit > 0 ? c.profit : 0, text: money(c.profit), sub: c.units + " units · " + c.orders + " orders · " + pct(rate(c.delivered_units, c.lost_units)) + " delivered" }; });
    return periodBar() + errBox() +
      card("Categories (net profit)", hbars(catItems, "#3e7bfa")) +
      '<div class="chips">' + sorts.map(function (s) { return '<button type="button" class="chip' + (D.prodSort === s[0] ? " on" : "") + '" data-psort="' + s[0] + '">' + s[1] + "</button>"; }).join("") + "</div>" +
      '<div class="chips">' + cats.map(function (c) { return '<button type="button" class="chip' + (D.prodCat === c ? " on" : "") + '" data-pcat="' + esc(c) + '">' + (c ? esc(c) : "All categories") + "</button>"; }).join("") + "</div>" +
      '<input id="dq" class="asearch-in" type="search" placeholder="Search products…">' +
      '<div id="plist2">' + (D.products.length ? prodSorted().map(function (p) { return prodCard(p, topIds); }).join("") : '<p class="muted center pad">No products.</p>') + "</div>";
  }
  function mountProducts(body) {
    var q = body.querySelector("#dq");
    if (!q) return;
    q.addEventListener("input", function () {
      var t = q.value.trim().toLowerCase();
      body.querySelectorAll(".pcard2").forEach(function (c) { c.hidden = !!t && c.dataset.name.indexOf(t) === -1; });
    });
  }

  // ---------- clicks ----------
  function reload() { D.loadedAt = 0; return loadAll(true); }
  function openPanel(id, kind) {
    D.panel = { id: id, kind: kind };
    if (kind === "history") {
      rpc("admin_advertiser_payouts", { p_id: id }).then(function (rows) { D.payouts[id] = rows || []; K.repaint(); }).catch(function (e) { toast(e.message, true); });
    }
    K.repaint();
  }
  function friendly(e) {
    var m = String(e && e.message || e);
    if (/more_than_balance/.test(m)) return "That is more than the balance owed.";
    if (/nothing_to_pay/.test(m)) return "There is nothing to pay.";
    if (/bad_percent/.test(m)) return "Percentage must be between 0 and 100.";
    if (/forbidden/.test(m)) return "Only admins can do this.";
    return m;
  }

  document.getElementById("app").addEventListener("click", function (ev) {
    var t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.days !== undefined) { D.days = parseInt(t.dataset.days, 10); D.loaded = false; D.panel = null; K.repaint(); loadAll(true); return; }
    if (t.dataset.refresh) { reload(); toast("Refreshing…"); return; }
    if (t.dataset.goto) { K.goto(t.dataset.goto); return; }
    if (t.dataset.psort) { D.prodSort = t.dataset.psort; K.repaint(); return; }
    if (t.dataset.pcat !== undefined) { D.prodCat = t.dataset.pcat; K.repaint(); return; }
    if (t.dataset.asort) { D.advSort = t.dataset.asort; K.repaint(); return; }
    var act = t.dataset.adv;
    if (!act) return;
    var id = t.dataset.id;
    if (act === "pay" || act === "history" || act === "edit") { openPanel(id, act); return; }
    if (act === "close") { D.panel = null; K.repaint(); return; }

    if (act === "paygo") {
      var a = D.advs.filter(function (x) { return x.advertiser_id === id; })[0];
      var amount = parseInt(document.getElementById("pay-amount").value, 10);
      var method = document.getElementById("pay-method").value;
      var note = document.getElementById("pay-note").value;
      if (!amount || amount < 1) { toast("Enter an amount.", true); return; }
      if (!window.confirm("Pay " + money(amount) + " to " + (a.display_name || a.promo_code) + " by " + method + "?\nTheir balance will become " + money(a.balance - amount) + ".")) return;
      t.disabled = true;
      rpc("admin_pay_advertiser", { p_advertiser: id, p_amount: amount, p_method: method, p_note: note || null })
        .then(function (r) { toast("Paid " + money(r.paid) + ". New balance " + money(r.balance)); D.panel = null; delete D.payouts[id]; return reload(); })
        .catch(function (e) { toast(friendly(e), true); t.disabled = false; });
      return;
    }
    if (act === "void") {
      if (!window.confirm("Cancel this payment? The money goes back to the advertiser's balance.")) return;
      rpc("admin_void_payout", { p_id: t.dataset.pid })
        .then(function () { toast("Payment cancelled"); return rpc("admin_advertiser_payouts", { p_id: id }); })
        .then(function (rows) { D.payouts[id] = rows || []; return reload(); })
        .catch(function (e) { toast(friendly(e), true); });
      return;
    }
    if (act === "save") {
      var pctv = parseInt(document.getElementById("edit-pct").value, 10);
      var active = document.getElementById("edit-active").checked;
      rpc("admin_update_advertiser", { p_id: id, p_active: active, p_commission: pctv })
        .then(function () { toast("Saved"); D.panel = null; return reload(); })
        .catch(function (e) { toast(friendly(e), true); });
    }
  });

  K.register({ id: "overview", label: "Overview", order: 10, render: viewOverview, load: function () { return loadAll(false); } });
  K.register({ id: "advertisers", label: "Advertisers", order: 30, render: viewAdvertisers, load: function () { return loadAll(false); } });
  K.register({ id: "products", label: "Products", order: 40, render: viewProducts, load: function () { return loadAll(false); }, mount: mountProducts });
})();
