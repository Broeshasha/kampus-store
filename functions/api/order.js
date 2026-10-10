import { sbGet, sbInsert } from "../_lib/supa.js";

// This file ONLY saves the order as "pending".
// Your team then WhatsApps / calls the customer, and only after that
// the order is sent to DropDZ (same process as orders from the app).

const json = (obj, status = 200) => Response.json(obj, { status });
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const normPhone = (v) => String(v ?? "").replace(/[\s.\-()]/g, "").replace(/^(\+|00)?213/, "0");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function onRequestPost({ request, env }) {
  let b;
  try {
    b = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  // hidden field only bots fill in
  if (b.website) return json({ ok: true, ref: "OK" });

  const name = clean(b.name, 80);
  const phone = normPhone(b.phone);
  const commune = clean(b.commune, 80);
  const address = clean(b.address, 200);
  const qty = parseInt(b.qty, 10);
  const wilayaId = parseInt(b.wilaya, 10);
  const productId = String(b.product_id || "");
  const promo = clean(b.promo, 30).toUpperCase();

  if (!UUID.test(productId)) return json({ error: "bad_request" }, 400);
  if (name.length < 3) return json({ error: "invalid_name" }, 400);
  if (!/^0[567]\d{8}$/.test(phone)) return json({ error: "invalid_phone" }, 400);
  if (!Number.isInteger(wilayaId) || !commune) return json({ error: "invalid_location" }, 400);
  if (address.length < 5) return json({ error: "invalid_address" }, 400);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) return json({ error: "invalid_quantity" }, 400);

  try {
    // 1) product (real prices come from the database, never from the browser)
    const [product] = await sbGet(
      env,
      `kampus_store_products?id=eq.${productId}&is_active=eq.true&select=id,sell_price,cost_price,stock&limit=1`,
      { service: true }
    );
    if (!product) return json({ error: "not_found" }, 404);
    if (product.stock < qty) return json({ error: "out_of_stock" }, 409);

    // 2) wilaya name
    const [wilaya] = await sbGet(env, `wilayas?id=eq.${wilayaId}&select=name&limit=1`, { cache: 3600 });
    if (!wilaya) return json({ error: "invalid_location" }, 400);

    // 3) same phone + same product in the last 10 minutes = double click / spam
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const dup = await sbGet(
      env,
      `kampus_store_orders?buyer_phone=eq.${encodeURIComponent(phone)}&product_id=eq.${productId}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`,
      { service: true }
    );
    if (dup.length) return json({ error: "duplicate" }, 429);

    // 4) advertiser from promo code
    let advertiserId = null;
    let referral = null;
    let commission = 0;
    if (/^[A-Z0-9_-]{2,30}$/.test(promo)) {
      const [adv] = await sbGet(
        env,
        `advertisers?promo_code=eq.${encodeURIComponent(promo)}&active=eq.true&select=id,phone,commission_percent&limit=1`,
        { service: true }
      );
      // an advertiser ordering with their own phone earns nothing
      if (adv && normPhone(adv.phone) !== phone) {
        const margin = Math.max(product.sell_price - product.cost_price, 0);
        const perUnit = Math.max(Math.round((margin * adv.commission_percent) / 100), 0);
        advertiserId = adv.id;
        referral = promo;
        commission = perUnit * qty;
      }
    }

    // 5) save the order as pending (waits for your WhatsApp / call)
    const [order] = await sbInsert(env, "kampus_store_orders", {
      product_id: product.id,
      quantity: qty,
      status: "pending_call",
      buyer_full_name: name,
      buyer_phone: phone,
      buyer_wilaya: wilaya.name,
      buyer_commune: commune,
      buyer_address: address,
      referral_code: referral,
      advertiser_id: advertiserId,
      unit_price_dzd: product.sell_price,
      commission_dzd: commission,
    });

    return json({ ok: true, ref: String(order.id).slice(0, 8).toUpperCase() });
  } catch (e) {
    console.error("ORDER ERROR", e);
    return json({ error: "server" }, 500);
  }
}
