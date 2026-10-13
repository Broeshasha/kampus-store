// Counts how many people open an advertiser's link (no personal data is stored).
const BOT = /bot|crawl|spider|facebookexternalhit|facebot|whatsapp|telegram|slack|preview|embedly|curl|wget|python|node-fetch|headless/i;

export function trackVisit(request, env, ctx, slug, refOverride) {
  try {
    const url = new URL(request.url);
    const ref = String(refOverride || url.searchParams.get("ref") || "").trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,30}$/.test(ref)) return null;
    if (BOT.test(request.headers.get("user-agent") || "")) return null;       // link previews are not visitors
    const mark = ref + ":" + (slug || "");
    const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)kv=([^;]+)/);
    if (m && decodeURIComponent(m[1]) === mark) return null;                   // same person reloading
    const key = env.SUPABASE_SERVICE_KEY;
    const p = fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ks_count_click`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: ref, p_slug: slug || "" }),
    }).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(p);
    return `kv=${encodeURIComponent(mark)}; Path=/; Max-Age=1800; SameSite=Lax; Secure; HttpOnly`;
  } catch (e) {
    return null;
  }
}
