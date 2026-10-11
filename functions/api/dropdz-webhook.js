import { sbGet, getSetting } from "../_lib/supa.js";
import { STAGE_FROM_EVENT, STAGE_FROM_STATUS, applyStage } from "../_lib/dropdz.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// DropDZ calls this address when an order changes (confirmed, shipped, delivered, returned...)
export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  const sent = (request.headers.get("x-dropdz-signature") || "").trim().replace(/^sha256=/i, "").toLowerCase();

  let secret = null;
  try { secret = (await getSetting(env, "dropdz_webhook_secret")) || env.DROPDZ_WEBHOOK_SECRET || null; } catch (e) {}
  if (!secret) return Response.json({ error: "webhook_not_configured" }, { status: 503 });

  let body;
  try { body = JSON.parse(raw); } catch (e) { return Response.json({ error: "bad_json" }, { status: 400 }); }

  // signature = HMAC-SHA256 of the body (we accept the raw text or the re-written JSON)
  const okRaw = sent && safeEqual(await hmacHex(secret, raw), sent);
  const okJson = !okRaw && sent && safeEqual(await hmacHex(secret, JSON.stringify(body)), sent);
  if (!okRaw && !okJson) return Response.json({ error: "bad_signature" }, { status: 401 });

  try {
    const event = String(body.event || body.type || body.eventType || body.name || "");
    const d = body.data || body.order || body.payload || body;
    const o = d.order || d;
    const ext = String(o.externalId || o.external_id || "");
    const dzId = o.id || o.orderId || "";
    const num = o.orderNumber || o.order_number || "";

    let filter = null;
    if (UUID.test(ext)) filter = `id=eq.${ext}`;
    else if (dzId) filter = `dropdz_order_id=eq.${encodeURIComponent(dzId)}`;
    else if (num) filter = `dropdz_order_number=eq.${encodeURIComponent(num)}`;
    if (!filter) return Response.json({ ok: true, ignored: "no_order_reference" });

    const [order] = await sbGet(env, `kampus_store_orders?${filter}&select=id,stage,dropdz_status&limit=1`, { service: true });
    if (!order) return Response.json({ ok: true, ignored: "unknown_order" });

    const status = o.status ? String(o.status).toUpperCase() : null;
    const stage = STAGE_FROM_EVENT[event] || STAGE_FROM_STATUS[status] || null;
    const extra = {};
    if (Number.isFinite(o.shippingCost)) extra.dropdz_shipping_dzd = Math.round(o.shippingCost);
    if (Number.isFinite(o.totalAmount)) extra.dropdz_total_dzd = Math.round(o.totalAmount);
    const res = await applyStage(env, order, stage, status, "webhook", extra);
    return Response.json({ ok: true, changed: res.changed });
  } catch (e) {
    console.error("WEBHOOK ERROR", e);
    return Response.json({ error: "server" }, { status: 500 }); // DropDZ will retry
  }
}
