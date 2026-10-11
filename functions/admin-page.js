import { BRAND } from "./_lib/i18n.js";
import { esc } from "./_lib/layout.js";

// The admin website shell (English). All logic runs in /admin-app.js
export async function onRequestGet({ request, env }) {
  const cfg = { url: env.SUPABASE_URL, anon: env.SUPABASE_ANON_KEY };
  const cfgJson = JSON.stringify(cfg).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#0e0f11">
<title>Admin — ${esc(BRAND.name)}</title>
<link rel="icon" href="${BRAND.logo}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
<link rel="stylesheet" href="/style.css">
<link rel="stylesheet" href="/admin.css">
</head>
<body class="admin">
<header class="atop">
  <div class="atop-in">
    <a href="/admin" class="brand"><img src="${BRAND.logo}" alt="" class="logo"><span>Admin</span></a>
    <div class="atop-right">
      <select id="walang" class="walang" title="WhatsApp message language" hidden>
        <option value="fr">WhatsApp: FR</option><option value="ar">WhatsApp: عربية</option><option value="en">WhatsApp: EN</option>
      </select>
      <button id="logout" class="logout" type="button" hidden>Log out</button>
    </div>
  </div>
</header>
<main id="app" class="amain"><p class="muted center pad">Loading…</p></main>
<div id="toast" class="toast" hidden></div>
<script>window.__CFG=${cfgJson};</script>
<script src="/admin-app.js"></script>
<script>setTimeout(function(){if(!window.__ADMIN_OK){var a=document.getElementById("app");if(a)a.innerHTML='<p class="error center pad">The page could not start. Refresh. If it keeps happening, check that public/admin-app.js exists on GitHub.</p>';}},6000);</script>
</body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex" },
  });
}
