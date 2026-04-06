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

    let subtotal = 0;
    let totalTax = 0;
    const processedItems = items.map(item => {
      const qty = getDisplayQty(item);
      const lineValue = qty * Number(item.unit_price);
      const nt = normalizeGst(item.gst_type);
      let tax = 0;
      if (nt === 'taxable' && Number(item.gst_rate) > 0) {
        tax = (lineValue * Number(item.gst_rate)) / 100;
      }
      subtotal += lineValue;
      totalTax += tax;
      return { ...item, displayQty: qty, lineValue, tax, amount: lineValue + tax };
    });

    const discount = Number(order.discount_amount) || 0;
    const grandTotal = subtotal + totalTax - discount;
    const received = Number(order.amount_paid) || 0;
    const balance = grandTotal - received;

    const font = "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";
    const green = '#16a34a';
    const gray50 = '#f9fafb';
    const gray200 = '#e5e7eb';
    const gray400 = '#9ca3af';
    const gray500 = '#6b7280';
    const gray700 = '#374151';
    const gray900 = '#111827';

    return (
      <div ref={ref} style={{
        width: '420px', fontFamily: font, backgroundColor: '#ffffff',
        padding: '20px', fontSize: '12px', color: gray900, lineHeight: '1.5',
      }}>
        {/* HEADER */}
        <div style={{ borderBottom: `2px solid ${green}`, paddingBottom: '12px', marginBottom: '14px' }}>
          <p style={{ fontSize: '17px', fontWeight: 700, color: green, margin: 0 }}>
            {business.business_name}
          </p>
          {business.gstin && (
            <p style={{ fontSize: '10px', color: gray700, margin: '2px 0 0', fontWeight: 600 }}>
              GSTIN: {business.gstin}
            </p>
          )}
          <p style={{ fontSize: '10px', color: gray500, margin: '1px 0 0' }}>
            {[business.address, business.city, business.postal_code].filter(Boolean).join(', ')}
            {business.phone ? ` • ${business.phone}` : ''}
          </p>
        </div>

        {/* TITLE + META ROW */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{
            fontSize: '12px', fontWeight: 700, color: gray900,
            border: `1.5px solid ${gray900}`, padding: '3px 12px',
            borderRadius: '3px', letterSpacing: '0.5px',
          }}>
            TAX INVOICE
          </span>
          <div style={{ textAlign: 'right', fontSize: '10px', color: gray500, lineHeight: '1.6' }}>
            <span>No: <strong style={{ color: gray900 }}>{invoiceNum}</strong></span><br />
            <span>Date: <strong style={{ color: gray900 }}>{invoiceDate}</strong></span>
          </div>
        </div>

        {/* BILL TO */}
        <div style={{ backgroundColor: gray50, borderRadius: '6px', padding: '10px 12px', marginBottom: '14px' }}>
          <p style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', color: green, letterSpacing: '0.8px', margin: '0 0 4px' }}>
            Bill To / Deliver To
          </p>
          <p style={{ fontSize: '13px', fontWeight: 700, margin: 0, color: gray900 }}>
            {order.flat_number && `${order.flat_number}, `}{order.building_name || ''}
          </p>
          {(order.shipping_city || order.shipping_postal_code) && (
            <p style={{ fontSize: '11px', color: gray500, margin: '1px 0 0' }}>
              {[order.shipping_city, order.shipping_postal_code].filter(Boolean).join(' – ')}
            </p>
          )}
        </div>

        {/* LINE ITEMS TABLE */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '11px' }}>
          <thead>
            <tr style={{ borderBottom: `1.5px solid ${gray200}` }}>
              <th style={{ textAlign: 'left', padding: '6px 0', fontWeight: 600, color: gray500, fontSize: '10px' }}>
                Item
              </th>
              <th style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 600, color: gray500, fontSize: '10px' }}>
                Qty
              </th>
              <th style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 600, color: gray500, fontSize: '10px' }}>
                Rate
              </th>
              <th style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600, color: gray500, fontSize: '10px' }}>
                Amt
              </th>
            </tr>
          </thead>
          <tbody>
            {processedItems.map((item, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${i < processedItems.length - 1 ? '#f3f4f6' : gray200}` }}>
                <td style={{ padding: '7px 0', fontWeight: 600, color: gray900 }}>
                  {item.product_name}
                </td>
                <td style={{ padding: '7px 4px', textAlign: 'right', color: gray700 }}>
                  {item.displayQty.toFixed(3)}
                </td>
                <td style={{ padding: '7px 4px', textAlign: 'right', color: gray700 }}>
                  {formatCurrency(item.unit_price)}
                </td>
                <td style={{ padding: '7px 0', textAlign: 'right', fontWeight: 700, color: gray900 }}>
                  {formatCurrency(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* PRICING SUMMARY */}
        <div style={{ backgroundColor: gray50, borderRadius: '6px', padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '11px', color: gray700 }}>
            <span>Sub Total</span>
            <span style={{ fontWeight: 600 }}>{formatCurrency(subtotal)}</span>
          </div>

          {totalTax > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '11px', color: gray700 }}>
              <span>Tax</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(totalTax)}</span>
            </div>
          )}

          {discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '11px', color: '#dc2626' }}>
              <span>Discount</span>
              <span style={{ fontWeight: 600 }}>-{formatCurrency(discount)}</span>
            </div>
          )}

          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '8px 10px',
            fontSize: '14px', fontWeight: 700, backgroundColor: green, color: '#ffffff',
            borderRadius: '5px', marginTop: '6px',
          }}>
            <span>Total</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '11px', color: gray700, marginTop: '6px' }}>
            <span>Received</span>
            <span style={{ fontWeight: 600 }}>{formatCurrency(received)}</span>
          </div>

          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '4px 0',
            fontSize: '12px', fontWeight: 700, color: balance > 0 ? '#dc2626' : green,
          }}>
            <span>Balance</span>
            <span>{formatCurrency(Math.abs(balance))}</span>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: `1px solid ${gray200}` }}>
          <p style={{ fontSize: '9px', color: gray400, margin: 0, lineHeight: '1.6' }}>
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
