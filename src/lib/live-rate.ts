import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// M N Broilers: the only vendor whose chicken buying price follows the live rate.
export const MN_BROILERS_ID = '1af69332-a20d-42c0-bc2e-610dbc28d98a';

// Calendar date in IST as YYYY-MM-DD (toISOString() is UTC and rolls over at 05:30 IST).
export function istDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export function useTodayLiveRate() {
  const today = istDateString();
  return useQuery({
    queryKey: ['live-chicken-rate', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_chicken_rates')
        .select('rate, rate_date, source')
        .eq('rate_date', today)
        .maybeSingle();
      if (error) throw error;
      return data as { rate: number; rate_date: string; source: string | null } | null;
    },
    staleTime: 60 * 1000,
  });
}

export interface LiveRateRule { multiplier: number; adder: number }

export function getLiveRateRule(
  vendorProducts: any[] | undefined,
  vendorId: string | null | undefined,
  productId: string | null | undefined,
): LiveRateRule | null {
  if (!vendorProducts || !vendorId || !productId) return null;
  const vp = vendorProducts.find((v) => v.vendor_id === vendorId && v.product_id === productId);
  if (!vp || vp.live_rate_multiplier == null) return null;
  return { multiplier: Number(vp.live_rate_multiplier), adder: Number(vp.live_rate_adder) || 0 };
}

export function liveBuyingPrice(rule: LiveRateRule, liveRate: number): number {
  return Math.round(liveRate * rule.multiplier + rule.adder);
}
