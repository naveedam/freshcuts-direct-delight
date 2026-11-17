// A payment that covers several purchase orders is stored as one row per PO (sharing a batch id).
// For lists and ledgers they're shown again as the single payment that was made.

export interface PaymentRow {
  id: string;
  amount: number | string;
  payment_date: string;
  payment_method: string;
  reference_number?: string | null;
  notes?: string | null;
  batch_id?: string | null;
  purchase_order_id?: string | null;
}

export interface GroupedPayment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  poIds: string[];
  rows: number;
}

export function groupPayments(rows: PaymentRow[]): GroupedPayment[] {
  const map = new Map<string, GroupedPayment>();
  for (const r of rows) {
    const key = r.batch_id
      ? `${r.batch_id}|${r.payment_date}|${r.payment_method}|${r.reference_number ?? ''}`
      : r.id;
    const g = map.get(key);
    if (g) {
      g.amount += Number(r.amount) || 0;
      g.rows += 1;
      if (r.purchase_order_id && !g.poIds.includes(r.purchase_order_id)) g.poIds.push(r.purchase_order_id);
    } else {
      map.set(key, {
        id: r.id,
        amount: Number(r.amount) || 0,
        payment_date: r.payment_date,
        payment_method: r.payment_method,
        reference_number: r.reference_number ?? null,
        notes: r.notes ?? null,
        poIds: r.purchase_order_id ? [r.purchase_order_id] : [],
        rows: 1,
      });
    }
  }
  return [...map.values()].map((g) => ({ ...g, amount: Math.round(g.amount * 100) / 100 }));
}
