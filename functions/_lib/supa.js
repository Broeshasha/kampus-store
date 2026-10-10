// Tiny Supabase helper (REST). Keys come from Cloudflare variables.
export async function sbGet(env, path, { service = false, cache = 0 } = {}) {
  const key = service ? env.SUPABASE_SERVICE_KEY : env.SUPABASE_ANON_KEY;
  const init = { headers: { apikey: key, Authorization: `Bearer ${key}` } };
  if (cache && !service) init.cf = { cacheTtl: cache, cacheEverything: true };
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, init);
  if (!res.ok) throw new Error(`Supabase GET ${path}: ${await res.text()}`);
  return res.json();
}

export async function sbInsert(env, table, row) {
  const key = env.SUPABASE_SERVICE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase INSERT ${table}: ${await res.text()}`);
  return res.json();
}
