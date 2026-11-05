import { supabase } from '@/integrations/supabase/client';
import { fetchSeafoodPrices } from '@/lib/seafood-rate';

/**
 * PO Lifecycle helpers — additive, idempotent.
 *
 * Status convention:
 *   draft (legacy) → assigned → received → payable → paid
 *   cancelled — terminal manual state
 *
 * Procurement model: ONE PO per vendor per calendar date (EOD consolidation).
 * Multiple customer orders on the same day funnel into the same vendor PO.
 * Each PO line item retains order_id so per-customer traceability is preserved.
 */
const PRE_RECEIVED = ['draft', 'assigned', 'sent', 'confirmed', 'partially_received'];

/** Daily PO note prefix — used to find existing daily POs */
function dailyPONote(vendorId: string, date: string) {
  return `daily:${vendorId}:${date}`;
}

/** Find all POs linked to a customer order via order_items.order_id */
async function findPOsForOrder(orderId: string) {
  const { data } = await supabase
    .from('purchase_order_items')
    .select('purchase_order_id')
    .eq('order_id', orderId);

  if (!data?.length) return [];

  const poIds = [...new Set(data.map((r) => r.purchase_order_id))];

  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('id, vendor_id, status, tax_amount, items:purchase_order_items(*)')
    .in('id', poIds)
    .neq('status', 'cancelled');

  return pos || [];
}

/**
 * Find or create the daily consolidated PO for a vendor on a given date.
 * Returns the PO id.
 */
async function getOrCreateDailyPO(
  vendorId: string,
  date: string, // 'YYYY-MM-DD'
): Promise<string | null> {
  const noteKey = dailyPONote(vendorId, date);

  // Check if a daily PO already exists for THIS vendor on THIS date.
  // Scope strictly by vendor_id — POs belonging to other vendors for the
  // same customer order must NOT cause us to skip creation here.
  const { data: existingTagged } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('vendor_id', vendorId)
    .eq('order_date', date)
    .ilike('notes', `%${noteKey}%`)
    .neq('status', 'cancelled')
    .limit(1)
    .maybeSingle();

  if (existingTagged?.id) return existingTagged.id;

  // Fallback: reuse any active PO for this vendor+date even if the notes
  // marker is missing (legacy or manually created daily PO).
  const { data: existingAny } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('vendor_id', vendorId)
    .eq('order_date', date)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingAny?.id) return existingAny.id;

  // Create new daily PO
  const { data: poNumber, error: rpcError } = await supabase.rpc('generate_po_number');
  if (rpcError || !poNumber) {
    console.error('[po-lifecycle] generate_po_number failed:', rpcError);
    return null;
  }

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .insert({
      po_number: poNumber,
      vendor_id: vendorId,
      status: 'draft',
      order_date: date,
      subtotal: 0,
      tax_amount: 0,
      total_amount: 0,
      notes: noteKey,
    })
    .select('id')
    .single();

  if (error || !po) {
    console.error('[po-lifecycle] daily PO create failed:', error);
    return null;
  }

  return po.id;
}

/**
 * Recompute and update the subtotal/total of a daily PO
 * by summing all its current line items.
 */
async function refreshPOTotals(poId: string): Promise<void> {
  const { data: items } = await supabase
    .from('purchase_order_items')
    .select('total_cost, tax_amount')
    .eq('purchase_order_id', poId);
  const subtotal = (items || []).reduce((s, i) => s + Number(i.total_cost || 0), 0);
  const taxAmount = (items || []).reduce((s, i) => s + Number(i.tax_amount || 0), 0);
  const total = subtotal + taxAmount;
  await supabase
    .from('purchase_orders')
    .update({ subtotal, tax_amount: taxAmount, total_amount: total })
    .eq('id', poId);
}

/**
 * Called after weight adjustment finalizes.
 *
 * For each vendor in the order:
 *   1. Find or create today's consolidated daily PO for that vendor
 *   2. Upsert line items (update if order_id+product already exists, insert if new)
 *   3. Refresh PO totals
 *   4. Transition PO to 'received'
 */
