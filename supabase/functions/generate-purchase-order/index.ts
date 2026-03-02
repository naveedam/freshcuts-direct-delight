import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// HTML escape function to prevent XSS
function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface PurchaseOrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  received_quantity: number;
}

interface Vendor {
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  gstin: string | null;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_delivery_date: string | null;
  received_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_status: string;
  paid_amount: number;
  notes: string | null;
}

interface Business {
  business_name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  state_name: string | null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent to Vendor',
    confirmed: 'Confirmed',
    partially_received: 'Partially Received',
    received: 'Fully Received',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: '#6b7280',
    sent: '#3b82f6',
    confirmed: '#6366f1',
    partially_received: '#f59e0b',
    received: '#22c55e',
    cancelled: '#ef4444',
  };
  return colors[status] || '#6b7280';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Create client with user's auth token
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token);
    if (authError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const userId = claimsData.claims.sub as string;

    // 3. Verify admin role
    const { data: isAdmin, error: roleError } = await supabaseAuth.rpc('has_role', {
      _user_id: userId,
      _role: 'admin'
    });

    if (roleError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Validate input
    const { purchaseOrderId } = await req.json();
    
    if (!purchaseOrderId) {
      return new Response(JSON.stringify({ error: 'Purchase Order ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(purchaseOrderId)) {
      return new Response(JSON.stringify({ error: 'Invalid purchase order ID format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Generating PO document for:', purchaseOrderId);

    // 5. Now safe to use service role for document generation
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch purchase order
    const { data: po, error: poError } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('id', purchaseOrderId)
      .single();

    if (poError || !po) {
      console.error('PO not found:', poError);
      return new Response(JSON.stringify({ error: 'Purchase Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch vendor
    const { data: vendor } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', po.vendor_id)
      .single();

    // Fetch items
    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('purchase_order_id', purchaseOrderId);

    // Fetch business settings
    const { data: businessSettings } = await supabase
      .from('business_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    const business: Business = businessSettings || {
      business_name: 'My Business',
      address: null,
      city: null,
      postal_code: null,
      phone: null,
      email: null,
      gstin: null,
      state_name: null,
    };

    const orderItems = (items || []) as PurchaseOrderItem[];
    const vendorInfo = vendor as Vendor | null;
    const statusColor = getStatusColor(po.status);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Order ${escapeHtml(po.po_number)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: #f5f5f5; font-size: 12px; }
    .document { max-width: 800px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #8b5cf6; }
    .logo h1 { color: #8b5cf6; font-size: 22px; margin-bottom: 5px; }
    .logo p { color: #666; font-size: 11px; line-height: 1.5; }
    .doc-title { text-align: center; margin-bottom: 20px; }
    .doc-title h2 { color: #333; font-size: 18px; border: 2px solid #333; display: inline-block; padding: 5px 20px; }
    .doc-info { text-align: right; }
    .doc-info p { color: #666; font-size: 11px; margin: 2px 0; }
    .doc-info strong { color: #333; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 11px; font-weight: 600; color: white; background: ${statusColor}; }
    .addresses { display: flex; justify-content: space-between; margin-bottom: 20px; gap: 20px; }
    .address-block { flex: 1; padding: 15px; background: #f9f9f9; border-radius: 4px; }
    .address-block h3 { color: #8b5cf6; font-size: 10px; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px; }
    .address-block p { color: #333; font-size: 11px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
    th { background: #8b5cf6; color: white; padding: 10px 8px; text-align: left; font-size: 10px; text-transform: uppercase; }
    td { padding: 10px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
    tr:hover { background: #f9f9f9; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .section-title { background: #f0f0f0; padding: 8px; font-weight: bold; font-size: 11px; margin: 15px 0 10px 0; border-left: 3px solid #8b5cf6; }
    .summary-box { width: 280px; margin-left: auto; background: #f9f9f9; padding: 15px; border-radius: 4px; }
    .summary-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 11px; }
    .summary-row.total { border-top: 2px solid #8b5cf6; margin-top: 8px; padding-top: 10px; font-weight: bold; font-size: 14px; color: #8b5cf6; }
    .notes { margin-top: 20px; padding: 15px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 4px; font-size: 11px; }
    .notes h4 { color: #92400e; font-size: 11px; margin-bottom: 5px; }
    .notes p { color: #78350f; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; display: flex; justify-content: space-between; }
    .footer-section { flex: 1; }
    .footer-section h4 { font-size: 10px; color: #8b5cf6; text-transform: uppercase; margin-bottom: 8px; }
    .footer-section p { font-size: 10px; color: #666; line-height: 1.6; }
    .signature-box { text-align: right; }
    .signature-line { margin-top: 50px; border-top: 1px solid #333; width: 180px; margin-left: auto; }
    .signature-label { font-size: 10px; color: #666; margin-top: 5px; }
    .received-badge { display: inline-block; background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
    .pending-badge { display: inline-block; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
    @media print { 
      body { padding: 0; background: white; }
      .document { box-shadow: none; padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="document">
    <div class="header">
      <div class="logo">
        <h1>${escapeHtml(business.business_name)}</h1>
        <p>${escapeHtml(business.address)}</p>
        <p>${escapeHtml(business.city)}${business.postal_code ? ', ' + escapeHtml(business.postal_code) : ''}</p>
        ${business.phone ? `<p>Phone: ${escapeHtml(business.phone)}</p>` : ''}
        ${business.email ? `<p>Email: ${escapeHtml(business.email)}</p>` : ''}
        ${business.gstin ? `<p><strong>GSTIN: ${escapeHtml(business.gstin)}</strong></p>` : ''}
      </div>
      <div class="doc-info">
        <p><strong>PO Number:</strong> ${escapeHtml(po.po_number)}</p>
        <p><strong>Order Date:</strong> ${formatDate(po.order_date)}</p>
        ${po.expected_delivery_date ? `<p><strong>Expected Delivery:</strong> ${formatDate(po.expected_delivery_date)}</p>` : ''}
        ${po.received_date ? `<p><strong>Received Date:</strong> ${formatDate(po.received_date)}</p>` : ''}
        <p style="margin-top: 10px;"><span class="status-badge">${getStatusLabel(po.status)}</span></p>
      </div>
    </div>

    <div class="doc-title">
      <h2>PURCHASE ORDER</h2>
    </div>

    <div class="addresses">
      <div class="address-block">
        <h3>From (Buyer)</h3>
        <p><strong>${escapeHtml(business.business_name)}</strong></p>
        <p>${escapeHtml(business.address) || 'N/A'}</p>
        <p>${escapeHtml(business.city)}${business.postal_code ? ', ' + escapeHtml(business.postal_code) : ''}</p>
        ${business.gstin ? `<p>GSTIN: ${escapeHtml(business.gstin)}</p>` : ''}
      </div>
      <div class="address-block">
        <h3>To (Vendor/Supplier)</h3>
        ${vendorInfo ? `
          <p><strong>${escapeHtml(vendorInfo.name)}</strong></p>
          ${vendorInfo.contact_person ? `<p>Attn: ${escapeHtml(vendorInfo.contact_person)}</p>` : ''}
          <p>${escapeHtml(vendorInfo.address)}</p>
          <p>${escapeHtml(vendorInfo.city)}${vendorInfo.state ? ', ' + escapeHtml(vendorInfo.state) : ''}${vendorInfo.postal_code ? ' ' + escapeHtml(vendorInfo.postal_code) : ''}</p>
          ${vendorInfo.phone ? `<p>Phone: ${escapeHtml(vendorInfo.phone)}</p>` : ''}
          ${vendorInfo.email ? `<p>Email: ${escapeHtml(vendorInfo.email)}</p>` : ''}
          ${vendorInfo.gstin ? `<p>GSTIN: ${escapeHtml(vendorInfo.gstin)}</p>` : ''}
        ` : '<p>Vendor information not available</p>'}
      </div>
    </div>

    <div class="section-title">Order Items</div>
    <table>
      <thead>
        <tr>
          <th style="width: 5%">#</th>
          <th style="width: 40%">Product / Description</th>
          <th class="text-center" style="width: 12%">Qty Ordered</th>
          <th class="text-center" style="width: 12%">Qty Received</th>
          <th class="text-right" style="width: 15%">Unit Cost</th>
          <th class="text-right" style="width: 16%">Total</th>
        </tr>
      </thead>
      <tbody>
        ${orderItems.map((item, index) => {
          const isComplete = item.received_quantity >= item.quantity;
          return `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(item.product_name)}</td>
            <td class="text-center">${item.quantity}</td>
            <td class="text-center">
              ${item.received_quantity > 0 
                ? `<span class="${isComplete ? 'received-badge' : 'pending-badge'}">${item.received_quantity}</span>` 
                : '-'}
            </td>
            <td class="text-right">${formatCurrency(item.unit_cost)}</td>
            <td class="text-right">${formatCurrency(item.total_cost)}</td>
          </tr>
        `}).join('')}
      </tbody>
    </table>

    <div class="summary-box">
      <div class="summary-row">
        <span>Subtotal</span>
        <span>${formatCurrency(po.subtotal)}</span>
      </div>
      <div class="summary-row">
        <span>Tax</span>
        <span>${formatCurrency(po.tax_amount)}</span>
      </div>
      <div class="summary-row total">
        <span>Total Amount</span>
        <span>${formatCurrency(po.total_amount)}</span>
      </div>
      <div class="summary-row" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd;">
        <span>Amount Paid</span>
        <span style="color: #22c55e;">${formatCurrency(po.paid_amount || 0)}</span>
      </div>
      <div class="summary-row">
        <span>Balance Due</span>
        <span style="color: #ef4444; font-weight: bold;">${formatCurrency(po.total_amount - (po.paid_amount || 0))}</span>
      </div>
    </div>

    ${po.notes ? `
    <div class="notes">
      <h4>Notes / Terms</h4>
      <p>${escapeHtml(po.notes)}</p>
    </div>
    ` : ''}

    <div class="footer">
      <div class="footer-section">
        <h4>Terms &amp; Conditions</h4>
        <p>1. Please confirm receipt of this order.</p>
        <p>2. Delivery as per expected delivery date.</p>
        <p>3. Quality must meet agreed specifications.</p>
        <p>4. Payment terms as agreed.</p>
      </div>
      <div class="signature-box">
        <div class="signature-line"></div>
        <p class="signature-label">Authorized Signature</p>
        <p style="font-size: 10px; color: #666; margin-top: 5px;">${escapeHtml(business.business_name)}</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    return new Response(html, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html' }
    });

  } catch (error) {
    console.error('Error generating PO document:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate document' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
