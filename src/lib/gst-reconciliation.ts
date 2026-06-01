import type { InvoiceForReport } from '@/types/gst-reports';

export type ReconCategory =
  | 'ok'
  | 'cancelled'
  | 'edited'
  | 'weight_adjusted'
  | 'duplicate'
  | 'missing_in_gstr1'
  | 'missing_in_register'
  | 'shipping_or_discount'
  | 'rounding';

export const RECON_CATEGORY_LABEL: Record<ReconCategory, string> = {
  ok: 'Matched',
  cancelled: 'Cancelled Invoice Mismatch',
  edited: 'Edited Invoice Mismatch',
  weight_adjusted: 'Weight Adjustment Mismatch',
  duplicate: 'Duplicate Invoice Mismatch',
  missing_in_gstr1: 'Missing Invoice Mismatch (not in GSTR-1)',
  missing_in_register: 'Missing in Invoice Register (extra in GSTR-1)',
  shipping_or_discount: 'Shipping / Discount Mismatch',
  rounding: 'Rounding Mismatch',
};

export interface ReconOrderInput {
  id: string;
  invoice_number: string | null;
  created_at: string;
  total_amount: number;
  shipping_cost: number | null;
  discount_amount: number | null;
  invoice_cancelled: boolean;
  status: string;
  customer_email: string | null;
  flat_number: string | null;
  building_name: string | null;
  weight_finalized_at: string | null;
}

export interface ReconItemInput {
  order_id: string;
  total_price: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  gst_type: string;
  weight_adjusted_at: string | null;
}

export interface ReconRow {
  invoice_number: string;
  invoice_date: string;
  customer: string;
  invoice_total: number;        // order.total_amount (0 if cancelled/excluded)
  gstr1_amount: number;         // sum of items contribution
  difference: number;           // invoice_total - gstr1_amount
  category: ReconCategory;
  status_flags: string[];       // human readable flags
  excluded_from_gstr1: boolean;
  order_id?: string;
}

export interface ReconSummary {
  total_invoice_register_value: number;
  total_gstr1_value: number;
  difference: number;
  affected_count: number;
  total_count: number;
  by_category: Record<ReconCategory, { count: number; difference: number }>;
}

export interface ReconResult {
  rows: ReconRow[];
  summary: ReconSummary;
}

function itemGstr1Contribution(item: ReconItemInput): number {
  if (item.gst_type === 'taxable') {
    return (
      Number(item.taxable_value || 0) +
      Number(item.cgst_amount || 0) +
      Number(item.sgst_amount || 0) +
      Number(item.igst_amount || 0)
    );
  }
  return Number(item.total_price || 0);
}

export function buildReconciliation(
  orders: ReconOrderInput[],
  items: ReconItemInput[],
  editedOrderIds: Set<string>
): ReconResult {
  const itemsByOrder = new Map<string, ReconItemInput[]>();
  for (const it of items) {
    if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
    itemsByOrder.get(it.order_id)!.push(it);
  }

  // Detect duplicates by invoice_number
  const invCount = new Map<string, number>();
  for (const o of orders) {
    const k = o.invoice_number || '';
    if (!k) continue;
    invCount.set(k, (invCount.get(k) || 0) + 1);
  }

  const rows: ReconRow[] = [];
  let totalInvoiceRegister = 0;
  let totalGstr1 = 0;

  for (const o of orders) {
    const isCancelled = o.invoice_cancelled || o.status === 'cancelled';
    const orderItems = itemsByOrder.get(o.id) || [];
    const gstr1Contribution = orderItems.reduce((s, i) => s + itemGstr1Contribution(i), 0);
    const invoiceTotal = Number(o.total_amount || 0);
    const shipping = Number(o.shipping_cost || 0);
    const discount = Number(o.discount_amount || 0);

    const flags: string[] = [];
    if (isCancelled) flags.push('Cancelled');
    if (editedOrderIds.has(o.id)) flags.push('Edited after creation');
    if (orderItems.some(i => i.weight_adjusted_at)) flags.push('Weight-adjusted');
    if (shipping > 0) flags.push(`Shipping ₹${shipping.toFixed(2)}`);
    if (discount > 0) flags.push(`Discount ₹${discount.toFixed(2)}`);
    if (o.invoice_number && (invCount.get(o.invoice_number) || 0) > 1) flags.push('Duplicate invoice no.');
    if (!o.invoice_number) flags.push('Draft (no invoice no.)');

    const excluded = isCancelled || !o.invoice_number;
    const registerValue = excluded ? 0 : invoiceTotal;
    const gstr1Value = excluded ? 0 : gstr1Contribution;
    const diff = +(registerValue - gstr1Value).toFixed(2);

    // Category priority
    let category: ReconCategory = 'ok';
    if (isCancelled && Math.abs(diff) >= 0.01) category = 'cancelled';
    else if (isCancelled) category = 'cancelled';
    else if (!o.invoice_number) category = 'missing_in_gstr1';
    else if (o.invoice_number && (invCount.get(o.invoice_number) || 0) > 1) category = 'duplicate';
    else if (Math.abs(diff) < 0.01) category = 'ok';
    else if (orderItems.some(i => i.weight_adjusted_at)) category = 'weight_adjusted';
    else if (editedOrderIds.has(o.id)) category = 'edited';
    else if (Math.abs(diff - shipping + discount) < 0.5 || shipping > 0 || discount > 0) category = 'shipping_or_discount';
    else if (Math.abs(diff) < 1) category = 'rounding';
    else category = 'edited';

    totalInvoiceRegister += registerValue;
    totalGstr1 += gstr1Value;

    rows.push({
      invoice_number: o.invoice_number || `(draft #${o.id.slice(0, 6)})`,
      invoice_date: o.created_at,
      customer:
        [o.flat_number, o.building_name].filter(Boolean).join(', ') ||
        o.customer_email ||
        '—',
      invoice_total: registerValue,
      gstr1_amount: gstr1Value,
      difference: diff,
      category,
      status_flags: flags,
      excluded_from_gstr1: excluded,
      order_id: o.id,
    });
  }

  const by_category = Object.fromEntries(
    (Object.keys(RECON_CATEGORY_LABEL) as ReconCategory[]).map(c => [c, { count: 0, difference: 0 }])
  ) as Record<ReconCategory, { count: number; difference: number }>;
  for (const r of rows) {
    by_category[r.category].count += 1;
    by_category[r.category].difference += r.difference;
  }

  const summary: ReconSummary = {
    total_invoice_register_value: +totalInvoiceRegister.toFixed(2),
    total_gstr1_value: +totalGstr1.toFixed(2),
    difference: +(totalInvoiceRegister - totalGstr1).toFixed(2),
    affected_count: rows.filter(r => r.category !== 'ok').length,
    total_count: rows.length,
    by_category,
  };

  return { rows, summary };
}

// Re-export for components needing the invoice type alias
export type { InvoiceForReport };