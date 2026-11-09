// What each invoice still owes, from payments actually received. Within a party (same phone, or
// flat and building, or email), money paid beyond an invoice's own total (an advance) is set
// against the party's other unpaid invoices, oldest first. So a party's total due always equals
// its Ledger: billed (non-cancelled invoices) minus received. The stored orders.balance_due is
// not used: it can be stale, or negative where an advance sits on one order.

export interface DueOrder {
  id: string;
  created_at: string;
  total_amount: number | string | null;
  amount_paid?: number | string | null;
  invoice_cancelled?: boolean | null;
  phone?: string | null;
  flat_number?: string | null;
  building_name?: string | null;
  customer_email?: string | null;
}

export function partyKey(o: Partial<DueOrder>): string | null {
  if (o?.phone) return `phone:${String(o.phone).trim().toLowerCase()}`;
  if (o?.flat_number) return `flat:${(o.building_name || '').trim().toLowerCase()}|${String(o.flat_number).trim().toLowerCase()}`;
  if (o?.customer_email) return `email:${String(o.customer_email).trim().toLowerCase()}`;
  return null;
}

export function invoiceDues(
  orders: DueOrder[] | undefined,
  payments: { order_id: string; amount: number | string | null }[] | undefined,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!orders || !payments) return result;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const paidByOrder = new Map<string, number>();
  for (const p of payments) paidByOrder.set(p.order_id, (paidByOrder.get(p.order_id) || 0) + (Number(p.amount) || 0));

  const groups = new Map<string, DueOrder[]>();
  for (const o of orders) {
    const k = partyKey(o) ?? `order:${o.id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(o);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let pool = 0;
    const shortfalls: { id: string; amount: number }[] = [];
    for (const o of list) {
      const total = o.invoice_cancelled ? 0 : (Number(o.total_amount) || 0);
      const paid = paidByOrder.get(o.id) || 0;
      if (paid - total > 0.005) pool += paid - total;
      else if (total - paid > 0.005) shortfalls.push({ id: o.id, amount: total - paid });
    }
    for (const s of shortfalls) {
      const applied = Math.min(s.amount, pool);
      pool -= applied;
      result.set(s.id, r2(s.amount - applied));
    }
    for (const o of list) if (!result.has(o.id)) result.set(o.id, 0);
  }
  return result;
}
