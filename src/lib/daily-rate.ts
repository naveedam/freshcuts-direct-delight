import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabase-paginate';
import { istDateString, MN_BROILERS_ID, priceFromRate } from '@/lib/live-rate';

// Live-rate commodities: one market rate a day, and per cut a buying multiplier (supplier
// price) and a selling multiplier (website price). Chicken and mutton share this code.
// Mutton tables are not in the generated Supabase types yet, hence the casts.
const db = supabase as any;

export type Commodity = 'chicken' | 'mutton';

export interface CommodityConfig {
  key: Commodity;
  label: string;
  ratesTable: string;
  cutsTable: string;
  multTable: string;
  // Chicken multiplier rows carry the supplier; mutton's supplier is a page setting.
  vendorScoped: boolean;
  fixedVendorId?: string;
  // Chicken cuts came pre-seeded; mutton cuts are added on the page.
  canAddCuts: boolean;
  buyingRequired: boolean;
  defaultSource: string;
  productOr: string; // PostgREST or-filter for the products this commodity can link to
}

export const COMMODITIES: Record<Commodity, CommodityConfig> = {
  chicken: {
    key: 'chicken', label: 'Chicken',
    ratesTable: 'live_chicken_rates', cutsTable: 'chicken_cuts', multTable: 'chicken_cut_multipliers',
    vendorScoped: true, fixedVendorId: MN_BROILERS_ID, canAddCuts: false, buyingRequired: true,
    defaultSource: 'KTPA Facebook',
    productOr: 'category.eq.Poultry,category.eq.poultry,name.ilike.%chicken%',
  },
  mutton: {
    key: 'mutton', label: 'Mutton',
    ratesTable: 'live_mutton_rates', cutsTable: 'mutton_cuts', multTable: 'mutton_cut_multipliers',
    vendorScoped: false, canAddCuts: true, buyingRequired: false,
    defaultSource: '',
    productOr: 'category.eq.Lamb & Mutton,category.eq.lamb,name.ilike.%mutton%,name.ilike.%lamb%,name.ilike.%goat%',
  },
};

export interface RateRow { rate_date: string; rate: number; source: string | null }
export interface MultRow {
  cut_id: string; effective_date: string;
  multiplier: number | null; selling_multiplier: number | null; vendor_id?: string;
}

// Latest multiplier row for a cut on or before a date (sets are full snapshots).
export function multRowOn(rows: MultRow[] | undefined, cutId: string, date: string): MultRow | null {
  let best: MultRow | null = null;
  for (const r of rows || []) {
    if (r.cut_id !== cutId || r.effective_date > date) continue;
    if (!best || r.effective_date > best.effective_date) best = r;
  }
  return best;
}

// Rate in force on a date: that day's rate, or the latest earlier one.
export function rateOn(rows: RateRow[] | undefined, date: string): RateRow | null {
  let best: RateRow | null = null;
  for (const r of rows || []) {
    if (r.rate_date > date) continue;
    if (!best || r.rate_date > best.rate_date) best = r;
  }
  return best;
}

export function useCommodityVendor(cfg: CommodityConfig) {
  return useQuery({
    queryKey: ['daily-rate-vendor', cfg.key],
    queryFn: async () => {
      if (cfg.fixedVendorId) return cfg.fixedVendorId;
      const { data, error } = await db
        .from('daily_rate_settings').select('vendor_id').eq('commodity', cfg.key).maybeSingle();
      if (error) throw error;
      return (data?.vendor_id as string | null) ?? null;
    },
    staleTime: 60 * 1000,
  });
}

export function useCommodityRates(cfg: CommodityConfig) {
  return useQuery({
    queryKey: ['daily-rates', cfg.key],
    queryFn: () => fetchAllRows<RateRow>(() =>
      db.from(cfg.ratesTable).select('rate_date, rate, source').order('rate_date')),
    staleTime: 60 * 1000,
  });
}

