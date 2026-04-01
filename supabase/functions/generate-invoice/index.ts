import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  hsn_code: string | null;
  gst_type: string;
  gst_rate: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  actual_weight: number | null;
}

/**
 * Get the display quantity for an order item.
 * Priority: actual_weight (fulfilled/delivered qty) → quantity (ordered qty)
 */
function getDisplayQty(item: OrderItem): number {
  if (item.actual_weight != null && item.actual_weight > 0) {
    return Number(item.actual_weight);
  }
  return Number(item.quantity);
}

/**
 * Format quantity for invoice display — always in kg with 3 decimal precision
 */
function formatQty(qty: number): string {
  return qty.toFixed(3);
}

interface Order {
  id: string;
  invoice_number: string | null;
  status: string;
  total_amount: number;
  customer_email: string | null;
  phone: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_postal_code: string | null;
  building_name: string | null;
  flat_number: string | null;
  place_of_supply: string | null;
  is_igst: boolean;
  notes: string | null;
  created_at: string;
  discount_type: string | null;
  discount_value: number | null;
  discount_amount: number | null;
}

interface Business {
  business_name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  state_code: string | null;
  state_name: string | null;
}

interface HSNSummary {
  hsn_code: string;
  description: string;
  quantity: number;
  taxable_value: number;
  cgst_rate: number;
  cgst_amount: number;
  sgst_rate: number;
  sgst_amount: number;
  igst_rate: number;
  igst_amount: number;
  total_tax: number;
}

interface GSTSummary {
  total_taxable_value: number;
  total_exempt_value: number;
  total_nil_rated_value: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_tax: number;
  grand_total: number;
}

function normalizeGstType(raw: string): string {
  const lower = String(raw || '').toLowerCase();
  return lower === 'nil-rated' ? 'nil' : lower;
}

function calculateLineItemGST(
  item: OrderItem, isIGST: boolean
): { taxableValue: number; cgst: number; sgst: number; igst: number; displayQty: number } {
  const displayQty = getDisplayQty(item);
  const lineValue = displayQty * Number(item.unit_price);
  const nt = normalizeGstType(item.gst_type);
  if (nt === 'exempt' || nt === 'nil' || Number(item.gst_rate) === 0) {
    return { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, displayQty };
  }
  const taxableValue = lineValue;
  const totalGST = (taxableValue * Number(item.gst_rate)) / 100;
  if (isIGST) return { taxableValue, cgst: 0, sgst: 0, igst: totalGST, displayQty };
  const halfGST = totalGST / 2;
  return { taxableValue, cgst: halfGST, sgst: halfGST, igst: 0, displayQty };
}

function buildHSNSummary(items: OrderItem[], isIGST: boolean): HSNSummary[] {
  const hsnMap = new Map<string, HSNSummary>();
  items.forEach(item => {
    const nt = normalizeGstType(item.gst_type);
    if (nt !== 'taxable') return;
    const displayQty = getDisplayQty(item);
    const hsnCode = item.hsn_code || 'N/A';
    const lineValue = displayQty * Number(item.unit_price);
    const gstRate = Number(item.gst_rate);
    const totalGST = (lineValue * gstRate) / 100;
    const cgst = isIGST ? 0 : totalGST / 2;
    const sgst = isIGST ? 0 : totalGST / 2;
    const igst = isIGST ? totalGST : 0;
    const existing = hsnMap.get(hsnCode);
    if (existing) {
      existing.quantity += displayQty;
      existing.taxable_value += lineValue;
      existing.cgst_amount += cgst;
      existing.sgst_amount += sgst;
      existing.igst_amount += igst;
      existing.total_tax = existing.cgst_amount + existing.sgst_amount + existing.igst_amount;
    } else {
      hsnMap.set(hsnCode, {
        hsn_code: hsnCode, description: item.product_name, quantity: displayQty,
        taxable_value: lineValue,
        cgst_rate: isIGST ? 0 : gstRate / 2, cgst_amount: cgst,
        sgst_rate: isIGST ? 0 : gstRate / 2, sgst_amount: sgst,
        igst_rate: isIGST ? gstRate : 0, igst_amount: igst,
        total_tax: cgst + sgst + igst,
      });
    }
  });
  return Array.from(hsnMap.values());
}

