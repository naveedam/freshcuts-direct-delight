import { forwardRef } from 'react';
import { formatCurrency } from '@/lib/currency';

interface ShareOrderItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  hsn_code: string | null;
  gst_type: string;
  gst_rate: number;
  actual_weight: number | null;
  billed_weight: number | null;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
}

interface ShareOrder {
  id: string;
  invoice_number: string | null;
  created_at: string;
  flat_number: string | null;
  building_name: string | null;
  shipping_city: string | null;
  shipping_postal_code: string | null;
  phone: string | null;
  customer_email: string | null;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  discount_amount: number | null;
  is_igst: boolean;
}

interface BusinessInfo {
  business_name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
}

interface InvoiceShareViewProps {
  order: ShareOrder;
  items: ShareOrderItem[];
  business: BusinessInfo;
}

function getDisplayQty(item: ShareOrderItem): number {
  if (item.billed_weight != null && item.billed_weight > 0) return item.billed_weight;
  if (item.actual_weight != null && item.actual_weight > 0) return item.actual_weight;
  return item.quantity;
}

function normalizeGst(raw: string): string {
  const l = String(raw || '').toLowerCase();
  return l === 'nil-rated' ? 'nil' : l;
}

const InvoiceShareView = forwardRef<HTMLDivElement, InvoiceShareViewProps>(
  ({ order, items, business }, ref) => {
    const invoiceNum = order.invoice_number || order.id.slice(0, 8).toUpperCase();
    const invoiceDate = new Date(order.created_at).toLocaleDateString('en-IN', {
      year: 'numeric', month: 'short', day: 'numeric',
    });

    // Process line items
    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    const processedItems = items.map((item, idx) => {
      const qty = getDisplayQty(item);
      const lineValue = qty * Number(item.unit_price);
      const nt = normalizeGst(item.gst_type);
      let taxAmt = 0;
      let cgst = 0, sgst = 0, igst = 0;
      if (nt === 'taxable' && Number(item.gst_rate) > 0) {
        taxAmt = (lineValue * Number(item.gst_rate)) / 100;
        if (order.is_igst) {
          igst = taxAmt;
        } else {
          cgst = taxAmt / 2;
          sgst = taxAmt / 2;
        }
      }
      subtotal += lineValue;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      return {
        ...item, sn: idx + 1, displayQty: qty, lineValue, taxAmt, cgst, sgst, igst,
        amount: lineValue + taxAmt,
      };
    });

    const totalTax = totalCgst + totalSgst + totalIgst;
    const discount = Number(order.discount_amount) || 0;
    const grandTotal = subtotal + totalTax - discount;
    const received = Number(order.amount_paid) || 0;
    const balance = grandTotal - received;

    // HSN summary
    const hsnMap = new Map<string, { hsn: string; taxable: number; cgst: number; sgst: number; igst: number; rate: number }>();
    processedItems.forEach(it => {
      const nt = normalizeGst(it.gst_type);
      if (nt !== 'taxable' || !it.hsn_code) return;
      const key = it.hsn_code;
      const existing = hsnMap.get(key) || { hsn: key, taxable: 0, cgst: 0, sgst: 0, igst: 0, rate: Number(it.gst_rate) };
      existing.taxable += it.lineValue;
      existing.cgst += it.cgst;
      existing.sgst += it.sgst;
      existing.igst += it.igst;
      hsnMap.set(key, existing);
    });
    const hsnRows = Array.from(hsnMap.values());

    const hasTax = totalTax > 0;
    const isIgst = order.is_igst;

    // Styles
    const font = "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";
    const green = '#16a34a';
    const gray100 = '#f3f4f6';
    const gray200 = '#e5e7eb';
    const gray400 = '#9ca3af';
    const gray500 = '#6b7280';
    const gray700 = '#374151';
    const gray900 = '#111827';

    const thStyle: React.CSSProperties = {
      padding: '5px 6px', fontWeight: 600, fontSize: '9px', color: gray500,
      textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: `1.5px solid ${gray200}`,
      whiteSpace: 'nowrap',
    };
    const tdStyle: React.CSSProperties = {
      padding: '5px 6px', fontSize: '11px', color: gray700, borderBottom: `1px solid ${gray100}`,
    };
    const tdRight: React.CSSProperties = { ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

    return (
      <div ref={ref} style={{
        width: '760px', fontFamily: font, backgroundColor: '#ffffff',
        padding: '24px 28px', fontSize: '11px', color: gray900, lineHeight: '1.45',
      }}>
        {/* HEADER ROW */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '10px', borderBottom: `2px solid ${green}`, marginBottom: '10px' }}>
          <div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: green, margin: 0 }}>{business.business_name}</p>
            {business.gstin && <p style={{ fontSize: '9px', color: gray700, margin: '2px 0 0', fontWeight: 600 }}>GSTIN: {business.gstin}</p>}
            <p style={{ fontSize: '9px', color: gray500, margin: '1px 0 0' }}>
              {[business.address, business.city, business.postal_code].filter(Boolean).join(', ')}
              {business.phone ? ` • ${business.phone}` : ''}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              fontSize: '10px', fontWeight: 700, color: gray900,
              border: `1.5px solid ${gray900}`, padding: '2px 10px',
              borderRadius: '2px', letterSpacing: '0.5px',
            }}>TAX INVOICE</span>
            <p style={{ fontSize: '9px', color: gray500, margin: '4px 0 0', lineHeight: '1.5' }}>
              No: <strong style={{ color: gray900 }}>{invoiceNum}</strong><br />
              Date: <strong style={{ color: gray900 }}>{invoiceDate}</strong>
            </p>
          </div>
        </div>

        {/* BILL TO — 2-column */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '10px' }}>
          <div style={{ flex: 1, backgroundColor: gray100, borderRadius: '4px', padding: '8px 10px' }}>
            <p style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: green, letterSpacing: '0.6px', margin: '0 0 3px' }}>Sold By</p>
            <p style={{ fontSize: '11px', fontWeight: 600, margin: 0 }}>{business.business_name}</p>
            <p style={{ fontSize: '9px', color: gray500, margin: '1px 0 0' }}>
              {[business.address, business.city, business.postal_code].filter(Boolean).join(', ')}
            </p>
          </div>
          <div style={{ flex: 1, backgroundColor: gray100, borderRadius: '4px', padding: '8px 10px' }}>
            <p style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: green, letterSpacing: '0.6px', margin: '0 0 3px' }}>Bill To / Deliver To</p>
            <p style={{ fontSize: '11px', fontWeight: 600, margin: 0 }}>
              {order.flat_number && `${order.flat_number}, `}{order.building_name || ''}
            </p>
            {(order.shipping_city || order.shipping_postal_code) && (
              <p style={{ fontSize: '9px', color: gray500, margin: '1px 0 0' }}>
                {[order.shipping_city, order.shipping_postal_code].filter(Boolean).join(' – ')}
              </p>
            )}
          </div>
        </div>

        {/* LINE ITEMS TABLE */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'center', width: '24px' }}>#</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>Product</th>
              <th style={{ ...thStyle, textAlign: 'left', width: '50px' }}>HSN</th>
              <th style={{ ...thStyle, textAlign: 'right', width: '56px' }}>Qty</th>
              <th style={{ ...thStyle, textAlign: 'right', width: '60px' }}>Rate</th>
              <th style={{ ...thStyle, textAlign: 'right', width: '68px' }}>Value</th>
              {hasTax && <th style={{ ...thStyle, textAlign: 'right', width: '46px' }}>GST%</th>}
              {hasTax && <th style={{ ...thStyle, textAlign: 'right', width: '60px' }}>Tax</th>}
              <th style={{ ...thStyle, textAlign: 'right', width: '72px' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {processedItems.map((item) => {
              const nt = normalizeGst(item.gst_type);
              return (
                <tr key={item.sn} style={{ pageBreakInside: 'avoid' }}>
                  <td style={{ ...tdStyle, textAlign: 'center', color: gray400, fontSize: '10px' }}>{item.sn}</td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: gray900 }}>{item.product_name}</td>
                  <td style={{ ...tdStyle, fontSize: '10px', color: gray500 }}>{item.hsn_code || '—'}</td>
                  <td style={tdRight}>{item.displayQty.toFixed(3)}</td>
                  <td style={tdRight}>{formatCurrency(item.unit_price)}</td>
                  <td style={tdRight}>{formatCurrency(item.lineValue)}</td>
                  {hasTax && <td style={tdRight}>{nt === 'taxable' ? `${item.gst_rate}%` : nt === 'exempt' ? 'Exm' : 'Nil'}</td>}
                  {hasTax && <td style={tdRight}>{formatCurrency(item.taxAmt)}</td>}
                  <td style={{ ...tdRight, fontWeight: 700, color: gray900 }}>{formatCurrency(item.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* INLINE SUMMARY ROW — 3-column grid */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          {/* HSN Summary (if taxable items exist) */}
          {hsnRows.length > 0 && (
            <div style={{ flex: 1, backgroundColor: gray100, borderRadius: '4px', padding: '8px 10px' }}>
              <p style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: green, letterSpacing: '0.5px', margin: '0 0 4px' }}>HSN Summary</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${gray200}` }}>
                    <th style={{ textAlign: 'left', padding: '2px 0', fontWeight: 600, color: gray500 }}>HSN</th>
                    <th style={{ textAlign: 'right', padding: '2px 0', fontWeight: 600, color: gray500 }}>Taxable</th>
                    {isIgst
                      ? <th style={{ textAlign: 'right', padding: '2px 0', fontWeight: 600, color: gray500 }}>IGST</th>
                      : <>
                          <th style={{ textAlign: 'right', padding: '2px 0', fontWeight: 600, color: gray500 }}>CGST</th>
                          <th style={{ textAlign: 'right', padding: '2px 0', fontWeight: 600, color: gray500 }}>SGST</th>
                        </>
                    }
                  </tr>
                </thead>
                <tbody>
                  {hsnRows.map(r => (
                    <tr key={r.hsn}>
                      <td style={{ padding: '2px 0', color: gray700 }}>{r.hsn}</td>
                      <td style={{ padding: '2px 0', textAlign: 'right', color: gray700 }}>{formatCurrency(r.taxable)}</td>
                      {isIgst
                        ? <td style={{ padding: '2px 0', textAlign: 'right', color: gray700 }}>{formatCurrency(r.igst)}</td>
                        : <>
                            <td style={{ padding: '2px 0', textAlign: 'right', color: gray700 }}>{formatCurrency(r.cgst)}</td>
                            <td style={{ padding: '2px 0', textAlign: 'right', color: gray700 }}>{formatCurrency(r.sgst)}</td>
                          </>
                      }
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tax Summary */}
          {hasTax && (
            <div style={{ flex: 1, backgroundColor: gray100, borderRadius: '4px', padding: '8px 10px' }}>
              <p style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: green, letterSpacing: '0.5px', margin: '0 0 4px' }}>Tax Breakup</p>
              <div style={{ fontSize: '10px' }}>
                {isIgst ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: gray700 }}>
                    <span>IGST</span><span style={{ fontWeight: 600 }}>{formatCurrency(totalIgst)}</span>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: gray700 }}>
                      <span>CGST</span><span style={{ fontWeight: 600 }}>{formatCurrency(totalCgst)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: gray700 }}>
                      <span>SGST</span><span style={{ fontWeight: 600 }}>{formatCurrency(totalSgst)}</span>
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0 0', borderTop: `1px solid ${gray200}`, marginTop: '2px', fontWeight: 700, color: gray900 }}>
                  <span>Total Tax</span><span>{formatCurrency(totalTax)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Invoice Total */}
          <div style={{ flex: 1, backgroundColor: gray100, borderRadius: '4px', padding: '8px 10px' }}>
            <p style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: green, letterSpacing: '0.5px', margin: '0 0 4px' }}>Invoice Total</p>
            <div style={{ fontSize: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: gray700 }}>
                <span>Sub Total</span><span style={{ fontWeight: 600 }}>{formatCurrency(subtotal)}</span>
              </div>
              {hasTax && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: gray700 }}>
                  <span>Tax</span><span style={{ fontWeight: 600 }}>{formatCurrency(totalTax)}</span>
                </div>
              )}
              {discount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#dc2626' }}>
                  <span>Discount</span><span style={{ fontWeight: 600 }}>-{formatCurrency(discount)}</span>
                </div>
              )}
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', padding: '5px 8px',
              fontSize: '12px', fontWeight: 700, backgroundColor: green, color: '#ffffff',
              borderRadius: '3px', marginTop: '4px',
            }}>
              <span>Total</span><span>{formatCurrency(grandTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0 0', fontSize: '10px', color: gray700, marginTop: '4px' }}>
              <span>Received</span><span style={{ fontWeight: 600 }}>{formatCurrency(received)}</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', padding: '2px 0',
              fontSize: '11px', fontWeight: 700, color: balance > 0 ? '#dc2626' : green,
            }}>
              <span>Balance</span><span>{formatCurrency(Math.abs(balance))}</span>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ paddingTop: '6px', borderTop: `1px solid ${gray200}` }}>
          <p style={{ fontSize: '8px', color: gray400, margin: 0, lineHeight: '1.5' }}>
            Thank you for your business! Computer-generated invoice.
            {business.phone && ` Queries: ${business.phone}`}
          </p>
        </div>
      </div>
    );
  }
);

InvoiceShareView.displayName = 'InvoiceShareView';
export default InvoiceShareView;
