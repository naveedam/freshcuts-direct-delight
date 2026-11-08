import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SEAFOOD_CATEGORY_SLUG, SEAFOOD_CATEGORY_VALUES } from '@/lib/seafood-rate';

// Seafood is priced day by day on the seafood sheet. A fish can be ordered from the admin order
// form only on a date that has a selling price for it on the sheet; the Products screen shows the
// same thing for today. This is worked out from the prices, never a manual switch. It is separate
// from storefront visibility and stock.

export interface DayPrice {
  selling: number;
  purchase: number | null;
}

export function isSeafood(
  product: { category?: string | null; category_id?: string | null },
  categories: { id: string; slug: string; name?: string }[] | undefined,
): boolean {
  const seafood = categories?.find((c) => c.slug === SEAFOOD_CATEGORY_SLUG);
  if (seafood && product.category_id === seafood.id) return true;
  const text = String(product.category || '').trim().toLowerCase();
  return SEAFOOD_CATEGORY_VALUES.some((v) => v.toLowerCase() === text);
}

// Selling prices set for exactly `date` (any supplier), by product. Where several suppliers have
// a price, the one not tied to a supplier wins, then the lowest.
export function useSeafoodDayPrices(date: string | null | undefined) {
  return useQuery({
    queryKey: ['product-prices', 'seafood-day', date],
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('product_prices')
        .select('product_id, vendor_id, selling_price, purchase_price')
        .eq('effective_date', date)
        .not('selling_price', 'is', null);
      if (error) throw error;
      const map = new Map<string, DayPrice & { anyVendor: boolean }>();
      for (const r of (data || []) as any[]) {
        const next = { selling: Number(r.selling_price), purchase: r.purchase_price != null ? Number(r.purchase_price) : null, anyVendor: r.vendor_id == null };
        const cur = map.get(r.product_id);
        if (!cur || (next.anyVendor && !cur.anyVendor) || (next.anyVendor === cur.anyVendor && next.selling < cur.selling)) {
          map.set(r.product_id, next);
        }
      }
      return map as Map<string, DayPrice>;
    },
    staleTime: 30 * 1000,
  });
}