function calculateGSTSummary(items: OrderItem[], isIGST: boolean): GSTSummary {
  let totalTaxableValue = 0, totalExemptValue = 0, totalNilRatedValue = 0;
  let totalCGST = 0, totalSGST = 0, totalIGST = 0;
  items.forEach(item => {
    const displayQty = getDisplayQty(item);
    const lineValue = displayQty * Number(item.unit_price);
    const nt = normalizeGstType(item.gst_type);
    const gstRate = Number(item.gst_rate);
    if (nt === 'exempt') { totalExemptValue += lineValue; }
    else if (nt === 'nil') { totalNilRatedValue += lineValue; }
    else if (nt === 'taxable') {
      totalTaxableValue += lineValue;
      const totalGST = (lineValue * gstRate) / 100;
      if (isIGST) { totalIGST += totalGST; }
      else { totalCGST += totalGST / 2; totalSGST += totalGST / 2; }
    }
  });
  const totalTax = totalCGST + totalSGST + totalIGST;
  const grandTotal = totalTaxableValue + totalExemptValue + totalNilRatedValue + totalTax;
  return { total_taxable_value: totalTaxableValue, total_exempt_value: totalExemptValue, total_nil_rated_value: totalNilRatedValue, total_cgst: totalCGST, total_sgst: totalSGST, total_igst: totalIGST, total_tax: totalTax, grand_total: grandTotal };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount);
}

