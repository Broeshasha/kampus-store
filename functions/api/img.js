import { sbGet } from "../_lib/supa.js";

// Lets the browser save / share / draw our product photos (they live on other websites).
// Only photos that belong to products of THIS store are allowed.
let cache = { hosts: null, at: 0 };

async function allowedHosts(env) {
  if (cache.hosts && Date.now() - cache.at < 600000) return cache.hosts;
  const set = new Set();
  try { set.add(new URL(env.SUPABASE_URL).host); } catch (e) {}
  const rows = await sbGet(env, "store_products_public?select=images&limit=1000", { cache: 300 });
  const walk = (x, d) => {
    if (x == null || d > 5) return;
    if (typeof x === "string") {
      const v = x.trim();
      if (v[0] === "[" || v[0] === "{") { try { return walk(JSON.parse(v), d + 1); } catch (e) {} }
      try { const u = new URL(v); if (u.protocol === "https:" || u.protocol === "http:") set.add(u.host); } catch (e) {}
      return;
    }
    if (Array.isArray(x)) return x.forEach((y) => walk(y, d + 1));
    if (typeof x === "object") Object.values(x).forEach((y) => walk(y, d + 1));
  };
  rows.forEach((r) => walk(r.images, 0));
  cache = { hosts: set, at: Date.now() };
  return set;
}

export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  let target;
  try { target = new URL(q.get("u") || ""); } catch (e) { return new Response("bad url", { status: 400 }); }
  if (target.protocol !== "https:" && target.protocol !== "http:") return new Response("bad url", { status: 400 });

  let hosts;
  try { hosts = await allowedHosts(env); } catch (e) { return new Response("unavailable", { status: 503 }); }
  if (!hosts.has(target.host)) return new Response("not allowed", { status: 403 });

  let res;
  try {
    res = await fetch(target.toString(), { headers: { "User-Agent": "Mozilla/5.0 (KampusStore)" }, cf: { cacheTtl: 86400, cacheEverything: true } });
  } catch (e) { return new Response("fetch failed", { status: 502 }); }
  if (!res.ok) return new Response("not found", { status: 502 });

  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) return new Response("not an image", { status: 415 });
  if (parseInt(res.headers.get("content-length") || "0", 10) > 12 * 1024 * 1024) return new Response("too large", { status: 413 });

  const headers = {
    "content-type": type,
    "cache-control": "public, max-age=86400",
    "x-content-type-options": "nosniff",
  };
  if (q.get("dl")) {
    const name = String(q.get("name") || "photo").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 60) || "photo";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    headers["content-disposition"] = `attachment; filename="${name.replace(/\.(jpe?g|png|webp)$/i, "")}.${ext}"`;
  }
  return new Response(res.body, { status: 200, headers });
}
