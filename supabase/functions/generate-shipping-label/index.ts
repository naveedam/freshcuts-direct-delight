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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const { orderId } = await req.json();
    
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Order ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return new Response(JSON.stringify({ error: 'Invalid order ID format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Generating shipping label for order:', orderId);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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

    // Validate required delivery address fields
    if (!order.flat_number && !order.building_name) {
      return new Response(JSON.stringify({ error: 'Cannot generate shipping label: Flat/House Number and Building/Apartment Name are required. Please update the order delivery details first.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

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
      phone: ''
    };

    const orderRef = order.invoice_number || order.id.slice(0, 8).toUpperCase();

    // Build delivery address lines — NO customer name, phone, or email
    const deliveryLines: string[] = [];
    if (order.flat_number) deliveryLines.push(`Flat/House: ${order.flat_number}`);
    if (order.building_name) deliveryLines.push(order.building_name);
    if (order.shipping_address) deliveryLines.push(order.shipping_address);
    const cityPostal = [order.shipping_city, order.shipping_postal_code].filter(Boolean).join(' – ');
    if (cityPostal) deliveryLines.push(cityPostal);

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shipping Label - ${escapeHtml(orderRef)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; padding: 20px; background: #f5f5f5; }
    .label { 
      width: 4in; 
      height: 6in; 
      margin: 0 auto; 
      background: white; 
      border: 3px solid #000; 
      padding: 15px;
      display: flex;
      flex-direction: column;
    }
    .header {
      text-align: center;
      padding-bottom: 10px;
      border-bottom: 2px dashed #000;
      margin-bottom: 15px;
    }
    .header h1 { font-size: 14px; text-transform: uppercase; letter-spacing: 2px; }
    .header p { font-size: 10px; margin-top: 5px; }
    .section {
      margin-bottom: 15px;
      padding: 10px;
      border: 1px solid #000;
    }
    .section-header {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: bold;
      margin-bottom: 8px;
      background: #000;
      color: #fff;
      padding: 3px 8px;
      display: inline-block;
    }
    .address {
      font-size: 12px;
      line-height: 1.5;
    }
    .address.to {
      font-size: 16px;
      font-weight: bold;
      line-height: 1.6;
    }
    .order-info {
      text-align: center;
      padding: 15px;
      border: 2px solid #000;
      margin-top: auto;
    }
    .order-ref {
      font-size: 24px;
      font-weight: bold;
      letter-spacing: 2px;
    }
    .barcode {
      margin-top: 10px;
      font-family: 'Libre Barcode 39', monospace;
      font-size: 48px;
      letter-spacing: 3px;
    }
    .barcode-text {
      font-size: 10px;
      margin-top: 5px;
    }
    .date {
      font-size: 10px;
      margin-top: 10px;
      color: #666;
    }
    .privacy-note {
      font-size: 8px;
      color: #999;
      text-align: center;
      margin-top: 8px;
      font-style: italic;
    }
    @media print {
      body { padding: 0; background: white; }
      .label { border: 2px solid #000; }
      @page { size: 4in 6in; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="label">
    <div class="header">
      <h1>Shipping Label</h1>
      <p>${escapeHtml(business.business_name)}</p>
    </div>

    <div class="section">
      <div class="section-header">From</div>
      <div class="address">
        <strong>${escapeHtml(business.business_name)}</strong><br>
        ${escapeHtml(business.address) || 'Address not set'}<br>
        ${escapeHtml(business.city)}${business.postal_code ? ' - ' + escapeHtml(business.postal_code) : ''}
      </div>
    </div>

    <div class="section" style="flex: 1;">
      <div class="section-header">Deliver To</div>
      <div class="address to">
        ${deliveryLines.map(line => escapeHtml(line)).join('<br>')}
      </div>
    </div>

    <div class="order-info">
      <div class="order-ref">${escapeHtml(orderRef)}</div>
      <div class="barcode">*${order.id.slice(0, 12).toUpperCase()}*</div>
      <div class="barcode-text">${order.id.toUpperCase()}</div>
      <div class="date">Generated: ${new Date().toLocaleDateString('en-IN')}</div>
    </div>
    <div class="privacy-note">Customer contact details withheld for privacy</div>
  </div>
</body>
</html>
    `;

    console.log('Shipping label generated successfully');

    return new Response(html, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html' }
    });

  } catch (error: unknown) {
    console.error('Error generating shipping label:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