export async function syncPOsFromWeightAdjustment(orderId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('id, product_id, product_name, actual_weight, vendor_supplied_weight, quantity, vendor_id, vendor_cost')
      .eq('order_id', orderId)
      .not('vendor_id', 'is', null);

    if (itemsError) return { success: false, error: itemsError.message };
    if (!orderItems?.length) return { success: true };

    // Use the order's own date (when it was actually placed/finalized), not
    // the current date — this function can run well after the order date
    // (e.g. an invoice edit days later), and must attach to the PO for the
    // order's real date, not create a fresh "today" PO each time it runs.
    const { data: orderRow } = await supabase
      .from('orders')
      .select('created_at')
      .eq('id', orderId)
      .single();
    const poDate = (orderRow?.created_at ? new Date(orderRow.created_at) : new Date())
      .toISOString().split('T')[0];

    // Group by vendor
    const byVendor: Record<string, typeof orderItems> = {};
    for (const item of orderItems) {
      if (!item.vendor_id) continue;
      if (!byVendor[item.vendor_id]) byVendor[item.vendor_id] = [];
      byVendor[item.vendor_id].push(item);
    }

    if (!Object.keys(byVendor).length) return { success: true };

    // Fetch vendor_products cost prices
    const productIds = orderItems.map((i) => i.product_id).filter(Boolean) as string[];
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

    // Seafood Rate: supplier/product pairs priced daily. For these the order line's
    // vendor_cost (set from the day's seafood buying price at finalization) wins over the
    // standing cost on vendor_products, which would otherwise be a stale price.
    const dailyPriced = new Set<string>();
    const seafoodBuying = await fetchSeafoodPrices('seafood_buying_prices', { productIds });
    for (const r of seafoodBuying) dailyPriced.add(`${r.vendor_id}:${r.product_id}`);
    // Vendor PO tax mirrors the same GST rate charged to the customer for
    // this product (products.gst_rate) — we pay tax on purchase and collect
    // the same on sale; both are reported via the monthly GST reports.
    const { data: productGst } = await supabase
      .from('products')
      .select('id, gst_rate, gst_type')
      .in('id', productIds);
    const gstMap: Record<string, number> = {};
    for (const p of productGst || []) {
      const nt = String(p.gst_type || '').toLowerCase();
      gstMap[p.id] = (nt === 'taxable' && Number(p.gst_rate) > 0) ? Number(p.gst_rate) : 0;
    }


    const now = new Date().toISOString();

    for (const [vendorId, items] of Object.entries(byVendor)) {
      const poId = await getOrCreateDailyPO(vendorId, poDate);
      if (!poId) continue;

      for (const item of items) {
        const actualQty = Number(item.vendor_supplied_weight ?? item.actual_weight ?? item.quantity ?? 1);
        // A mapped cost_price of 0 means "not yet set" (the DB column is
        // NOT NULL, so 0 is the only way to represent "unknown"), not a
        // real zero price — treat it the same as unmapped and fall back
        // to the manually-entered vendor_cost on the order item.
        const mappedCost = costMap[`${vendorId}:${item.product_id}`];
        const lineCost = Number(item.vendor_cost ?? 0);
        const unitCost = (dailyPriced.has(`${vendorId}:${item.product_id}`) && lineCost > 0)
          ? lineCost
          : (mappedCost && mappedCost > 0)
            ? mappedCost
            : lineCost;
        const totalCost = actualQty * unitCost;
        const gstRate = item.product_id ? (gstMap[item.product_id] ?? 0) : 0;
        const taxAmount = Math.round(totalCost * gstRate) / 100;

        // Check if this order_id + product already has a line in this PO
        const { data: existing } = await supabase
          .from('purchase_order_items')
          .select('id')
          .eq('purchase_order_id', poId)
          .eq('order_id', orderId)
          .eq('product_name', item.product_name)
          .maybeSingle();

        if (existing?.id) {
          // Update existing line item
          await supabase
            .from('purchase_order_items')
            .update({
              quantity: actualQty,
              unit_cost: unitCost,
              total_cost: totalCost,
              tax_amount: taxAmount,
              actual_received_weight: actualQty,
              received_quantity: Math.max(1, Math.round(actualQty)),
              received_at: now,
            })
            .eq('id', existing.id);
        } else {
          // Insert new line item
          await supabase
            .from('purchase_order_items')
            .insert({
              purchase_order_id: poId,
              product_id: item.product_id,
              product_name: item.product_name,
              quantity: actualQty,
              unit_cost: unitCost,
              total_cost: totalCost,
              tax_amount: taxAmount,
              actual_received_weight: actualQty,
              received_quantity: Math.max(1, Math.round(actualQty)),
              received_at: now,
              order_id: orderId,
              order_item_id: item.id,
            });
        }
      }

      // Refresh PO totals and mark received
      await refreshPOTotals(poId);

      const { data: po } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('id', poId)
        .single();

      if (po && PRE_RECEIVED.includes(po.status)) {
        await supabase
          .from('purchase_orders')
          .update({ status: 'received', received_date: now })
          .eq('id', poId);
      }
    }
    return { success: true };
  } catch (err: any) {
    console.error('[po-lifecycle] syncPOsFromWeightAdjustment failed:', err);
    return { success: false, error: err?.message || 'Unknown error' };
  }
}

/** Called after an invoice is generated for a customer order. */
export async function markPOsPayableOnInvoice(orderId: string): Promise<void> {
  try {
    const pos = await findPOsForOrder(orderId);
    for (const po of pos as any[]) {
      if ([...PRE_RECEIVED, 'received'].includes(po.status)) {
        await supabase
          .from('purchase_orders')
          .update({ status: 'payable' })
          .eq('id', po.id);
      }
    }
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
        .update({ payment_status: 'paid' })
        .eq('id', poId);
    }
  } catch (err) {
    console.error('[po-lifecycle] markPOPaidIfSettled failed:', err);
  }
}

/** Status display helpers */
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
