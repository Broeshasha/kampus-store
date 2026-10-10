// Connects the website pages to Cloudflare Workers.
// The pages themselves live in /functions (unchanged), static files in /public.
import * as home from "../functions/index.js";
import * as product from "../functions/p/[slug].js";
import * as order from "../functions/api/order.js";
import * as communes from "../functions/api/communes.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const isRead = method === "GET" || method === "HEAD";

    try {
      if (path === "/" && isRead) return await home.onRequestGet({ request, env });

      const p = path.match(/^\/p\/([^/]+)\/?$/);
      if (p && isRead) {
        return await product.onRequestGet({ request, env, params: { slug: decodeURIComponent(p[1]) } });
      }

      if (path === "/api/order" && method === "POST") return await order.onRequestPost({ request, env });
      if (path === "/api/communes" && isRead) return await communes.onRequestGet({ request, env });
    } catch (e) {
      console.error("WORKER ERROR", e);
      return new Response("Server error", { status: 500 });
    }

    // everything else: logo.png, style.css, app.js ...
    return env.ASSETS.fetch(request);
  },
};
