import { sbGet, sbPatch, sbInsert } from "./supa.js";

const BASE = "https://dropdz.space/api/v1";

// DropDZ status word  ->  our stage
export const STAGE_FROM_STATUS = {
  PENDING: "sent",
  CONFIRMED_BY_AGENT: "confirmed",
  NE_REPOND_PAS: "no_answer",
  NUMERO_INCORRECT: "wrong_number",
  ANNULE_PAR_CLIENT: "cancelled",
  PROCESSING: "processing",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  RETURNED: "returned",
  CANCELLED: "cancelled",
};
// DropDZ webhook event  ->  our stage
export const STAGE_FROM_EVENT = {
  "order.created": "sent",
  "order.confirmed": "confirmed",
  "order.processing": "processing",
  "order.shipped": "shipped",
  "order.delivered": "delivered",
  "order.cancelled": "cancelled",
  "order.returned": "returned",
};

// never move an order backwards (webhooks can arrive late or twice)
const RANK = { new: 0, whatsapped: 1, sent: 2, no_answer: 3, wrong_number: 3, confirmed: 4, processing: 5, shipped: 6, delivered: 7 };
const FINAL = new Set(["cancelled", "returned"]);
export function shouldApply(oldStage, newStage) {
  if (!newStage || oldStage === newStage) return false;
  if (FINAL.has(newStage)) return true;
  if (FINAL.has(oldStage)) return false;
  return (RANK[newStage] ?? -1) > (RANK[oldStage] ?? 0);
}

export const norm = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();

// ----- calling DropDZ (API key stays here, on the server) -----
export async function dz(env, method, path, body) {
  if (!env.DROPDZ_API_KEY) return { ok: false, status: 0, error: "DROPDZ_API_KEY is not set in Cloudflare", json: null };
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${env.DROPDZ_API_KEY}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { ok: false, status: 0, error: "Could not reach DropDZ", json: null };
  }
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { ok: res.ok, status: res.status, json };
}
export const errMsg = (r) => {
  const j = r.json || {};
  return j.message || j.error || r.error || `DropDZ error ${r.status}`;
};

async function dzPublic(path) {
  const res = await fetch(BASE + path, { cf: { cacheTtl: 86400, cacheEverything: true } });
  if (!res.ok) throw new Error("locations " + res.status);
  const j = await res.json();
  return j.data || j || [];
}

// our wilaya / commune names -> the exact names DropDZ knows
export async function resolveLocation(wilayaName, communeName) {
  const out = { wilaya: wilayaName, commune: communeName };
  try {
    const key = (s) => norm(s).replace(/\b\d+\b/g, "").trim();
    const same = (x, k) => {
      const a = key(x.name), b = key(x.nameAr);
      return k && (a === k || b === k);
    };
    const near = (x, k) => {
      const a = key(x.name);
      return k && a && (a.includes(k) || k.includes(a));
    };
    const wl = await dzPublic("/locations/wilayas");
    const wk = key(wilayaName);
    const w = wl.find((x) => same(x, wk)) || wl.find((x) => near(x, wk));
    if (!w) return out;
    out.wilaya = w.name;
    const cl = await dzPublic(`/locations/wilayas/${w.id}/communes`);
    const ck = key(communeName);
    const c = cl.find((x) => same(x, ck)) || cl.find((x) => near(x, ck));
    if (c) out.commune = c.name;
  } catch (e) {
    console.error("location resolve failed", e);
  }
  return out;
}

// ----- saving a new stage -----
export async function logEvent(env, orderId, type, detail) {
  try {
    await sbInsert(env, "kampus_store_order_events", { order_id: orderId, event_type: type, detail: detail || {} });
  } catch (e) {
    console.error("event log failed", e);
  }
}

export async function applyStage(env, order, newStage, dzStatus, source, extra) {
  const changed = shouldApply(order.stage, newStage);
  const patch = { dropdz_synced_at: new Date().toISOString(), ...(extra || {}) };
  if (dzStatus) patch.dropdz_status = dzStatus;
  if (changed) {
    patch.stage = newStage;
    if (newStage === "delivered") patch.delivered_at = new Date().toISOString();
  }
  const [row] = await sbPatch(env, "kampus_store_orders", `id=eq.${order.id}`, patch);
  if (changed || (dzStatus && dzStatus !== order.dropdz_status)) {
    // only non-personal facts are logged
    await logEvent(env, order.id, "stage_change", { from: order.stage, to: changed ? newStage : order.stage, dropdz_status: dzStatus || null, source });
  }
  return { changed, order: row || order };
}

// pull a status for orders that are "in the air" (safety net if a webhook was missed)
export async function reconcile(env, limit = 40) {
  const rows = await sbGet(
    env,
    `kampus_store_orders?stage=in.(sent,confirmed,no_answer,wrong_number,processing,shipped)&dropdz_order_id=not.is.null` +
      `&select=id,stage,dropdz_order_id,dropdz_status&order=dropdz_synced_at.asc.nullsfirst&limit=${limit}`,
    { service: true }
  );
  let updated = 0, failed = 0;
  for (let i = 0; i < rows.length; i += 5) {
    await Promise.all(
      rows.slice(i, i + 5).map(async (o) => {
        const r = await dz(env, "GET", `/orders/${encodeURIComponent(o.dropdz_order_id)}`);
        if (!r.ok) { failed++; return; }
        const d = (r.json && (r.json.data || r.json)) || {};
        const stage = STAGE_FROM_STATUS[String(d.status || "").toUpperCase()];
        const extra = {};
        if (Number.isFinite(d.shippingCost)) extra.dropdz_shipping_dzd = Math.round(d.shippingCost);
        if (Number.isFinite(d.totalAmount)) extra.dropdz_total_dzd = Math.round(d.totalAmount);
        const res = await applyStage(env, o, stage, d.status, "poll", extra);
        if (res.changed) updated++;
      })
    );
  }
  return { checked: rows.length, updated, failed };
}
