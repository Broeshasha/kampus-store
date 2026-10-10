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

export function page({ lang, origin, title, description = "", image = "", url = "", body, status = 200 }) {
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
<script>window.__T=${tJson};</script>
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
