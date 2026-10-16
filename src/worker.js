// Connects the website pages and APIs to Cloudflare Workers.
// Pages live in /functions, static files in /public.
import * as home from "../functions/index.js";
import * as product from "../functions/p/[slug].js";
import * as order from "../functions/api/order.js";
import * as communes from "../functions/api/communes.js";
import * as partners from "../functions/partners.js";
import * as adminPage from "../functions/admin-page.js";
import * as aPage from "../functions/a-page.js";
import * as storePage from "../functions/store-page.js";
import * as img from "../functions/api/img.js";
import { handleAdmin } from "../functions/api/admin-api.js";
import * as dropdzWebhook from "../functions/api/dropdz-webhook.js";
import { reconcile } from "../functions/_lib/dropdz.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const isRead = method === "GET" || method === "HEAD";

    try {
      if (path === "/" && isRead) return await home.onRequestGet({ request, env, ctx });

      const p = path.match(/^\/p\/([^/]+)\/?$/);
      if (p && isRead) {
        return await product.onRequestGet({ request, env, ctx, params: { slug: decodeURIComponent(p[1]) } });
      }

      const st = path.match(/^\/s\/([^/]+)\/?$/);
      if (st && isRead) return await storePage.onRequestGet({ request, env, ctx, params: { slug: decodeURIComponent(st[1]) } });

      const a = path.match(/^\/a\/([^/]+)\/?$/);
      if (a && isRead) return await aPage.onRequestGet({ request, env, ctx, params: { code: decodeURIComponent(a[1]) } });

      if ((path === "/partners" || path === "/partners/") && isRead) return await partners.onRequestGet({ request, env });
      if ((path === "/admin" || path === "/admin/") && isRead) return await adminPage.onRequestGet({ request, env });

      if (path === "/api/order" && method === "POST") return await order.onRequestPost({ request, env });
      if (path === "/api/img" && isRead) return await img.onRequestGet({ request, env });
      if (path === "/api/communes" && isRead) return await communes.onRequestGet({ request, env });
      if (path === "/api/dropdz-webhook" && method === "POST") return await dropdzWebhook.onRequestPost({ request, env });
      if (path.startsWith("/api/admin/")) return await handleAdmin(request, env);
    } catch (e) {
      console.error("WORKER ERROR", e);
      return new Response("Server error", { status: 500 });
    }

    // everything else: logo.png, style.css, app.js ...
    return env.ASSETS.fetch(request);
  },

  // every 15 minutes: ask DropDZ about orders still on the way (safety net if a webhook was missed)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(reconcile(env).catch((e) => console.error("RECONCILE ERROR", e)));
  },
};