function getGSTTypeLabel(gstType: string, gstRate: number): string {
  if (gstType === 'exempt') return 'Exempt';
  if (gstType === 'nil') return 'NIL (0%)';
  return `${gstRate}%`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
    if (authError || !claimsData?.claims) return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const userId = claimsData.claims.sub as string;

    const { data: isAdmin, error: roleError } = await supabaseAuth.rpc('has_role', { _user_id: userId, _role: 'admin' });
    if (roleError || !isAdmin) return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { orderId, recalculate = false } = await req.json();
    if (!orderId) return new Response(JSON.stringify({ error: 'Order ID is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) return new Response(JSON.stringify({ error: 'Invalid order ID format' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: order, error: orderError } = await supabase.from('orders').select('*').eq('id', orderId).single();
    if (orderError || !order) return new Response(JSON.stringify({ error: 'Order not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Validate required delivery address fields
    if (!order.flat_number && !order.building_name) {
      return new Response(JSON.stringify({ error: 'Cannot generate invoice: Flat/House Number and Building/Apartment Name are required. Please update the order delivery details first.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let { data: orderItems, error: itemsError } = await supabase.from('order_items').select('*').eq('order_id', orderId);
    if (itemsError) orderItems = [];

    if (recalculate && orderItems && orderItems.length > 0) {
      for (const item of orderItems) {
        const gst = calculateLineItemGST(item as OrderItem, order.is_igst);
        await supabase.from('order_items').update({ taxable_value: gst.taxableValue, cgst_amount: gst.cgst, sgst_amount: gst.sgst, igst_amount: gst.igst }).eq('id', item.id);
        item.taxable_value = gst.taxableValue; item.cgst_amount = gst.cgst; item.sgst_amount = gst.sgst; item.igst_amount = gst.igst;
      }
    }

    const { data: businessSettings } = await supabase.from('business_settings').select('*').limit(1).maybeSingle();
    const business: Business = businessSettings || { business_name: 'My Business', address: null, city: null, postal_code: null, phone: null, email: null, gstin: null, state_code: null, state_name: null };

    const items = (orderItems || []) as OrderItem[];
    const isIGST = order.is_igst;
    const hsnSummary = buildHSNSummary(items, isIGST);
    const gstSummary = calculateGSTSummary(items);

    const discountAmount = Number(order.discount_amount) || 0;
    const discountType = order.discount_type || 'none';
    const discountValue = Number(order.discount_value) || 0;
    const subtotal = gstSummary.total_exempt_value + gstSummary.total_nil_rated_value + gstSummary.total_taxable_value;
    const grandTotalWithDiscount = gstSummary.grand_total - discountAmount;

    const invoiceDate = new Date(order.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

    // Build structured delivery address for Bill To
    const deliveryAddressLines: string[] = [];
    if (order.flat_number) deliveryAddressLines.push(`Flat/House: ${order.flat_number}`);
    if (order.building_name) deliveryAddressLines.push(order.building_name);
    if (order.shipping_address) deliveryAddressLines.push(order.shipping_address);
    const cityPostal = [order.shipping_city, order.shipping_postal_code].filter(Boolean).join(' – ');
    if (cityPostal) deliveryAddressLines.push(cityPostal);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tax Invoice ${escapeHtml(order.invoice_number) || order.id.slice(0, 8)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #f5f5f5; font-size: 12px; }
    .invoice { max-width: 800px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #16a34a; }
    .logo h1 { color: #16a34a; font-size: 22px; margin-bottom: 5px; }
    .logo p { color: #666; font-size: 11px; line-height: 1.5; }
    .invoice-title { text-align: center; margin-bottom: 20px; }
    .invoice-title h2 { color: #333; font-size: 18px; border: 2px solid #333; display: inline-block; padding: 5px 20px; }
    .invoice-info { text-align: right; }
    .invoice-info p { color: #666; font-size: 11px; margin: 2px 0; }
    .invoice-info strong { color: #333; }
    .addresses { display: flex; justify-content: space-between; margin-bottom: 20px; gap: 20px; }
    .address-block { flex: 1; padding: 10px; background: #f9f9f9; border-radius: 4px; }
    .address-block h3 { color: #16a34a; font-size: 10px; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px; }
    .address-block p { color: #333; font-size: 11px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    th { background: #16a34a; color: white; padding: 8px 6px; text-align: left; font-size: 10px; text-transform: uppercase; }
    td { padding: 8px 6px; border-bottom: 1px solid #eee; font-size: 11px; }
    tr:hover { background: #f9f9f9; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .section-title { background: #f0f0f0; padding: 8px; font-weight: bold; font-size: 11px; margin: 15px 0 10px 0; border-left: 3px solid #16a34a; }
    .summary-grid { display: flex; justify-content: space-between; gap: 20px; margin-top: 20px; }
    .summary-box { flex: 1; padding: 15px; background: #f9f9f9; border-radius: 4px; }
    .summary-box h4 { color: #16a34a; font-size: 11px; text-transform: uppercase; margin-bottom: 10px; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 11px; }
    .summary-row.total { border-top: 2px solid #16a34a; margin-top: 8px; padding-top: 8px; font-weight: bold; font-size: 14px; color: #16a34a; }
    .summary-row.discount { color: #dc2626; }
    .gst-tag { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: 600; }
    .gst-exempt { background: #fef3c7; color: #92400e; }
    .gst-nil { background: #e0e7ff; color: #3730a3; }
    .gst-taxable { background: #dcfce7; color: #166534; }
    .declaration { margin-top: 20px; padding: 15px; background: #fffbeb; border: 1px solid #fcd34d; border-radius: 4px; font-size: 10px; color: #92400e; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; }
    .footer-grid { display: flex; justify-content: space-between; }
    .footer-section { flex: 1; }
    .footer-section h4 { font-size: 10px; color: #16a34a; text-transform: uppercase; margin-bottom: 8px; }
    .footer-section p { font-size: 10px; color: #666; line-height: 1.6; }
    .signature-box { text-align: right; }
    .signature-line { margin-top: 40px; border-top: 1px solid #333; width: 150px; margin-left: auto; }
    .signature-label { font-size: 10px; color: #666; margin-top: 5px; }
    @media print { body { padding: 0; background: white; } .invoice { box-shadow: none; padding: 20px; } }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="logo">
        <h1>${escapeHtml(business.business_name)}</h1>
        <p>${escapeHtml(business.address)}</p>
        <p>${escapeHtml(business.city)}${business.postal_code ? ', ' + escapeHtml(business.postal_code) : ''}</p>
        ${business.phone ? `<p>Phone: ${escapeHtml(business.phone)}</p>` : ''}
        ${business.email ? `<p>Email: ${escapeHtml(business.email)}</p>` : ''}
        ${business.gstin ? `<p><strong>GSTIN: ${escapeHtml(business.gstin)}</strong></p>` : ''}
        ${business.state_name ? `<p>State: ${escapeHtml(business.state_name)}${business.state_code ? ' (' + escapeHtml(business.state_code) + ')' : ''}</p>` : ''}
      </div>
      <div class="invoice-info">
        <p><strong>Invoice No:</strong> ${escapeHtml(order.invoice_number) || 'DRAFT'}</p>
        <p><strong>Date:</strong> ${invoiceDate}</p>
        <p><strong>Order ID:</strong> #${order.id.slice(0, 8).toUpperCase()}</p>
        ${order.place_of_supply ? `<p><strong>Place of Supply:</strong> ${escapeHtml(order.place_of_supply)}</p>` : ''}
        <p style="margin-top: 8px;"><strong>Supply Type:</strong> ${isIGST ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)'}</p>
      </div>
    </div>

    <div class="invoice-title"><h2>TAX INVOICE</h2></div>

    <div class="addresses">
      <div class="address-block">
        <h3>Sold By</h3>
        <p><strong>${escapeHtml(business.business_name)}</strong></p>
        <p>${escapeHtml(business.address) || 'N/A'}</p>
        <p>${escapeHtml(business.city)}${business.postal_code ? ', ' + escapeHtml(business.postal_code) : ''}</p>
        ${business.gstin ? `<p>GSTIN: ${escapeHtml(business.gstin)}</p>` : ''}
      </div>
      <div class="address-block">
        <h3>Deliver To</h3>
        ${deliveryAddressLines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}
        ${order.phone ? `<p style="margin-top: 6px;">Phone: ${escapeHtml(order.phone)}</p>` : ''}
        ${order.customer_email ? `<p>Email: ${escapeHtml(order.customer_email)}</p>` : ''}
      </div>
    </div>

    <div class="section-title">Invoice Details</div>
    <table>
      <thead>
        <tr>
          <th style="width: 5%">#</th>
          <th style="width: 25%">Product</th>
          <th style="width: 10%">HSN</th>
          <th class="text-center" style="width: 8%">Qty</th>
          <th class="text-right" style="width: 10%">Rate</th>
          <th class="text-right" style="width: 12%">Value</th>
          <th class="text-center" style="width: 10%">GST</th>
          <th class="text-right" style="width: 10%">Tax Amt</th>
          <th class="text-right" style="width: 10%">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, index) => {
          const lineValue = Number(item.quantity) * Number(item.unit_price);
          const taxAmount = Number(item.cgst_amount) + Number(item.sgst_amount) + Number(item.igst_amount);
          const total = lineValue + taxAmount;
          const gstLabel = getGSTTypeLabel(item.gst_type, Number(item.gst_rate));
          const gstClass = item.gst_type === 'exempt' ? 'gst-exempt' : item.gst_type === 'nil' ? 'gst-nil' : 'gst-taxable';
          return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(item.hsn_code) || '-'}</td>
            <td class="text-center">${Number(item.quantity)}</td>
            <td class="text-right">${formatCurrency(Number(item.unit_price))}</td>
            <td class="text-right">${formatCurrency(lineValue)}</td>
            <td class="text-center"><span class="gst-tag ${gstClass}">${gstLabel}</span></td>
            <td class="text-right">${formatCurrency(taxAmount)}</td>
            <td class="text-right">${formatCurrency(total)}</td>
          </tr>
        `}).join('')}
      </tbody>
    </table>

    <div class="section-title">HSN Summary</div>
    <table>
      <thead>
        <tr>
          <th>HSN Code</th>
          <th class="text-right">Taxable Value</th>
          ${isIGST ? `<th class="text-center">IGST Rate</th><th class="text-right">IGST Amount</th>` : `<th class="text-center">CGST Rate</th><th class="text-right">CGST Amount</th><th class="text-center">SGST Rate</th><th class="text-right">SGST Amount</th>`}
          <th class="text-right">Total Tax</th>
        </tr>
      </thead>
      <tbody>
        ${hsnSummary.map(hsn => `
          <tr>
            <td>${escapeHtml(hsn.hsn_code)}</td>
            <td class="text-right">${formatCurrency(hsn.taxable_value)}</td>
            ${isIGST ? `<td class="text-center">${hsn.igst_rate}%</td><td class="text-right">${formatCurrency(hsn.igst_amount)}</td>` : `<td class="text-center">${hsn.cgst_rate}%</td><td class="text-right">${formatCurrency(hsn.cgst_amount)}</td><td class="text-center">${hsn.sgst_rate}%</td><td class="text-right">${formatCurrency(hsn.sgst_amount)}</td>`}
            <td class="text-right">${formatCurrency(hsn.total_tax)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="summary-grid">
      <div class="summary-box">
        <h4>Supply Breakdown</h4>
        ${gstSummary.total_exempt_value > 0 ? `<div class="summary-row"><span>Exempt Supply</span><span>${formatCurrency(gstSummary.total_exempt_value)}</span></div>` : ''}
        ${gstSummary.total_nil_rated_value > 0 ? `<div class="summary-row"><span>NIL Rated Supply (0%)</span><span>${formatCurrency(gstSummary.total_nil_rated_value)}</span></div>` : ''}
        ${gstSummary.total_taxable_value > 0 ? `<div class="summary-row"><span>Taxable Supply</span><span>${formatCurrency(gstSummary.total_taxable_value)}</span></div>` : ''}
      </div>
      <div class="summary-box">
        <h4>Tax Summary</h4>
        ${isIGST ? `<div class="summary-row"><span>IGST</span><span>${formatCurrency(gstSummary.total_igst)}</span></div>` : `<div class="summary-row"><span>CGST</span><span>${formatCurrency(gstSummary.total_cgst)}</span></div><div class="summary-row"><span>SGST</span><span>${formatCurrency(gstSummary.total_sgst)}</span></div>`}
        <div class="summary-row" style="border-top: 1px solid #ddd; margin-top: 5px; padding-top: 5px;"><span><strong>Total Tax</strong></span><span><strong>${formatCurrency(gstSummary.total_tax)}</strong></span></div>
      </div>
      <div class="summary-box">
        <h4>Invoice Total</h4>
        <div class="summary-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
        <div class="summary-row"><span>Total Tax</span><span>${formatCurrency(gstSummary.total_tax)}</span></div>
        ${discountAmount > 0 ? `<div class="summary-row discount"><span>Discount${discountType === 'percentage' ? ` (${discountValue}%)` : ''}</span><span>-${formatCurrency(discountAmount)}</span></div>` : ''}
        <div class="summary-row total"><span>Grand Total</span><span>${formatCurrency(grandTotalWithDiscount)}</span></div>
      </div>
    </div>

    <div class="declaration">
      <strong>Declaration:</strong> Fresh unbranded food items – supplied loose where applicable. 
      ${gstSummary.total_exempt_value > 0 ? 'This invoice includes exempt supplies. ' : ''}
      ${gstSummary.total_nil_rated_value > 0 ? 'This invoice includes NIL rated supplies (GST @ 0%). ' : ''}
      We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
    </div>

    ${order.notes ? `<p style="margin-top: 15px; color: #666; font-size: 11px;"><strong>Notes:</strong> ${escapeHtml(order.notes)}</p>` : ''}

    <div class="footer">
      <div class="footer-grid">
        <div class="footer-section">
          <h4>Terms &amp; Conditions</h4>
          <p>1. Goods once sold will not be taken back.</p>
          <p>2. Subject to local jurisdiction only.</p>
          <p>3. E. &amp; O.E.</p>
        </div>
        <div class="footer-section signature-box">
          <p><strong>For ${escapeHtml(business.business_name)}</strong></p>
          <div class="signature-line"></div>
          <p class="signature-label">Authorized Signatory</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    return new Response(html, { headers: { ...corsHeaders, 'Content-Type': 'text/html' } });
  } catch (error: unknown) {
    console.error('Error generating invoice:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