export function useCommodityCuts(cfg: CommodityConfig) {
  return useQuery({
    queryKey: ['daily-rate-cuts', cfg.key],
    queryFn: async () => {
      const { data, error } = await db.from(cfg.cutsTable).select('*').order('sort_order');
      if (error) throw error;
      return (data || []) as { id: string; name: string; product_id: string | null; sort_order: number }[];
    },
    staleTime: 60 * 1000,
  });
}

export function useCommodityMultipliers(cfg: CommodityConfig) {
  return useQuery({
    queryKey: ['daily-rate-mults', cfg.key],
    queryFn: () => fetchAllRows<MultRow>(() => {
      let q = db.from(cfg.multTable).select('*').order('effective_date');
      if (cfg.vendorScoped && cfg.fixedVendorId) q = q.eq('vendor_id', cfg.fixedVendorId);
      return q;
    }),
    staleTime: 60 * 1000,
  });
}

// Website prices for linked cuts: latest rate × selling multiplier in force today.
// Writes products.price and clears the "awaiting first price" flag. Returns how many changed.
export async function syncSellingPrices(cfg: CommodityConfig): Promise<number> {
  const today = istDateString();
  const [{ data: rateRow, error: rErr }, { data: cuts, error: cErr }] = await Promise.all([
    db.from(cfg.ratesTable).select('rate, rate_date').lte('rate_date', today)
      .order('rate_date', { ascending: false }).limit(1).maybeSingle(),
    db.from(cfg.cutsTable).select('id, product_id').not('product_id', 'is', null),
  ]);
  if (rErr) throw rErr;
  if (cErr) throw cErr;
  if (!rateRow || !cuts?.length) return 0;

  const mults = await fetchAllRows<MultRow>(() => {
    let q = db.from(cfg.multTable).select('*').lte('effective_date', today);
    if (cfg.vendorScoped && cfg.fixedVendorId) q = q.eq('vendor_id', cfg.fixedVendorId);
    return q;
  });
  const productIds = cuts.map((c: any) => c.product_id);
  const { data: products, error: pErr } = await supabase
    .from('products').select('id, price, awaiting_daily_price' as any).in('id', productIds);
  if (pErr) throw pErr;

  let changed = 0;
  for (const cut of cuts as any[]) {
    const sm = multRowOn(mults, cut.id, today)?.selling_multiplier;
    if (sm == null) continue;
    const price = priceFromRate(Number(rateRow.rate), Number(sm));
    const p = (products as any[] || []).find((x) => x.id === cut.product_id);
    if (!p || (Number(p.price) === price && !p.awaiting_daily_price)) continue;
    const { error } = await supabase.from('products')
      .update({ price, awaiting_daily_price: false } as any).eq('id', cut.product_id);
    if (error) throw error;
    changed++;
  }
  return changed;
}

// Buying price for admin order entry: today's rate × the cut's buying multiplier, for the
// commodity's supplier only. hasRule false means "not a live-rate item: leave it alone".
export function useCommodityBuyingPricing(cfg: CommodityConfig) {
  const today = istDateString();
  const { data: vendorId, isLoading: vLoading } = useCommodityVendor(cfg);
  const { data: rates, isLoading: rLoading } = useCommodityRates(cfg);
  const { data: cuts, isLoading: cLoading } = useCommodityCuts(cfg);
  const { data: mults, isLoading: mLoading } = useCommodityMultipliers(cfg);
  const todayRate = (rates || []).find((r) => r.rate_date === today);

  const priceFor = (v: string | null | undefined, productId: string | null | undefined) => {
    if (!vendorId || v !== vendorId || !productId) return { hasRule: false, price: null as number | null };
    const cut = (cuts || []).find((c) => c.product_id === productId);
    if (!cut) return { hasRule: false, price: null };
    const m = multRowOn(mults, cut.id, today)?.multiplier;
    if (m == null) return { hasRule: false, price: null };
    return { hasRule: true, price: todayRate ? priceFromRate(Number(todayRate.rate), Number(m)) : null };
  };
  return { priceFor, ready: !vLoading && !rLoading && !cLoading && !mLoading };
}
