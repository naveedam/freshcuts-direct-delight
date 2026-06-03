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
      .from('order_items')
      .select('*, products(pricing_model)')
      .eq('order_id', orderId)
    if (itemsErr || !items || items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items found for this order' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const flat = order.flat_number || ''
    const building = order.building_name || ''
    const total = items.length

    function formatQty(item: any): string {
      const model = item.products?.pricing_model || 'weight_based'
      if (model === 'unit_based') {
        const n = Number(item.quantity || 0)
        return `${n} ${n === 1 ? 'UNIT' : 'UNITS'}`
      }
      let kg: number
      if (item.actual_weight != null) kg = Number(item.actual_weight)
      else if (item.billed_weight != null) kg = Number(item.billed_weight)
      else kg = Number(item.quantity || 0) * 0.5
      return `${kg.toFixed(2)} KG`
    }

    const labelsHtml = items.map((item: any, idx: number) => {
      return `
        <div class="label">
          <div class="counter">#${idx + 1}/${total}</div>
          <div class="brand">FRESH CUTS DAILY</div>
          <div class="flat">${esc(flat) || '—'}</div>
          ${building ? `<div class="building">${esc(building)}</div>` : ''}
          <div class="product">${esc(String(item.product_name).toUpperCase())}</div>
          <div class="weight">${esc(formatQty(item))}</div>
        </div>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Packing Labels</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #ddd; font-family: Arial, Helvetica, sans-serif; color: #000; }
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
    height: 2in;
    background: #fff;
    margin: 0 auto 8px;
    padding: 0.06in 0.1in;
    display: grid;
    grid-template-rows: auto auto auto 1fr auto;
    row-gap: 0.02in;
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-after: always;
    overflow: hidden;
    position: relative;
  }
  .label:last-child { page-break-after: auto; }
  .brand {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    text-align: center;
    border-bottom: 1px solid #000;
    padding-bottom: 1px;
  }
  .flat {
    font-size: 54px;
    font-weight: 900;
    text-align: center;
    line-height: 1;
    letter-spacing: 1px;
    word-break: break-word;
  }
  .building {
    font-size: 11px;
    font-weight: 700;
    text-align: center;
    line-height: 1.1;
    text-transform: uppercase;
  }
  .product {
    font-size: 22px;
    font-weight: 900;
    text-align: center;
    line-height: 1.05;
    word-break: break-word;
    align-self: end;
  }
  .weight {
    font-size: 18px;
    font-weight: 900;
    text-align: center;
    line-height: 1;
    border-top: 1px solid #000;
    padding-top: 2px;
  }
  .counter {
    position: absolute;
    top: 2px;
    right: 5px;
    font-size: 9px;
    font-weight: 700;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .label { margin: 0; }
    @page { size: 4in 2in; margin: 0; }
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