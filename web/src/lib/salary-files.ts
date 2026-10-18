/**
 * Slates with a DK salary file in the private `salary-files` bucket for one week.
 * Server-only: uses SUPABASE_SERVICE_KEY. Returns [] when Storage is not configured.
 */
export async function storedSlates(season: number, week: number): Promise<string[]> {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY ?? "";
  if (!url || !key) return [];
  const ww = String(week).padStart(2, "0");
  const headers: Record<string, string> = { apikey: key, "content-type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${url}/storage/v1/object/list/salary-files`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prefix: `${season}/wk${ww}`, limit: 100, offset: 0 }),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const items = (await res.json()) as { name?: string; id?: string | null }[];
  const prefix = `DKSalaries_${season}_wk${ww}_`;
  return items
    .map((o) => o.name ?? "")
    .filter((n) => n.startsWith(prefix) && n.endsWith(".csv"))
    .map((n) => n.slice(prefix.length, -".csv".length))
    .filter(Boolean)
    .sort();
}
