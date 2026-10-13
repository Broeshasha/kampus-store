import { BRAND, pickLang } from "./_lib/i18n.js";
import { PSTR, CAPTIONS, STORY } from "./_lib/partner_i18n.js";
import { esc, waFloat } from "./_lib/layout.js";

// The advertiser (partners) website shell. All the logic runs in /partners.js
export async function onRequestGet({ request, env }) {
  const lang = pickLang(request);
  const t = PSTR[lang];
  const origin = new URL(request.url).origin;

  // the anon key is public by design (it is safe in the browser)
  const cfg = {
    url: env.SUPABASE_URL,
    anon: env.SUPABASE_ANON_KEY,
    store: String(env.STORE_URL || origin).replace(/\/$/, ""),
    lang,
    T: t,
    caps: CAPTIONS,
    story: STORY,
  };
  const cfgJson = JSON.stringify(cfg).replace(/</g, "\\u003c");

  const switcher = [["ar", "عربية"], ["fr", "FR"], ["en", "EN"]]
    .map(([c, l]) => `<button type="button" class="lang${c === lang ? " on" : ""}" data-lang="${c}">${l}</button>`)
    .join("");

  const html = `<!doctype html>
<html lang="${lang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#3e7bfa">
<title>${esc(t.title)} — ${esc(BRAND.name)}</title>
<link rel="icon" href="${BRAND.logo}">
<link rel="apple-touch-icon" href="${BRAND.logo}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/partners.css">
</head>
<body class="partners">
<header class="top">
  <div class="top-in">
    <a href="/partners" class="brand"><img src="${BRAND.logo}" alt="" class="logo"><span>${esc(t.title)}</span></a>
    <div class="top-right">
      <div class="langs">${switcher}</div>
      <button id="logout" class="logout" type="button" hidden>${esc(t.logout)}</button>
    </div>
  </div>
</header>
<main id="app" class="pmain"><p class="muted center pad">${esc(t.loading)}</p></main>
<div id="toast" class="toast" hidden></div>
${waFloat(lang, origin + "/partners")}
<script>window.__CFG=${cfgJson};</script>
<script src="/partners-app.js"></script>
<script src="/partners-promote.js"></script>
<script>setTimeout(function(){if(!window.__PARTNERS_OK){var a=document.getElementById("app");if(a)a.innerHTML='<p class="error center pad">'+window.__CFG.T.loadFail+"</p>";}},6000);</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store",
      vary: "Accept-Language, Cookie",
    },
  });
}
