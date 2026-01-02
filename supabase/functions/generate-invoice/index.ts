import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId } = await req.json();
    
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Order ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Generating invoice for order:', orderId);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('Order not found:', orderError);
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch order items
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsError) {
      console.error('Failed to fetch order items:', itemsError);
    }

    // Fetch business settings
    const { data: businessSettings } = await supabase
      .from('business_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    const business = businessSettings || {
      business_name: 'My Business',
      address: '',
      city: '',
      postal_code: '',
      phone: '',
      email: '',
      gstin: ''
    };

    const invoiceDate = new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const items = orderItems || [];
    const subtotal = items.reduce((sum, item) => sum + Number(item.total_price), 0);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${order.invoice_number || order.id.slice(0, 8)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; background: #f5f5f5; }
    .invoice { max-width: 800px; margin: 0 auto; background: white; padding: 40px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #16a34a; }
    .logo h1 { color: #16a34a; font-size: 28px; margin-bottom: 5px; }
    .logo p { color: #666; font-size: 12px; }
    .invoice-info { text-align: right; }
    .invoice-info h2 { color: #333; font-size: 24px; margin-bottom: 10px; }
    .invoice-info p { color: #666; font-size: 14px; margin: 3px 0; }
    .addresses { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .address-block { width: 48%; }
    .address-block h3 { color: #16a34a; font-size: 12px; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 1px; }
    .address-block p { color: #333; font-size: 14px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #16a34a; color: white; padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; }
    td { padding: 12px; border-bottom: 1px solid #eee; font-size: 14px; }
    tr:hover { background: #f9f9f9; }
    .text-right { text-align: right; }
    .totals { margin-left: auto; width: 300px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .totals-row.total { border-top: 2px solid #16a34a; border-bottom: none; font-weight: bold; font-size: 18px; color: #16a34a; padding-top: 15px; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-processing { background: #dbeafe; color: #1e40af; }
    .status-shipped { background: #e9d5ff; color: #7c3aed; }
    .status-delivered { background: #dcfce7; color: #166534; }
    @media print { 
      body { padding: 0; background: white; }
      .invoice { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div class="logo">
        <h1>${business.business_name}</h1>
        <p>${business.address || ''}</p>
        <p>${business.city || ''}${business.postal_code ? ', ' + business.postal_code : ''}</p>
        ${business.phone ? `<p>Phone: ${business.phone}</p>` : ''}
        ${business.gstin ? `<p>GSTIN: ${business.gstin}</p>` : ''}
      </div>
      <div class="invoice-info">
        <h2>INVOICE</h2>
        <p><strong>${order.invoice_number || 'N/A'}</strong></p>
        <p>Date: ${invoiceDate}</p>
        <p>Order: #${order.id.slice(0, 8).toUpperCase()}</p>
        <p style="margin-top: 10px;"><span class="status-badge status-${order.status}">${order.status}</span></p>
      </div>
    </div>

    <div class="addresses">
      <div class="address-block">
        <h3>From</h3>
        <p><strong>${business.business_name}</strong></p>
        <p>${business.address || 'N/A'}</p>
        <p>${business.city || ''}${business.postal_code ? ', ' + business.postal_code : ''}</p>
        ${business.email ? `<p>${business.email}</p>` : ''}
      </div>
      <div class="address-block">
        <h3>Bill To</h3>
        <p>${order.shipping_address || 'N/A'}</p>
        <p>${order.shipping_city || ''}${order.shipping_postal_code ? ', ' + order.shipping_postal_code : ''}</p>
        ${order.phone ? `<p>Phone: ${order.phone}</p>` : ''}
        ${order.customer_email ? `<p>${order.customer_email}</p>` : ''}
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Unit Price</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td>${item.product_name}</td>
            <td class="text-right">${Number(item.quantity)}</td>
            <td class="text-right">₹${Number(item.unit_price).toFixed(2)}</td>
            <td class="text-right">₹${Number(item.total_price).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Subtotal</span>
        <span>₹${subtotal.toFixed(2)}</span>
      </div>
      <div class="totals-row">
        <span>Shipping</span>
        <span>₹${(Number(order.total_amount) - subtotal).toFixed(2)}</span>
      </div>
      <div class="totals-row total">
        <span>Total</span>
        <span>₹${Number(order.total_amount).toFixed(2)}</span>
      </div>
    </div>

    ${order.notes ? `<p style="margin-top: 20px; color: #666; font-size: 14px;"><strong>Notes:</strong> ${order.notes}</p>` : ''}

    <div class="footer">
      <p>Thank you for your business!</p>
      <p style="margin-top: 5px;">${business.email || ''} | ${business.phone || ''}</p>
    </div>
  </div>
</body>
</html>
    `;

    console.log('Invoice generated successfully');

    return new Response(html, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html' }
    });

  } catch (error: unknown) {
    console.error('Error generating invoice:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
