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

    console.log('Generating shipping label for order:', orderId);

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
      phone: ''
    };

    const orderRef = order.invoice_number || order.id.slice(0, 8).toUpperCase();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shipping Label - ${orderRef}</title>
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
      <p>${business.business_name}</p>
    </div>

    <div class="section">
      <div class="section-header">From</div>
      <div class="address">
        <strong>${business.business_name}</strong><br>
        ${business.address || 'Address not set'}<br>
        ${business.city || ''}${business.postal_code ? ' - ' + business.postal_code : ''}<br>
        ${business.phone ? 'Tel: ' + business.phone : ''}
      </div>
    </div>

    <div class="section" style="flex: 1;">
      <div class="section-header">Ship To</div>
      <div class="address to">
        ${order.shipping_address || 'N/A'}<br>
        ${order.shipping_city || ''}${order.shipping_postal_code ? ' - ' + order.shipping_postal_code : ''}<br>
        ${order.phone ? 'Tel: ' + order.phone : ''}
      </div>
    </div>

    <div class="order-info">
      <div class="order-ref">${orderRef}</div>
      <div class="barcode">*${order.id.slice(0, 12).toUpperCase()}*</div>
      <div class="barcode-text">${order.id.toUpperCase()}</div>
      <div class="date">Generated: ${new Date().toLocaleDateString('en-IN')}</div>
    </div>
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
