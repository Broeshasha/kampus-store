import { BRAND, STRINGS } from "./i18n.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const money = (n, currency) =>
  new Intl.NumberFormat("fr-FR").format(Number(n) || 0).replace(/[\u202f\u00a0]/g, " ") + " " + currency;

// Finds every image link inside the "images" column, whatever its format
// (list of links, list of objects, nested object, or text containing JSON).
const IMG_START = /^(https?:)?\/\//i;
const ONE_IMAGE_KEYS = ["url", "src", "publicUrl", "image", "image_url", "original", "large", "full"];
export function allImages(images) {
  const out = [];
  const walk = (x, depth) => {
    if (x == null || depth > 5) return;
    if (typeof x === "string") {
      const v = x.trim();
      if (v[0] === "[" || v[0] === "{") {
        try { return walk(JSON.parse(v), depth + 1); } catch (e) {}
      }
      if (IMG_START.test(v) || v[0] === "/") out.push(v);
      return;
    }
    if (Array.isArray(x)) return x.forEach((y) => walk(y, depth + 1));
    if (typeof x === "object") {
      for (const k of ONE_IMAGE_KEYS) {
        if (typeof x[k] === "string" && x[k]) return walk(x[k], depth + 1);
      }
      Object.values(x).forEach((y) => walk(y, depth + 1));
    }
  };
  walk(images, 0);
  return [...new Set(out)];
}
export const firstImage = (images) => allImages(images)[0] || "";

export const backIcon =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';

export const shareIcon =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';

// product cards (home page and "My page")
export function productCards(products, t, refCode) {
  const q = refCode ? "?ref=" + encodeURIComponent(refCode) : "";
  return products
    .map((p) => {
      const img = firstImage(p.images);
      const href = `/p/${encodeURIComponent(p.slug)}`;
      let badge = "";
      if (p.stock <= 0) badge = `<span class="badge out">${esc(t.outOfStock)}</span>`;
      else if (p.stock <= 5) badge = `<span class="badge low">${esc(t.onlyLeft.replace("{n}", p.stock))}</span>`;
      return `<article class="card" data-name="${esc((p.name || "").toLowerCase())}" data-cat="${esc(p.category || "")}">
  <a href="${href}${q}" class="card-img">${img ? `<img loading="lazy" src="${esc(img)}" alt="${esc(p.name)}">` : ""}${badge}</a>
  <button class="share" type="button" data-share data-url="${href}" data-title="${esc(p.name)}" data-price="${esc(money(p.sell_price, t.currency))}" data-img="${esc(img)}" aria-label="${esc(t.share)}">${shareIcon}</button>
  <div class="card-body">
    <a href="${href}${q}" class="card-title">${esc(p.name)}</a>
    <div class="price">${money(p.sell_price, t.currency)}</div>
    <a class="btn" href="${href}${q}">${esc(t.orderNow)}</a>
  </div>
</article>`;
    })
    .join("");
}

const WA_PATH = "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z";

// floating "WhatsApp us" button (opens a chat with the support number, with the current page link)
export function waFloat(lang, pageUrl) {
  const t = STRINGS[lang];
  const text = t.waHello + (pageUrl ? "\n" + pageUrl : "");
  return `<a class="wa-float" href="https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener" aria-label="${esc(t.waLabel)}"><svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="#fff" d="${WA_PATH}"/></svg><span>${esc(t.waLabel)}</span></a>`;
}

export function page({ lang, origin, title, description = "", image = "", url = "", body, status = 200, refCode = "" }) {
  const t = STRINGS[lang];
  const marquee = t.marquee.map((x) => `<span>${esc(x)}</span>`).join("");
  const tJson = JSON.stringify(t).replace(/</g, "\\u003c");
  const og = image || `${origin}${BRAND.logo}`;
  const switcher = [
    ["ar", "عربية"],
    ["fr", "FR"],
    ["en", "EN"],
  ]
    .map(([code, label]) => `<button type="button" class="lang${code === lang ? " on" : ""}" data-lang="${code}">${label}</button>`)
    .join("");

  const html = `<!doctype html>
<html lang="${lang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#3e7bfa">
<link rel="icon" href="${BRAND.logo}">
<link rel="apple-touch-icon" href="${BRAND.logo}">
<meta property="og:site_name" content="${esc(BRAND.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
${url ? `<meta property="og:url" content="${esc(url)}">` : ""}
<meta property="og:image" content="${esc(og)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<div class="marquee"><div class="track">${marquee}${marquee}${marquee}${marquee}</div></div>
<header class="top">
  <div class="top-in">
    <a href="/" class="brand"><img src="${BRAND.logo}" alt="" class="logo"><span>${esc(BRAND.name)}</span></a>
    <div class="langs">${switcher}</div>
  </div>
</header>
<main>${body}</main>
<footer class="foot">© ${new Date().getFullYear()} ${esc(BRAND.name)}</footer>
<div id="toast" class="toast" hidden></div>
${waFloat(lang, url)}
<script>window.__T=${tJson};window.__REF=${JSON.stringify(String(refCode || ''))};</script>
<script src="/app.js" defer></script>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, max-age=0, must-revalidate",
      vary: "Accept-Language, Cookie",
    },
  });
}
