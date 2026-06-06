import { supabase } from '@/integrations/supabase/client';

/**
 * PO Lifecycle helpers — additive, idempotent. Layered on existing PO system.
 *
 * Status convention:
 *   draft (legacy) → assigned → received → payable → paid
 *   cancelled — terminal manual state
 *
 * Legacy statuses (sent/confirmed/partially_received) remain valid and are
 * treated as pre-received for transition purposes.
 */

const PRE_RECEIVED = ['draft', 'assigned', 'sent', 'confirmed', 'partially_received'];
const NON_FINAL = [...PRE_RECEIVED, 'received', 'payable'];

function shortId(orderId: string) {
  return orderId.slice(0, 8);
}

/** Find all POs linked to a customer order via the notes convention. */
async function findPOsForOrder(orderId: string) {
  const { data } = await supabase
    .from('purchase_orders')
    .select('id, vendor_id, status, tax_amount, items:purchase_order_items(*)')
    .ilike('notes', `%${shortId(orderId)}%`)
    .neq('status', 'cancelled');
  return data || [];
}

/**
 * Called after the weight adjustment dialog finalizes.
 * For every PO linked to the order, sync each PO item's actual quantity
 * from order_items.actual_weight, recompute the PO subtotal/total, and
 * transition the PO to `received`.
 */
export async function syncPOsFromWeightAdjustment(orderId: string): Promise<void> {
  try {
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('product_id, product_name, actual_weight, quantity, vendor_id')
      .eq('order_id', orderId);
    if (!orderItems?.length) return;

    const pos = await findPOsForOrder(orderId);
    if (!pos.length) return;

    const now = new Date().toISOString();

    for (const po of pos as any[]) {
      const vendorItems = orderItems.filter(
        (oi: any) => !oi.vendor_id || oi.vendor_id === po.vendor_id,
      );
      let newSubtotal = 0;

      for (const poItem of po.items || []) {
        const match =
          vendorItems.find((oi: any) => oi.product_id && oi.product_id === poItem.product_id) ||
          vendorItems.find((oi: any) => oi.product_name === poItem.product_name);
        if (!match) {
          newSubtotal += Number(poItem.total_cost) || 0;
          continue;
        }
        const actualQty = Number(match.actual_weight ?? match.quantity ?? poItem.quantity);
        const unitCost = Number(poItem.unit_cost) || 0;
        const totalCost = actualQty * unitCost;
        newSubtotal += totalCost;

        await supabase
          .from('purchase_order_items')
          .update({
            actual_received_weight: actualQty,
            received_quantity: Math.max(1, Math.round(actualQty)),
            total_cost: totalCost,
            received_at: now,
            order_id: orderId,
          })
          .eq('id', poItem.id);
      }

      const newTotal = newSubtotal + (Number(po.tax_amount) || 0);
      const nextStatus = PRE_RECEIVED.includes(po.status) ? 'received' : po.status;

      await supabase
        .from('purchase_orders')
        .update({
          subtotal: newSubtotal,
          total_amount: newTotal,
          status: nextStatus,
          received_date: now,
        })
        .eq('id', po.id);
    }
  } catch (err) {
    console.error('[po-lifecycle] syncPOsFromWeightAdjustment failed:', err);
  }
}

/** Called after an invoice is generated for a customer order. */
export async function markPOsPayableOnInvoice(orderId: string): Promise<void> {
  try {
    await supabase
      .from('purchase_orders')
      .update({ status: 'payable' })
      .ilike('notes', `%${shortId(orderId)}%`)
      .in('status', PRE_RECEIVED.concat('received'));
  } catch (err) {
    console.error('[po-lifecycle] markPOsPayableOnInvoice failed:', err);
  }
}

/** Called after a vendor payment is recorded. */
export async function markPOPaidIfSettled(poId: string): Promise<void> {
  try {
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('total_amount, paid_amount, status')
      .eq('id', poId)
      .single();
    if (!po) return;
    const total = Number(po.total_amount) || 0;
    const paid = Number(po.paid_amount) || 0;
    if (total > 0 && paid >= total) {
      await supabase
        .from('purchase_orders')
        .update({ status: 'paid', payment_status: 'paid' })
        .eq('id', poId);
    }
  } catch (err) {
    console.error('[po-lifecycle] markPOPaidIfSettled failed:', err);
  }
}

/** Status display helpers — used by PO admin screens. */
export const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  assigned: 'Assigned',
  sent: 'Sent',
  confirmed: 'Confirmed',
  partially_received: 'Partially Received',
  received: 'Received',
  payable: 'Payable',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const PO_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  assigned: 'bg-sky-100 text-sky-800 hover:bg-sky-100',
  sent: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  confirmed: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100',
  partially_received: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  received: 'bg-green-100 text-green-800 hover:bg-green-100',
  payable: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
  paid: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  cancelled: 'bg-red-100 text-red-800 hover:bg-red-100',
};

export const ACTIVE_PO_STATUSES = ['draft', 'assigned', 'sent', 'confirmed', 'partially_received', 'received', 'payable'];
export const ARCHIVED_PO_STATUSES = ['paid', 'cancelled'];