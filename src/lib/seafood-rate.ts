import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabase-paginate';
import { istDateString, useLivePricing } from '@/lib/live-rate';
import { purchasePriceFor, useCurrentPurchasePrices } from '@/lib/product-prices';

// The new tables are not in the generated Supabase types yet; regenerate types after
// running the migration and these casts can go.
const db = supabase as any;

export const SEAFOOD_CATEGORY = 'Seafood & Fish';
export const SEAFOOD_CATEGORY_SLUG = 'seafood';
// products.category holds the category name when bulk-uploaded and the slug when added
// from the Products page, so both count.
export const SEAFOOD_CATEGORY_VALUES = [SEAFOOD_CATEGORY, SEAFOOD_CATEGORY_SLUG];

// Storefront seafood prices stop being valid at this hour (IST, 24h clock).
export const SEAFOOD_CUTOFF_HOUR = 18;

export const SEAFOOD_EVENING_MESSAGE = 'Prices will be updated tomorrow morning at around 8:30 AM';
export const SEAFOOD_MORNING_MESSAGE = 'Prices will be updated this morning at around 8:30 AM';

export function isSeafoodCategory(category: string | null | undefined): boolean {
  const c = (category || '').trim().toLowerCase();
  return SEAFOOD_CATEGORY_VALUES.some((v) => v.toLowerCase() === c);
}

// Hour of the day (0-23) in IST.
export function istHour(d: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23',
  }).format(d);
  return Number(h);
}

// Seafood prices are shown only once today's prices are published, and only until 6 PM IST.
export function seafoodPricesVisible(publishedToday: boolean, now: Date = new Date()): boolean {
  return publishedToday && istHour(now) < SEAFOOD_CUTOFF_HOUR;
}

// After 6 PM the next update is tomorrow; between midnight and publishing it is this morning.
export function seafoodHiddenMessage(now: Date = new Date()): string {
  return istHour(now) >= SEAFOOD_CUTOFF_HOUR ? SEAFOOD_EVENING_MESSAGE : SEAFOOD_MORNING_MESSAGE;
}

export interface SeafoodPriceRow {
  product_id: string;
  vendor_id?: string;
  effective_date: string;
  price: number;
}

// Price in force on a date: the latest row on or before it (prices carry forward).
export function priceInForce(
  rows: SeafoodPriceRow[] | undefined,
  productId: string,
  date: string,
  vendorId?: string | null,
): { price: number; effective_date: string } | null {
  let best: SeafoodPriceRow | null = null;
  for (const r of rows || []) {
    if (r.product_id !== productId || r.effective_date > date) continue;
    if (vendorId !== undefined && r.vendor_id !== vendorId) continue;
    if (!best || r.effective_date > best.effective_date) best = r;
  }
  return best ? { price: Number(best.price), effective_date: best.effective_date } : null;
}

// Re-renders the caller every minute so the 6 PM cut-off takes effect on an open page.
function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function useSeafoodPublication(date: string) {
  return useQuery({
    queryKey: ['seafood-publication', date],
    queryFn: async () => {
      const { data, error } = await db
        .from('seafood_price_publications')
        .select('publish_date, published_at, changed_count')
        .eq('publish_date', date)
        .maybeSingle();
      if (error) throw error;
      return data as { publish_date: string; published_at: string; changed_count: number } | null;
    },
    staleTime: 60 * 1000,
  });
}

// Storefront: whether seafood prices can be shown right now, and what to say when they can't.
// Prices now show at all hours (7 November): orders outside business hours become pre-orders
// instead. Kept as a hook so the places that used to hide seafood prices need no change.
export function useSeafoodStorefront() {
  const visible = true;
  const message = '';
  const isHidden = (_category: string | null | undefined) => false;
  return { visible, message, isHidden };
}

// All price rows for the given products on or before a date (newest first is not needed:
// priceInForce picks the latest).
export async function fetchSeafoodPrices(
  table: 'seafood_selling_prices' | 'seafood_buying_prices',
  opts: { productIds?: string[]; onOrBefore?: string } = {},
): Promise<SeafoodPriceRow[]> {
  if (opts.productIds && opts.productIds.length === 0) return [];
  const cols = table === 'seafood_buying_prices'
    ? 'product_id, vendor_id, effective_date, price'
    : 'product_id, effective_date, price';
  return fetchAllRows<SeafoodPriceRow>(() => {
    let q = db.from(table).select(cols).order('effective_date');
    if (opts.productIds) q = q.in('product_id', opts.productIds);
    if (opts.onOrBefore) q = q.lte('effective_date', opts.onOrBefore);
    return q;
  });
}

export function useSeafoodSellingPrices() {
  return useQuery({
    queryKey: ['seafood-selling-prices'],
    queryFn: () => fetchSeafoodPrices('seafood_selling_prices'),
    staleTime: 60 * 1000,
  });
}

export function useSeafoodBuyingPrices() {
  return useQuery({
    queryKey: ['seafood-buying-prices'],
    queryFn: () => fetchSeafoodPrices('seafood_buying_prices'),
    staleTime: 60 * 1000,
  });
}

// Buying price for admin order entry: M N Broilers chicken follows today's live rate × the
// cut's multiplier; everything else takes the supplier's active price from Rate Management.
// Same shape as useLivePricing().priceFor.
export function useOrderPricing() {
  const live = useLivePricing();
  const { data: current, isLoading } = useCurrentPurchasePrices();

  const priceFor = (
    vendorId: string | null | undefined,
    productId: string | null | undefined,
  ): { hasRule: boolean; price: number | null } => {
    const chicken = live.priceFor(vendorId, productId);
    if (chicken.hasRule) return chicken;
    const price = purchasePriceFor(current, productId, vendorId);
    return price != null ? { hasRule: true, price } : { hasRule: false, price: null };
  };

  return { rate: live.rate, priceFor, ready: live.ready && !isLoading };
}

// All seafood products, matched by category text (name or slug) or by the Seafood category id.
export async function fetchSeafoodProducts(columns: string): Promise<any[]> {
  const { data: cat } = await supabase
    .from('categories').select('id').eq('slug', SEAFOOD_CATEGORY_SLUG).maybeSingle();
  const byText = await supabase.from('products').select(columns).in('category', SEAFOOD_CATEGORY_VALUES);
  if (byText.error) throw byText.error;
  let rows: any[] = (byText.data || []) as any[];
  if (cat?.id) {
    const byId = await supabase.from('products').select(columns).eq('category_id', cat.id);
    if (byId.error) throw byId.error;
    const seen = new Set(rows.map((r) => r.id));
    rows = rows.concat(((byId.data || []) as any[]).filter((r) => !seen.has(r.id)));
  }
  return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

// 2026-11-04 -> 04-Nov
export function fmtSeafoodDate(d: string): string {
  const [, m, day] = d.split('-');
  return `${day}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}`;
}
