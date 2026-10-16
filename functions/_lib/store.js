import { sbGet } from "./supa.js";

// Looks up an advertiser's public store (settings only, never private data).
const cache = new Map();
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 45000) return hit.v;
  let v = null;
  try { v = await fn(); } catch (e) { console.error("store lookup", e); }
  cache.set(key, { at: Date.now(), v });
  if (cache.size > 300) cache.clear();
  return v;
}

async function build(env, store) {
  if (!store || store.status !== "live") return null;
  const [adv] = await sbGet(env, `advertisers?id=eq.${store.advertiser_id}&active=eq.true&select=id,promo_code,display_name,phone&limit=1`, { service: true });
  return adv ? { store, adv } : null;
}

export function storeBySlug(env, slug) {
  if (!/^[a-z0-9][a-z0-9-]{2,29}$/.test(slug || "")) return Promise.resolve(null);
  return cached("s:" + slug, async () => {
    const [store] = await sbGet(env, `advertiser_stores?slug=eq.${slug}&select=*&limit=1`, { service: true });
    return build(env, store);
  });
}

export function storeByCode(env, code) {
  code = String(code || "").toUpperCase();
  if (!/^[A-Z0-9_-]{2,30}$/.test(code)) return Promise.resolve(null);
  return cached("c:" + code, async () => {
    const [adv] = await sbGet(env, `advertisers?promo_code=eq.${encodeURIComponent(code)}&active=eq.true&select=id&limit=1`, { service: true });
    if (!adv) return null;
    const [store] = await sbGet(env, `advertiser_stores?advertiser_id=eq.${adv.id}&select=*&limit=1`, { service: true });
    return build(env, store);
  });
}
