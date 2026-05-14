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

function formatQty(item: any, pricingModel: string | null): string {
  const actual = Number(item.actual_weight) || 0
  const billed = Number(item.billed_weight) || 0
  const qty = Number(item.quantity) || 0
  const isUnit = pricingModel === 'unit_based'
  if (isUnit) {
    return `${qty} ${qty === 1 ? 'unit' : 'units'}`
  }
  // weight-based: prefer actual, then billed, else quantity*0.5kg
  const kg = actual > 0 ? actual : billed > 0 ? billed : qty * 0.5
  if (kg >= 1) return `${kg.toFixed(3)} kg`
  return `${Math.round(kg * 1000)} g`
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

    const { orderId, size } = await req.json()
    if (!orderId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      return new Response(JSON.stringify({ error: 'Invalid order ID' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    const labelSize = size === '3x2' ? '3x2' : '4x6'

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

    const productIds = Array.from(new Set(items.map((i: any) => i.product_id).filter(Boolean)))
    const productPricing: Record<string, string | null> = {}
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products').select('id, pricing_model').in('id', productIds)
      for (const p of products || []) productPricing[p.id] = (p as any).pricing_model
    }

    const orderRef = order.invoice_number || `#${order.id.slice(0, 6).toUpperCase()}`
    const flat = order.flat_number || ''
    const building = order.building_name || ''
    const packDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

    const dims = labelSize === '3x2'
      ? { w: '3in', h: '2in', brand: '11px', flat: '22px', bldg: '11px', prod: '15px', qty: '20px', meta: '8px', pad: '8px' }
      : { w: '4in', h: '6in', brand: '14px', flat: '42px', bldg: '16px', prod: '26px', qty: '38px', meta: '10px', pad: '16px' }

    const labelsHtml = items.map((item: any, idx: number) => {
      const qtyStr = formatQty(item, productPricing[item.product_id || ''] || null)
      return `
        <div class="label">
          <div class="brand">Fresh Cuts Daily</div>
          <div class="flat">${esc(flat) || '—'}</div>
          <div class="bldg">${esc(building) || ''}</div>
          <div class="divider"></div>
          <div class="product">${esc(item.product_name)}</div>
          <div class="qty">${esc(qtyStr)}</div>
          <div class="meta">
            <span>${esc(orderRef)}</span>
            <span>${esc(packDate)}</span>
            <span>${idx + 1}/${items.length}</span>
          </div>
        </div>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Packing Labels - ${esc(orderRef)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #f0f0f0; font-family: 'Helvetica Neue', Arial, sans-serif; color: #000; }
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
    width: ${dims.w};
    height: ${dims.h};
    background: #fff;
    border: 1px solid #000;
    margin: 0 auto 12px;
    padding: ${dims.pad};
    display: flex;
    flex-direction: column;
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-after: always;
    overflow: hidden;
  }
  .label:last-child { page-break-after: auto; }
  .brand {
    font-size: ${dims.brand};
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    text-align: center;
    border-bottom: 1px solid #000;
    padding-bottom: 4px;
  }
  .flat {
    font-size: ${dims.flat};
    font-weight: 900;
    text-align: center;
    line-height: 1.1;
    margin-top: 6px;
    letter-spacing: 1px;
  }
  .bldg {
    font-size: ${dims.bldg};
    font-weight: 600;
    text-align: center;
    margin-top: 2px;
    text-transform: uppercase;
  }
  .divider {
    border-top: 2px dashed #000;
    margin: 8px 0;
  }
  .product {
    font-size: ${dims.prod};
    font-weight: 700;
    text-align: center;
    line-height: 1.2;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .qty {
    font-size: ${dims.qty};
    font-weight: 900;
    text-align: center;
    border: 2px solid #000;
    padding: 4px;
    margin-top: 4px;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    font-size: ${dims.meta};
    margin-top: 6px;
    color: #000;
    font-weight: 500;
  }
  @media print {
    body { background: #fff; padding: 0; }
    .toolbar { display: none; }
    .label { border: none; margin: 0; }
    @page { size: ${dims.w} ${dims.h}; margin: 0; }
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