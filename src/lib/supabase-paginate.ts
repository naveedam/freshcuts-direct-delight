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