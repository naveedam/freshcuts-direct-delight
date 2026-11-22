// Extra details for an invoice: which lines are sold by the piece (to show "12", not "12.000"),
// and the customer's advance still held (credit across all their orders).
import { supabase } from '@/integrations/supabase/client';

export interface InvoiceExtras { unitProductIds: Set<string>; partyCredit: number }

export async function loadInvoiceExtras(order: any, items: any[]): Promise<InvoiceExtras> {
  const db = supabase as any;
  const productIds = [...new Set((items || []).map((i) => i.product_id).filter(Boolean))];
  const unitProductIds = new Set<string>();
  if (productIds.length) {
    const { data } = await db.from('products').select('id, pricing_model').in('id', productIds);
    (data || []).forEach((p: any) => { if (p.pricing_model === 'unit_based') unitProductIds.add(p.id); });
  }

  // The customer's orders: same phone, else same building + flat, else same email (as on the Orders screen).
  let partyCredit = 0;
  let q = db.from('orders').select('id, total_amount, status, invoice_cancelled');
  if (order?.phone) q = q.eq('phone', order.phone);
  else if (order?.flat_number) {
    q = q.eq('flat_number', order.flat_number);
    q = order.building_name ? q.eq('building_name', order.building_name) : q.is('building_name', null);
  } else if (order?.customer_email) q = q.eq('customer_email', order.customer_email);
  else q = null;
  if (q) {
    const { data: orders } = await q.limit(5000);
    const ids = (orders || []).map((o: any) => o.id);
    let paid = 0;
    for (let i = 0; i < ids.length; i += 150) {
      const { data: pays } = await db.from('customer_payments').select('amount').in('order_id', ids.slice(i, i + 150));
      (pays || []).forEach((p: any) => { paid += Number(p.amount) || 0; });
    }
    const billed = (orders || [])
      .filter((o: any) => !o.invoice_cancelled && o.status !== 'cancelled')
      .reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0);
    partyCredit = Math.max(0, Math.round(paid - billed));
  }
  return { unitProductIds, partyCredit };
}
