import { BRAND, STRINGS, pickLang } from "../_lib/i18n.js";
import { sbGet } from "../_lib/supa.js";
import { page, esc, money, allImages, shareIcon } from "../_lib/layout.js";

export async function onRequestGet({ request, env, params }) {
  const lang = pickLang(request);
  const t = STRINGS[lang];
  const origin = new URL(request.url).origin;
  const slug = String(params.slug || "");

  let product = null;
  let wilayas = [];
  try {
    const rows = await sbGet(env, `store_products_public?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`, { cache: 30 });
    product = rows[0] || null;
    if (product) wilayas = await sbGet(env, "wilayas?select=id,name&order=id", { cache: 3600 });
  } catch (e) {
    console.error(e);
  }

  if (!product) {
    return page({
      lang,
      origin,
      title: t.notFound,
      status: 404,
      body: `<section class="center pad"><h1>${esc(t.notFound)}</h1><p><a class="btn" href="/">${esc(t.backToStore)}</a></p></section>`,
    });
  }

  const imgs = allImages(product.images);
  const url = `${origin}/p/${encodeURIComponent(product.slug)}`;
  const desc = (product.description || t.tagline).replace(/\s+/g, " ").slice(0, 160);
  const soldOut = product.stock <= 0;
  const maxQty = Math.max(1, Math.min(10, product.stock));

  const gallery = `
<div class="gallery">
  <div class="main-img">${imgs[0] ? `<img id="main-img" src="${esc(imgs[0])}" alt="${esc(product.name)}">` : ""}</div>
  ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((i) => `<img src="${esc(i)}" data-full="${esc(i)}" alt="">`).join("")}</div>` : ""}
</div>`;

  const wilayaOpts =
    `<option value="">${esc(t.chooseWilaya)}</option>` +
    wilayas.map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join("");

  const form = soldOut
    ? `<p class="badge out big">${esc(t.outOfStock)}</p>`
    : `<form id="order-form" class="form" data-price="${esc(product.sell_price)}" data-product="${esc(product.id)}" novalidate>
  <h2>${esc(t.orderTitle)}</h2>
  <input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
  <label>${esc(t.fullName)}<input name="name" required autocomplete="name"></label>
  <label>${esc(t.phone)}<input name="phone" type="tel" inputmode="tel" dir="ltr" required autocomplete="tel"></label>
  <div class="row2">
    <label>${esc(t.wilaya)}<select name="wilaya" required>${wilayaOpts}</select></label>
    <label>${esc(t.commune)}<select name="commune" required disabled><option value="">${esc(t.chooseCommune)}</option></select></label>
  </div>
  <label>${esc(t.address)}<input name="address" required autocomplete="street-address"></label>
  <div class="row2">
    <label>${esc(t.quantity)}<input name="qty" type="number" min="1" max="${maxQty}" value="1" inputmode="numeric" dir="ltr"></label>
    <label>${esc(t.promo)}<input name="promo" dir="ltr" autocapitalize="characters" maxlength="30"></label>
  </div>
  <div class="total"><span>${esc(t.total)}</span><strong id="total">${money(product.sell_price, t.currency)}</strong></div>
  <p class="muted small">${esc(t.deliveryNote)}</p>
  <p id="form-error" class="error" hidden></p>
  <button class="btn big" type="submit">${esc(t.confirmBtn)}</button>
</form>
<div id="thanks" class="thanks" hidden>
  <h2>${esc(t.thanksTitle)}</h2>
  <p>${esc(t.thanksText)} <strong id="order-ref" dir="ltr"></strong></p>
  <p><a class="btn" href="/">${esc(t.backToStore)}</a></p>
</div>`;

  const body = `
<section class="product">
  ${gallery}
  <div class="info">
    <h1>${esc(product.name)}</h1>
    <div class="price big">${money(product.sell_price, t.currency)}</div>
    <button class="share-btn" type="button" data-share data-url="/p/${encodeURIComponent(product.slug)}" data-title="${esc(product.name)}">${shareIcon} <span>${esc(t.share)}</span></button>
    ${product.description ? `<p class="desc">${esc(product.description)}</p>` : ""}
    ${form}
  </div>
</section>`;

  return page({ lang, origin, title: `${product.name} — ${BRAND.name}`, description: desc, image: imgs[0] || "", url, body });
}
