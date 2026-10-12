import { sbGet, sbPatch, getSetting, setSetting } from "../_lib/supa.js";
import { dz, errMsg, resolveLocation, applyStage, logEvent, reconcile, STAGE_FROM_STATUS } from "../_lib/dropdz.js";

class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}
const json = (obj, status = 200) => Response.json(obj, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// only logged-in users whose profile has is_admin = true get through
async function requireAdmin(request, env) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "not_logged_in");
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new HttpError(401, "not_logged_in");
  const user = await r.json();
  const [prof] = await sbGet(env, `profiles?id=eq.${encodeURIComponent(user.id)}&select=id,username,is_admin&limit=1`, { service: true });
  if (!prof || prof.is_admin !== true) throw new HttpError(403, "not_admin");
  return { id: user.id, name: prof.username || "admin" };
}

async function loadOrder(env, id) {
  if (!UUID.test(String(id || ""))) throw new HttpError(400, "bad_order_id");
  const [o] = await sbGet(env, `kampus_store_orders?id=eq.${id}&select=*&limit=1`, { service: true });
  if (!o) throw new HttpError(404, "order_not_found");
  return o;
}
const view = (o, extra) => ({
  id: o.id, stage: o.stage, whatsapped_at: o.whatsapped_at, sent_at: o.sent_at, delivered_at: o.delivered_at,
  dropdz_order_number: o.dropdz_order_number, dropdz_status: o.dropdz_status,
  dropdz_shipping_dzd: o.dropdz_shipping_dzd, send_error: o.send_error, ...(extra || {}),
});

// ---- 1) tapped WhatsApp ----
async function whatsapp(env, admin, order) {
  const patch = {};
  if (!order.whatsapped_at) { patch.whatsapped_at = new Date().toISOString(); patch.whatsapped_by = admin.id; }
  if (order.stage === "new") patch.stage = "whatsapped";
  if (!Object.keys(patch).length) return view(order, { whatsapped_by_name: admin.name });
  const [row] = await sbPatch(env, "kampus_store_orders", `id=eq.${order.id}`, patch);
  await logEvent(env, order.id, "whatsapped", { by: admin.name });
  return view(row, { whatsapped_by_name: admin.name });
}

// ---- 2) tapped Call API: create the order at DropDZ ----
async function send(env, admin, order) {
  if (order.dropdz_order_id) return view(order, { already: true });
  if (["cancelled", "returned", "delivered"].includes(order.stage)) throw new HttpError(409, "wrong_stage", "This order is already " + order.stage + ".");

  const [p] = await sbGet(env, `kampus_store_products?id=eq.${order.product_id}&select=dropdz_product_id,sell_price&limit=1`, { service: true });
  if (!p || !p.dropdz_product_id) throw new HttpError(422, "no_dropdz_product", "This product has no DropDZ product id.");

  const loc = await resolveLocation(order.buyer_wilaya, order.buyer_commune);
  const price = order.unit_price_dzd || p.sell_price;
  const payload = {
    customer: { fullName: order.buyer_full_name, phone: order.buyer_phone, wilaya: loc.wilaya, commune: loc.commune, address: order.buyer_address },
    items: [{ productId: p.dropdz_product_id, quantity: order.quantity, ...(price ? { price } : {}) }],
    deliveryType: "HOME",
    paymentMethod: "COD",
    externalId: order.id, // our order id: DropDZ refuses duplicates, so a double tap is safe
    notes: "Kampus Store" + (order.referral_code ? " · " + order.referral_code : ""),
  };

  const r = await dz(env, "POST", "/orders", payload);
  let d = r.ok ? (r.json && (r.json.data || r.json)) : null;

  if (!r.ok && r.status === 409) {
    // maybe DropDZ already has it (a previous tap that we failed to save): look for our externalId
    const list = await dz(env, "GET", "/orders?limit=100");
    const items = (list.json && (list.json.data || [])) || [];
    d = items.find((x) => x && x.externalId === order.id) || null;
  }

  if (!d || !d.id) {
    const msg = String(errMsg(r)).slice(0, 300);
    await sbPatch(env, "kampus_store_orders", `id=eq.${order.id}`, { send_error: msg });
    await logEvent(env, order.id, "send_failed", { message: msg, http: r.status });
    throw new HttpError(502, "dropdz_error", msg);
  }

  const patch = {
    dropdz_order_id: String(d.id),
    dropdz_order_number: d.orderNumber || null,
    dropdz_status: d.status || "PENDING",
    dropdz_synced_at: new Date().toISOString(),
    dropdz_shipping_dzd: Number.isFinite(d.shippingCost) ? Math.round(d.shippingCost) : null,
    dropdz_total_dzd: Number.isFinite(d.totalAmount) ? Math.round(d.totalAmount) : null,
    stage: order.stage === "new" || order.stage === "whatsapped" ? "sent" : order.stage,
    sent_at: new Date().toISOString(),
    sent_by: admin.id,
    send_error: null,
  };
  const [row] = await sbPatch(env, "kampus_store_orders", `id=eq.${order.id}`, patch);
  await logEvent(env, order.id, "sent_to_dropdz", { by: admin.name, order_number: patch.dropdz_order_number });
  return view(row, { sent_by_name: admin.name });
}

