import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabase-paginate';

// product_prices and current_product_prices are not in the generated Supabase types yet.
const db = supabase as any;

export type PriceSource = 'manual' | 'chicken_rate' | 'repeat' | 'bulk_upload' | 'seafood_sheet';

export interface PriceRecord {
  id: string;
  product_id: string;
  vendor_id: string | null;
  effective_date: string;
  purchase_price: number | null;
  selling_price: number | null;
  source: string;
  override_reason: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface PriceInput {
  product_id: string;
  vendor_id: string | null;
  effective_date: string;
  purchase_price: number | null;
  selling_price: number | null;
  source: PriceSource;
}

// A row the database refused because of a price check (below cost, or a big move).
export interface PriceCheckFailure {
  row: PriceInput;
  label: string;
  message: string;
}

export const PRICE_CHECK_PREFIX = 'PRICE_CHECK:';

export function isPriceCheckError(e: any): boolean {
  return typeof e?.message === 'string' && e.message.includes(PRICE_CHECK_PREFIX);
}

export function priceCheckText(e: any): string {
  return String(e?.message || '').replace(PRICE_CHECK_PREFIX, '').trim();
}

// Saves rows one by one (one row per product, supplier and date: a second save for the same
// day updates it). Rows refused by a price check are returned so the screen can ask for an
// override reason and call this again with it. Any other error stops and is thrown.
export async function savePriceRows(
  rows: (PriceInput & { label?: string })[],
  overrideReason?: string,
): Promise<{ saved: number; failures: PriceCheckFailure[] }> {
  let saved = 0;
  const failures: PriceCheckFailure[] = [];
  for (const { label, ...row } of rows) {
    const { error } = await db.from('product_prices').upsert(
      { ...row, override_reason: overrideReason || null },
      { onConflict: 'product_id,vendor_id,effective_date' },
    );
    if (error) {
      if (isPriceCheckError(error)) {
        failures.push({ row, label: label || '', message: priceCheckText(error) });
        continue;
      }
      throw new Error(error.message);
    }
    saved++;
  }
  return { saved, failures };
}

export async function deletePriceRecord(id: string): Promise<void> {
  const { error } = await db.from('product_prices').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Every record for the given products, oldest first.
export function usePriceRecords(productIds: string[] | undefined, key: string) {
  return useQuery({
    queryKey: ['product-prices', key, productIds],
    queryFn: () => {
      if (!productIds || productIds.length === 0) return Promise.resolve([] as PriceRecord[]);
      return fetchAllRows<PriceRecord>(() =>
        db.from('product_prices').select('*').in('product_id', productIds).order('effective_date'));
    },
    enabled: !!productIds,
    staleTime: 30 * 1000,
  });
}

// The record in force on a date for a product and supplier (null = no supplier).
export function recordOn(
  rows: PriceRecord[] | undefined,
  productId: string,
  vendorId: string | null,
  date: string,
): PriceRecord | null {
  let best: PriceRecord | null = null;
  for (const r of rows || []) {
    if (r.product_id !== productId || (r.vendor_id ?? null) !== vendorId || r.effective_date > date) continue;
    if (!best || r.effective_date > best.effective_date) best = r;
  }
  return best;
}

export function recordsFor(rows: PriceRecord[] | undefined, productId: string, vendorId?: string | null): PriceRecord[] {
  return (rows || [])
    .filter((r) => r.product_id === productId && (vendorId === undefined || (r.vendor_id ?? null) === vendorId))
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
}

// Active purchase prices (today) for every product and supplier, for order entry.
export function useCurrentPurchasePrices() {
  return useQuery({
    queryKey: ['current-product-prices'],
    queryFn: () => fetchAllRows<PriceRecord>(() =>
      db.from('current_product_prices').select('product_id, vendor_id, purchase_price, selling_price, effective_date')),
    staleTime: 60 * 1000,
  });
}

// Purchase price for an order line: that supplier's active price, else a supplier-less one.
export function purchasePriceFor(
  rows: PriceRecord[] | undefined,
  productId: string | null | undefined,
  vendorId: string | null | undefined,
): number | null {
  if (!productId) return null;
  const pick = (v: string | null) =>
    (rows || []).find((r) => r.product_id === productId && (r.vendor_id ?? null) === v && r.purchase_price != null);
  const hit = (vendorId ? pick(vendorId) : null) || pick(null);
  return hit ? Number(hit.purchase_price) : null;
}
