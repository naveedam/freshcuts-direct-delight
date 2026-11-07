import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// M N Broilers: the only supplier whose chicken buying price follows the live rate.
export const MN_BROILERS_ID = '1af69332-a20d-42c0-bc2e-610dbc28d98a';

// Calendar date in IST as YYYY-MM-DD (toISOString() is UTC and rolls over at 05:30 IST).
export function istDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// The IST calendar day a stored timestamp falls on. Timestamps are stored in UTC, so a payment
// at 12:01 AM IST reads as the previous day if you just take the first 10 characters.
export function istDateOf(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  // A plain date ("2026-11-08") is already a calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return timestamp;
  // Accept Postgres styles too: "2026-11-07 18:31:00.123456+00".
  const iso = timestamp.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : istDateString(d);
}

// Start of an IST day as an exact instant, for querying timestamp columns.
export function istDayStartISO(day: string): string {
  return new Date(`${day}T00:00:00+05:30`).toISOString();
}

// Rounds half up like the spreadsheet, without float surprises such as 214.49999999999997.
export function priceFromRate(rate: number, multiplier: number): number {
  return Math.round(Number((rate * multiplier).toFixed(6)));
}

// Multiplier in force on a date: the latest set whose effective date is on or before it.
export function multiplierOn(rows: any[] | undefined, cutId: string, date: string): number | null {
  let best: any = null;
  for (const r of rows || []) {
    if (r.cut_id !== cutId || r.effective_date > date) continue;
    if (!best || r.effective_date > best.effective_date) best = r;
  }
  return best ? Number(best.multiplier) : null;
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

export function useChickenCuts() {
  return useQuery({
    queryKey: ['chicken-cuts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chicken_cuts').select('*').order('sort_order');
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 60 * 1000,
  });
}

export function useChickenMultipliers() {
  return useQuery({
    queryKey: ['chicken-multipliers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chicken_cut_multipliers')
        .select('*')
        .eq('vendor_id', MN_BROILERS_ID)
        .order('effective_date');
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 60 * 1000,
  });
}

// Today's buying price for a product from a given supplier.
//   hasRule false -> not a live-rate item (other supplier, unlinked product): leave pricing alone.
//   hasRule true, price null -> it is a live-rate item but today's rate is missing.
export function useLivePricing() {
  const today = istDateString();
  const { data: todayRow, isLoading: rateLoading } = useTodayLiveRate();
  const { data: cuts, isLoading: cutsLoading } = useChickenCuts();
  const { data: multipliers, isLoading: multLoading } = useChickenMultipliers();
  const rate = todayRow?.rate != null ? Number(todayRow.rate) : null;

  const priceFor = (
    vendorId: string | null | undefined,
    productId: string | null | undefined,
  ): { hasRule: boolean; price: number | null } => {
    if (vendorId !== MN_BROILERS_ID || !productId) return { hasRule: false, price: null };
    const cut = (cuts || []).find((c) => c.product_id === productId);
    if (!cut) return { hasRule: false, price: null };
    const m = multiplierOn(multipliers, cut.id, today);
    if (m == null) return { hasRule: false, price: null };
    return { hasRule: true, price: rate != null ? priceFromRate(rate, m) : null };
  };

  return { rate, priceFor, ready: !rateLoading && !cutsLoading && !multLoading };
}
