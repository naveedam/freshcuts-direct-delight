/**
 * Fetch every row for a Supabase query, working around the PostgREST
 * default 1000-row response cap by paging with .range() until a short
 * page is returned.
 *
 * Usage:
 *   const rows = await fetchAllRows(() =>
 *     supabase.from('orders').select('*').order('created_at', { ascending: false })
 *   );
 */
export async function fetchAllRows<T = any>(
  buildQuery: () => any,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Hard safety cap to avoid runaway loops (100k rows)
  for (let i = 0; i < 100; i++) {
    const q = buildQuery().range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) throw error;
    const chunk = (data as T[]) || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
/**
 * Same as fetchAllRows, but requests several pages at once (in waves) instead of one after another.
 * buildQuery must return a fresh query with a stable order (add a unique tie-breaker such as .order('id')).
 */
export async function fetchAllRowsFast<T = any>(
  buildQuery: () => any,
  { pageSize = 1000, concurrency = 4 }: { pageSize?: number; concurrency?: number } = {},
): Promise<T[]> {
  const all: T[] = [];
  for (let wave = 0; wave < 100; wave += concurrency) {
    const pages = await Promise.all(
      Array.from({ length: concurrency }, (_, i) => {
        const from = (wave + i) * pageSize;
        return buildQuery().range(from, from + pageSize - 1).then(({ data, error }: any) => {
          if (error) throw error;
          return (data as T[]) || [];
        });
      }),
    );
    for (const p of pages) all.push(...p);
    if (pages.some((p) => p.length < pageSize)) break;
  }
  return all;
}

/** Runs async jobs with at most `limit` in flight; results keep the input order. */
export async function mapLimit<I, O>(items: I[], limit: number, fn: (item: I) => Promise<O>): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}
