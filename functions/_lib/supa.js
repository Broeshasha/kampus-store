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

// ----- extra helpers used by the admin + DropDZ code (server only) -----
export async function sbPatch(env, table, filter, row) {
  const key = env.SUPABASE_SERVICE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase PATCH ${table}: ${await res.text()}`);
  return res.json();
}

export async function getSetting(env, key) {
  const rows = await sbGet(env, `ks_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`, { service: true });
  return rows[0] ? rows[0].value : null;
}

export async function setSetting(env, key, value) {
  const k = env.SUPABASE_SERVICE_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/ks_settings?on_conflict=key`, {
    method: "POST",
    headers: {
      apikey: k,
      Authorization: `Bearer ${k}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ key, value: String(value), updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Supabase UPSERT ks_settings: ${await res.text()}`);
}
