import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { istDateString } from '@/lib/live-rate';

// What a customer can do with a visible product. Stock, orderability and pre-orders are
// independent switches on the Product Master; hidden products never reach the storefront.
export type Availability = 'order' | 'preorder' | 'out' | 'unavailable';

export function availabilityOf(p: { inStock?: boolean; isOrderable?: boolean; preorderEnabled?: boolean }): Availability {
  if (p.isOrderable === false) return 'unavailable';
  if (p.inStock !== false) return 'order';
  return p.preorderEnabled ? 'preorder' : 'out';
}

export const canAddToCart = (a: Availability) => a === 'order' || a === 'preorder';

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  order: 'In stock',
  preorder: 'Out of stock · pre-order',
  out: 'Out of stock',
  unavailable: 'Not available to order',
};

export interface BusinessHours { opening: string; closing: string } // 'HH:MM'

const DEFAULT_HOURS: BusinessHours = { opening: '06:00', closing: '18:00' };

export function useBusinessHours() {
  return useQuery({
    queryKey: ['business-hours'],
    queryFn: async (): Promise<BusinessHours> => {
      const { data, error } = await (supabase as any).rpc('get_business_hours');
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) return DEFAULT_HOURS;
      return { opening: String(row.opening_time).slice(0, 5), closing: String(row.closing_time).slice(0, 5) };
    },
    staleTime: 10 * 60 * 1000,
  });
}

function istClock(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(d);
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// When an order placed now will be delivered. Orders placed before closing time are delivered
// today; after closing, the next day. Outside opening hours the order is a pre-order, and so is
// any order containing an out-of-stock item taken as a pre-order (delivered the next day at the earliest).
export function deliveryPlan(
  hours: BusinessHours = DEFAULT_HOURS,
  hasPreorderItems = false,
  now: Date = new Date(),
): { date: string; isPreorder: boolean; afterHours: boolean } {
  const today = istDateString(now);
  const clock = istClock(now);
  const afterHours = clock < hours.opening || clock >= hours.closing;
  let date = clock >= hours.closing ? addDays(today, 1) : today;
  if (hasPreorderItems && date === today) date = addDays(today, 1);
  return { date, isPreorder: afterHours || hasPreorderItems, afterHours };
}

export function fmtDeliveryDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`));
}