// ---- 3) cancel ----
async function cancel(env, admin, order) {
  if (["cancelled", "returned", "delivered"].includes(order.stage)) return view(order);
  if (order.dropdz_order_id) {
    const r = await dz(env, "POST", `/orders/${encodeURIComponent(order.dropdz_order_id)}/cancel`);
    if (!r.ok) {
      const reasons = r.json && Array.isArray(r.json.reasons) ? " (" + r.json.reasons.join(", ") + ")" : "";
      throw new HttpError(r.status === 409 ? 409 : 502, "cannot_cancel", String(errMsg(r)) + reasons);
    }
  }
  const [row] = await sbPatch(env, "kampus_store_orders", `id=eq.${order.id}`, { stage: "cancelled", dropdz_status: order.dropdz_order_id ? "CANCELLED" : order.dropdz_status });
  await logEvent(env, order.id, "cancelled", { by: admin.name });
  return view(row);
}

// ---- 4) ask DropDZ for the latest status of one order ----
async function refresh(env, admin, order) {
  if (!order.dropdz_order_id) return view(order);
  const r = await dz(env, "GET", `/orders/${encodeURIComponent(order.dropdz_order_id)}`);
  if (!r.ok) throw new HttpError(502, "dropdz_error", String(errMsg(r)));
  const d = (r.json && (r.json.data || r.json)) || {};
  const stage = STAGE_FROM_STATUS[String(d.status || "").toUpperCase()];
  const extra = {};
  if (Number.isFinite(d.shippingCost)) extra.dropdz_shipping_dzd = Math.round(d.shippingCost);
  if (Number.isFinite(d.totalAmount)) extra.dropdz_total_dzd = Math.round(d.totalAmount);
  const res = await applyStage(env, order, stage, d.status, "manual", extra);
  return view(res.order);
}

// ---- settings screen helpers ----
function findSecret(o, depth = 0) {
  if (!o || typeof o !== "object" || depth > 3) return null;
  for (const [k, v] of Object.entries(o)) if (/secret/i.test(k) && typeof v === "string" && v) return v;
  for (const v of Object.values(o)) { const f = findSecret(v, depth + 1); if (f) return f; }
  return null;
}
const EVENTS = ["order.created", "order.confirmed", "order.processing", "order.shipped", "order.delivered", "order.cancelled", "order.returned", "stock.updated"];

export async function handleAdmin(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/admin\//, "").replace(/\/$/, "");
  try {
    const admin = await requireAdmin(request, env);

    if (request.method === "GET" && path === "dropdz-status") {
      const [id, secret] = await Promise.all([getSetting(env, "dropdz_webhook_id"), getSetting(env, "dropdz_webhook_secret")]);
      return json({ api_key: !!env.DROPDZ_API_KEY, webhook_registered: !!id, webhook_secret_saved: !!secret, webhook_url: url.origin + "/api/dropdz-webhook", admin: admin.name });
    }
    if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const body = await request.json().catch(() => ({}));

    if (path === "dropdz-test") {
      const r = await dz(env, "GET", "/products?limit=1");
      return json({ ok: r.ok, status: r.status, message: r.ok ? "Connected to DropDZ." : errMsg(r) });
    }
    if (path === "dropdz-webhook-register") {
      const ourUrl = url.origin + "/api/dropdz-webhook";
      // remove old copies of OUR webhook first, so we always get a fresh secret and never create duplicates
      let removed = 0;
      const list = await dz(env, "GET", "/webhooks");
      if (list.ok) {
        const raw = list.json && (list.json.data || list.json);
        for (const w of Array.isArray(raw) ? raw : []) {
          if (w && w.url === ourUrl && w.id) {
            const d = await dz(env, "DELETE", `/webhooks/${encodeURIComponent(w.id)}`);
            if (d.ok) removed++;
          }
        }
      }
      const r = await dz(env, "POST", "/webhooks", { url: ourUrl, events: EVENTS, description: "Kampus Store" });
      if (!r.ok) {
        let hint = "";
        if (r.status === 401) hint = " — the DROPDZ_API_KEY is wrong or was revoked.";
        if (r.status === 403) hint = " — this DropDZ key does not have the permission webhooks:manage. Create a new key with it.";
        return json({ ok: false, status: r.status, message: `DropDZ said (${r.status}): ` + String(errMsg(r)) + hint, detail: r.json });
      }
      const d = (r.json && (r.json.data || r.json)) || {};
      const secret = findSecret(d);
      const id = d.id || (d.webhook && d.webhook.id) || null;
      if (id) await setSetting(env, "dropdz_webhook_id", id);
      if (secret) await setSetting(env, "dropdz_webhook_secret", secret);
      return json({
        ok: true, secret_saved: !!secret, removed_old: removed, fields_returned: Object.keys(d),
        message: secret ? "Webhook connected ✓" : "Webhook created, but DropDZ did not send back a secret. Fields it returned: " + Object.keys(d).join(", "),
      });
    }
    if (path === "reconcile") return json({ ok: true, ...(await reconcile(env)) });

    const order = await loadOrder(env, body.order_id);
    if (path === "whatsapp") return json({ ok: true, order: await whatsapp(env, admin, order) });
    if (path === "send") return json({ ok: true, order: await send(env, admin, order) });
    if (path === "cancel") return json({ ok: true, order: await cancel(env, admin, order) });
    if (path === "refresh") return json({ ok: true, order: await refresh(env, admin, order) });
    throw new HttpError(404, "unknown_action");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
    console.error("ADMIN API ERROR", e);
    return json({ error: "server", message: "Something went wrong." }, 500);
  }
}
