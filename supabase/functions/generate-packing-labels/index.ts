import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: claims, error: authError } = await supabaseAuth.auth.getClaims(token)
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const { data: isAdmin } = await supabaseAuth.rpc('has_role', {
      _user_id: claims.claims.sub, _role: 'admin'
    })
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { orderId } = await req.json()
    if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return new Response(JSON.stringify({ error: 'Invalid order ID' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: order, error: orderErr } = await supabase
      .from('orders').select('*').eq('id', orderId).single()
    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: items, error: itemsErr } = await supabase
      .from('order_items').select('*').eq('order_id', orderId)
    if (itemsErr || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items found for this order' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const flat = order.flat_number || ''

    const labelsHtml = items.map((item: any) => {
      return `
        <div class="label">
          <div class="brand">Fresh Cuts Daily</div>
          <div class="flat">${esc(flat) || '—'}</div>
          <div class="product">${esc(item.product_name)}</div>
        </div>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Packing Labels</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; font-family: Arial, Helvetica, sans-serif; color: #000; }
  body { padding: 12px; }
  .toolbar {
    max-width: 600px; margin: 0 auto 16px; display: flex; gap: 8px;
    justify-content: center;
  }
  .toolbar button {
    padding: 8px 18px; font-size: 13px; border: 1px solid #333; background: #fff;
    cursor: pointer; border-radius: 4px;
  }
  .toolbar button.primary { background: #000; color: #fff; }
  .label {
    width: 4in;
    height: 6in;
    background: #fff;
    margin: 0 auto;
    padding: 0.28in;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.34in;
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-after: always;
    overflow: hidden;
  }
  .label:last-child { page-break-after: auto; }
  .brand {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 0;
    text-align: center;
  }
  .flat {
    font-size: 74px;
    font-weight: 900;
    text-align: center;
    line-height: 1;
    letter-spacing: 0;
    word-break: break-word;
  }
  .product {
    font-size: 42px;
    font-weight: 900;
    text-align: center;
    line-height: 1.08;
    letter-spacing: 0;
    word-break: break-word;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .label { margin: 0; }
    @page { size: 4in 6in; margin: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="window.print()">Print Labels</button>
    <button onclick="window.close()">Close</button>
  </div>
  ${labelsHtml}
  <script>setTimeout(() => window.print(), 350);</script>
</body>
</html>`

    return new Response(html, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html' }
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})