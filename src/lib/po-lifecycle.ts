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
 * Auto-create POs for an order grouped by vendor when none exist yet.
 * Called at the start of syncPOsFromWeightAdjustment before the sync logic.
 * Idempotent — skips creation if POs already exist for this order.
 */
async function autoCreatePOsForOrder(orderId: string): Promise<void> {
  // 1. Check if POs already exist for this order
  const existing = await findPOsForOrder(orderId);
  if (existing.length > 0) return;

  // 2. Get order items that have a vendor assigned
  const { data: orderItems, error: itemsError } = await supabase
    .from('order_items')
    .select('id, product_id, product_name, quantity, actual_weight, vendor_id, vendor_cost')
    .eq('order_id', orderId)
    .not('vendor_id', 'is', null);

  if (itemsError || !orderItems?.length) return;

  // 3. Group items by vendor_id
  const byVendor: Record<string, typeof orderItems> = {};
  for (const item of orderItems) {
    if (!item.vendor_id) continue;
    if (!byVendor[item.vendor_id]) byVendor[item.vendor_id] = [];
    byVendor[item.vendor_id].push(item);
  }

  if (Object.keys(byVendor).length === 0) return;

  // 4. Fetch vendor_products cost prices for all relevant product+vendor pairs
  const productIds = orderItems.map(i => i.product_id).filter(Boolean) as string[];
  const vendorIds = Object.keys(byVendor);

  const { data: vendorProducts } = await supabase
    .from('vendor_products')
    .select('vendor_id, product_id, cost_price')
    .in('vendor_id', vendorIds)
    .in('product_id', productIds);

  const costMap: Record<string, number> = {};
  for (const vp of vendorProducts || []) {
    costMap[`${vp.vendor_id}:${vp.product_id}`] = vp.cost_price;
  }

  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  // 5. Create one PO per vendor
  for (const [vendorId, items] of Object.entries(byVendor)) {
    try {
      // Generate PO number using the same RPC as the manual dialog
      const { data: poNumber, error: rpcError } = await supabase
        .rpc('generate_po_number');
      if (rpcError || !poNumber) {
        console.error('[po-lifecycle] generate_po_number failed:', rpcError);
        continue;
      }

      // Calculate line items using actual_weight if available, else quantity
      const lineItems = items.map(item => {
        const qty = Number(item.actual_weight ?? item.quantity ?? 1);
        const unitCost =
          costMap[`${vendorId}:${item.product_id}`] ??
          Number(item.vendor_cost ?? 0);
        const totalCost = qty * unitCost;
        return {
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: qty,
          unit_cost: unitCost,
          total_cost: totalCost,
        };
      });

      const subtotal = lineItems.reduce((s, i) => s + i.total_cost, 0);

      // Insert PO — notes embeds the short order ID for findPOsForOrder
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: poNumber,
          vendor_id: vendorId,
          status: 'assigned',
          order_date: today,
          subtotal,
          tax_amount: 0,
          total_amount: subtotal,
          notes: `Auto-created for order ${shortId(orderId)}`,
          received_date: now,
        })
        .select('id')
        .single();

      if (poError || !po) {
        console.error('[po-lifecycle] PO insert failed:', poError);
        continue;
      }

      // Insert PO line items
      const { error: itemsInsertError } = await supabase
        .from('purchase_order_items')
        .insert(
          lineItems.map(li => ({
            purchase_order_id: po.id,
            product_id: li.product_id,
            product_name: li.product_name,
            quantity: li.quantity,
            unit_cost: li.unit_cost,
            total_cost: li.total_cost,
            order_id: orderId,
            actual_received_weight: li.quantity,
            received_quantity: Math.max(1, Math.round(li.quantity)),
            received_at: now,
          }))
        );

      if (itemsInsertError) {
        console.error('[po-lifecycle] PO items insert failed:', itemsInsertError);
      }
    } catch (err) {
      console.error('[po-lifecycle] autoCreatePOsForOrder vendor loop failed:', err);
    }
  }
}

/**
 * Called after the weight adjustment dialog finalizes.
 * Auto-creates POs if none exist, then syncs actuals into existing POs.
 */
export async function syncPOsFromWeightAdjustment(orderId: string): Promise<void> {
  try {
    // Auto-create POs for vendors if none exist yet — this is the P0 fix
    await autoCreatePOsForOrder(orderId);

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
