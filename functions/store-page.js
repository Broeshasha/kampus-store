import { BRAND, STRINGS, pickLang } from "./_lib/i18n.js";
import { sbGet } from "./_lib/supa.js";
import { page, esc, productCards } from "./_lib/layout.js";
import { storeBySlug } from "./_lib/store.js";
import { themeCss, themeOf } from "./_lib/themes.js";
import { trackVisit } from "./_lib/track.js";

// An advertiser's own store:  /s/their-name
export async function onRequestGet({ request, env, ctx, params }) {
  const lang = pickLang(request);
  const t = STRINGS[lang];
  const origin = new URL(request.url).origin;
  const slug = String(params.slug || "").toLowerCase();
  const found = await storeBySlug(env, slug);

  if (!found) {
    return page({
      lang, origin, status: 404, title: BRAND.name,
      body: `<section class="center pad"><h1>${esc(t.notFound)}</h1><p><a class="btn" href="/">${esc(t.backToStore)}</a></p></section>`,
    });
  }
  const { store, adv } = found;
  const code = adv.promo_code;

  let picks = [], products = [];
  try {
    picks = (await sbGet(env, `advertiser_picks?advertiser_id=eq.${adv.id}&select=product_id,position&order=position.asc`, { service: true })).map((r) => r.product_id);
  } catch (e) { console.error(e); }
  try {
    products = await sbGet(env, "store_products_public?select=id,slug,name,category,images,sell_price,stock&order=name.asc&limit=1000", { cache: 60 });
  } catch (e) { console.error(e); }

  // the advertiser's own order; if they picked nothing, show the whole store
  const byId = new Map(products.map((p) => [p.id, p]));
  const chosen = picks.length ? picks.map((id) => byId.get(id)).filter(Boolean) : products;

  const theme = themeOf(store.theme);
  const logo = store.logo_url ? esc(store.logo_url) : "";
  const phone = String(adv.phone || "").replace(/\D/g, "").replace(/^0/, "213");
  const soc = [];
  if (store.chat_whatsapp && phone) soc.push(`<a class="soc chat" href="https://wa.me/${phone}?text=${encodeURIComponent("👋 " + store.name)}" target="_blank" rel="noopener">💬 ${esc(t.chatWith.replace("{name}", store.name))}</a>`);
  if (store.instagram) soc.push(`<a class="soc" href="https://instagram.com/${encodeURIComponent(store.instagram)}" target="_blank" rel="noopener">Instagram</a>`);
  if (store.tiktok) soc.push(`<a class="soc" href="https://www.tiktok.com/@${encodeURIComponent(store.tiktok)}" target="_blank" rel="noopener">TikTok</a>`);
  if (store.facebook) soc.push(`<a class="soc" href="https://facebook.com/${encodeURIComponent(store.facebook)}" target="_blank" rel="noopener">Facebook</a>`);

  const body = `
${store.announcement ? `<div class="annbar">${esc(store.announcement)}</div>` : ""}
<section class="storehero">${logo ? `<img class="slogo" src="${logo}" alt="">` : ""}<h1>${esc(store.name)}</h1>${store.tagline ? `<p>${esc(store.tagline)}</p>` : ""}${soc.length ? `<div class="socials">${soc.join("")}</div>` : ""}</section>
<div class="grid" id="grid">${productCards(chosen, t, code)}</div>
<p class="muted center" ${chosen.length ? "hidden" : ""}>${esc(t.noProducts)}</p>`;

  const report = `https://wa.me/${BRAND.whatsapp}?text=${encodeURIComponent("Report store: " + origin + "/s/" + slug)}`;
  const res = page({
    lang, origin,
    title: store.name + (store.tagline ? " — " + store.tagline : ""),
    description: store.tagline || t.tagline,
    image: store.logo_url || "",
    url: `${origin}/s/${slug}`,
    body, refCode: code,
    siteName: store.name, icon: store.logo_url || "", themeColor: theme.head,
    extraCss: themeCss(store.theme),
    brandHtml: `<a href="/s/${esc(slug)}" class="brand">${logo ? `<img src="${logo}" alt="" class="logo round">` : ""}<span>${esc(store.name)}</span></a>`,
    footHtml: `<p class="powered"><a href="/">${esc(t.poweredBy)}</a><br>${esc(t.poweredNote)}<br><a href="${esc(report)}" target="_blank" rel="noopener">${esc(t.reportStore)}</a></p>`,
  });
  const cookie = trackVisit(request, env, ctx, "", code);
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}
