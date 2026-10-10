import { BRAND, STRINGS, pickLang } from "./_lib/i18n.js";
import { sbGet } from "./_lib/supa.js";
import { page, esc, money, firstImage, shareIcon } from "./_lib/layout.js";

export async function onRequestGet({ request, env }) {
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

  const cards = products
    .map((p) => {
      const img = firstImage(p.images);
      const href = `/p/${encodeURIComponent(p.slug)}`;
      let badge = "";
      if (p.stock <= 0) badge = `<span class="badge out">${esc(t.outOfStock)}</span>`;
      else if (p.stock <= 5) badge = `<span class="badge low">${esc(t.onlyLeft.replace("{n}", p.stock))}</span>`;
      return `<article class="card" data-name="${esc((p.name || "").toLowerCase())}" data-cat="${esc(p.category || "")}">
  <a href="${href}" class="card-img">${img ? `<img loading="lazy" src="${esc(img)}" alt="${esc(p.name)}">` : ""}${badge}</a>
  <button class="share" type="button" data-share data-url="${href}" data-title="${esc(p.name)}" aria-label="${esc(t.share)}">${shareIcon}</button>
  <div class="card-body">
    <a href="${href}" class="card-title">${esc(p.name)}</a>
    <div class="price">${money(p.sell_price, t.currency)}</div>
    <a class="btn" href="${href}">${esc(t.orderNow)}</a>
  </div>
</article>`;
    })
    .join("");

  const body = `
<section class="hero"><h1>${esc(BRAND.name)}</h1><p>${esc(t.tagline)}</p></section>
<div class="tools">
  <input id="q" type="search" placeholder="${esc(t.search)}">
  <div class="chips">${chips}</div>
</div>
<div class="grid" id="grid">${cards}</div>
<p id="empty" class="muted center" ${products.length ? "hidden" : ""}>${esc(t.noProducts)}</p>`;

  return page({
    lang,
    origin,
    title: `${BRAND.name} — ${t.tagline}`,
    description: t.tagline,
    url: origin + "/",
    body,
  });
}
