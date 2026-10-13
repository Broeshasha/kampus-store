import { BRAND, STRINGS, pickLang } from "./_lib/i18n.js";
import { sbGet } from "./_lib/supa.js";
import { page, esc, productCards } from "./_lib/layout.js";
import { trackVisit } from "./_lib/track.js";

export async function onRequestGet({ request, env, ctx }) {
  const lang = pickLang(request);
  const t = STRINGS[lang];
  const origin = new URL(request.url).origin;

  let products = [];
  try {
    products = await sbGet(
      env,
      "store_products_public?select=id,slug,name,category,images,sell_price,stock&order=name.asc&limit=1000",
      { cache: 60 }
    );
  } catch (e) {
    console.error(e);
  }

  const cats = [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
  const chips =
    `<button class="chip on" data-cat="">${esc(t.all)}</button>` +
    cats.map((c) => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join("");

  const cards = productCards(products, t);

  const body = `
<section class="hero"><h1>${esc(BRAND.name)}</h1><p>${esc(t.tagline)}</p></section>
<div class="tools">
  <input id="q" type="search" placeholder="${esc(t.search)}">
  <div class="chips">${chips}</div>
</div>
<div class="grid" id="grid">${cards}</div>
<p id="empty" class="muted center" ${products.length ? "hidden" : ""}>${esc(t.noProducts)}</p>`;

  const res = page({
    lang,
    origin,
    title: `${BRAND.name} — ${t.tagline}`,
    description: t.tagline,
    url: origin + "/",
    body,
  });
  const cookie = trackVisit(request, env, ctx, "");
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}
