import { sbGet } from "../_lib/supa.js";

export async function onRequestGet({ request, env }) {
  const id = parseInt(new URL(request.url).searchParams.get("wilaya"), 10);
  if (!Number.isInteger(id) || id < 1 || id > 100) return Response.json([], { status: 400 });
  try {
    const rows = await sbGet(env, `dz_communes?wilaya_id=eq.${id}&select=id,name&order=name&limit=1000`, { cache: 3600 });
    return Response.json(rows, { headers: { "cache-control": "public, max-age=3600" } });
  } catch (e) {
    console.error(e);
    return Response.json([], { status: 500 });
  }
}
