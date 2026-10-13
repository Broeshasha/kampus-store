import { BRAND, STRINGS, pickLang } from "./_lib/i18n.js";
import { sbGet } from "./_lib/supa.js";
import { page, esc, productCards } from "./_lib/layout.js";
import { trackVisit } from "./_lib/track.js";

// "My page" of an advertiser:  /a/CODE   (their picks, or the whole store if they picked nothing)
export async function onRequestGet({ request, env, ctx, params }) {
  const lang = pickLang(request);
  const t = STRINGS[lang];
  const origin = new URL(request.url).origin;
  const code = String(params.code || "").toUpperCase();
  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) return Response.redirect(origin + "/", 302);

  let adv = null, picks = [], products = [];
  try {
    [adv] = await sbGet(env, `advertisers?promo_code=eq.${encodeURIComponent(code)}&active=eq.true&select=id,display_name&limit=1`, { service: true });
  } catch (e) { console.error(e); }
  if (!adv) return Response.redirect(origin + "/", 302);
  try {
    picks = (await sbGet(env, `advertiser_picks?advertiser_id=eq.${adv.id}&select=product_id`, { service: true })).map((r) => r.product_id);
  } catch (e) { console.error(e); }
  try {
    products = await sbGet(env, "store_products_public?select=id,slug,name,category,images,sell_price,stock&order=name.asc&limit=1000", { cache: 60 });
  } catch (e) { console.error(e); }

  const chosen = picks.length ? products.filter((p) => picks.includes(p.id)) : products;
  const first = String(adv.display_name || "").trim().split(/\s+/)[0] || code;
  const body = `
<section class="hero"><h1>${esc(t.selectedBy.replace("{name}", first))}</h1><p>${esc(t.tagline)}</p></section>
<div class="grid" id="grid">${productCards(chosen, t, code)}</div>
<p class="muted center" ${chosen.length ? "hidden" : ""}>${esc(t.noProducts)}</p>`;

  const res = page({ lang, origin, title: `${first} · ${BRAND.name}`, description: t.tagline, url: `${origin}/a/${code}`, body, refCode: code });
  const cookie = trackVisit(request, env, ctx, "", code);
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}
