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

function gstLabel(gstType: string, gstRate: number): string {
  const nt = normalizeGst(gstType);
  if (nt === 'exempt') return 'Exempt';
  if (nt === 'nil') return 'NIL';
  return `${gstRate}%`;
}

/**
 * A Vyapar-style mobile-friendly invoice card layout designed
 * specifically for PNG image generation and WhatsApp sharing.
 * Rendered as pure inline-styled HTML so html-to-image captures it perfectly.
 */
const InvoiceShareView = forwardRef<HTMLDivElement, InvoiceShareViewProps>(
  ({ order, items, business }, ref) => {
    const invoiceNum = order.invoice_number || order.id.slice(0, 8).toUpperCase();
    const invoiceDate = new Date(order.created_at).toLocaleDateString('en-IN', {
      year: 'numeric', month: 'short', day: 'numeric',
    });

    // Compute totals from items
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
      return { ...item, displayQty: qty, lineValue, tax };
    });

    const discount = Number(order.discount_amount) || 0;
    const grandTotal = subtotal + totalTax - discount;
    const received = Number(order.amount_paid) || 0;
    const balance = grandTotal - received;

    // Delivery address
    const addressParts = [
      order.flat_number,
      order.building_name,
      order.shipping_city,
      order.shipping_postal_code,
    ].filter(Boolean);

    const s = {
      wrapper: {
        width: '420px',
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
        backgroundColor: '#ffffff',
        padding: '20px',
        fontSize: '13px',
        color: '#1f2937',
        lineHeight: '1.5',
      } as React.CSSProperties,
      header: {
        borderBottom: '2px solid #16a34a',
        paddingBottom: '14px',
        marginBottom: '16px',
      } as React.CSSProperties,
      bizName: {
        fontSize: '18px',
        fontWeight: 700,
        color: '#16a34a',
        margin: 0,
      } as React.CSSProperties,
      bizDetail: {
        fontSize: '11px',
        color: '#6b7280',
        margin: '2px 0',
      } as React.CSSProperties,
      titleRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '14px',
      } as React.CSSProperties,
      titleBadge: {
        fontSize: '14px',
        fontWeight: 700,
        color: '#1f2937',
        border: '2px solid #1f2937',
        padding: '4px 16px',
        borderRadius: '4px',
        letterSpacing: '1px',
      } as React.CSSProperties,
      invoiceMeta: {
        textAlign: 'right' as const,
        fontSize: '11px',
        color: '#6b7280',
      } as React.CSSProperties,
      invoiceMetaVal: {
        fontWeight: 600,
        color: '#1f2937',
      } as React.CSSProperties,
      billTo: {
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        padding: '12px 14px',
        marginBottom: '16px',
      } as React.CSSProperties,
      sectionLabel: {
        fontSize: '10px',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        color: '#16a34a',
        letterSpacing: '1px',
        marginBottom: '6px',
      } as React.CSSProperties,
      productCard: {
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        padding: '12px 14px',
        marginBottom: '8px',
      } as React.CSSProperties,
      productName: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#1f2937',
        marginBottom: '8px',
      } as React.CSSProperties,
      productGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '4px 16px',
        fontSize: '12px',
      } as React.CSSProperties,
      productLabel: {
        color: '#9ca3af',
        fontSize: '11px',
      } as React.CSSProperties,
      productValue: {
        fontWeight: 600,
        color: '#374151',
        textAlign: 'right' as const,
        fontSize: '12px',
      } as React.CSSProperties,
      pricingCard: {
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        padding: '14px',
        marginTop: '12px',
      } as React.CSSProperties,
      summaryRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '4px 0',
        fontSize: '12px',
      } as React.CSSProperties,
      totalRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '10px 12px',
        fontSize: '15px',
        fontWeight: 700,
        backgroundColor: '#16a34a',
        color: '#ffffff',
        borderRadius: '6px',
        marginTop: '8px',
      } as React.CSSProperties,
      balanceRow: {
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        fontSize: '12px',
        fontWeight: 600,
        color: balance > 0 ? '#dc2626' : '#16a34a',
      } as React.CSSProperties,
      footer: {
        marginTop: '16px',
        paddingTop: '12px',
        borderTop: '1px solid #e5e7eb',
      } as React.CSSProperties,
      footerText: {
        fontSize: '10px',
        color: '#9ca3af',
        lineHeight: '1.6',
      } as React.CSSProperties,
    };

    return (
      <div ref={ref} style={s.wrapper}>
        {/* HEADER */}
        <div style={s.header}>
          <p style={s.bizName}>{business.business_name}</p>
          {business.gstin && <p style={{ ...s.bizDetail, fontWeight: 600, color: '#374151' }}>GSTIN: {business.gstin}</p>}
          {business.phone && <p style={s.bizDetail}>📞 {business.phone}</p>}
          {business.address && <p style={s.bizDetail}>{business.address}</p>}
          {business.city && <p style={s.bizDetail}>{business.city}{business.postal_code ? ` – ${business.postal_code}` : ''}</p>}
        </div>

        {/* TITLE + INVOICE META */}
        <div style={s.titleRow}>
          <span style={s.titleBadge}>TAX INVOICE</span>
          <div style={s.invoiceMeta}>
            <p>Invoice: <span style={s.invoiceMetaVal}>{invoiceNum}</span></p>
            <p>Date: <span style={s.invoiceMetaVal}>{invoiceDate}</span></p>
          </div>
        </div>

        {/* BILL TO */}
        <div style={s.billTo}>
          <p style={s.sectionLabel}>Bill To / Deliver To</p>
          <p style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
            {order.flat_number && `${order.flat_number}, `}{order.building_name || ''}
          </p>
          {(order.shipping_city || order.shipping_postal_code) && (
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0' }}>
              {[order.shipping_city, order.shipping_postal_code].filter(Boolean).join(' – ')}
            </p>
          )}
        </div>

        {/* PRODUCT CARDS */}
        {processedItems.map((item, i) => (
          <div key={i} style={s.productCard}>
            <p style={s.productName}>{item.product_name}</p>
            <div style={s.productGrid}>
              <span style={s.productLabel}>Quantity</span>
              <span style={s.productValue}>{item.displayQty.toFixed(3)} kg</span>

              <span style={s.productLabel}>Price/kg</span>
              <span style={s.productValue}>{formatCurrency(item.unit_price)}</span>

              <span style={s.productLabel}>GST</span>
              <span style={s.productValue}>{gstLabel(item.gst_type, item.gst_rate)}</span>

              <span style={s.productLabel}>Amount</span>
              <span style={{ ...s.productValue, fontWeight: 700 }}>{formatCurrency(item.lineValue + item.tax)}</span>
            </div>
          </div>
        ))}

        {/* PRICING BREAKUP */}
        <div style={s.pricingCard}>
          <p style={s.sectionLabel}>Pricing Breakup</p>

          <div style={s.summaryRow}>
            <span>Sub Total</span>
            <span style={{ fontWeight: 600 }}>{formatCurrency(subtotal)}</span>
          </div>

          {totalTax > 0 && (
            <div style={s.summaryRow}>
              <span>Tax</span>
              <span style={{ fontWeight: 600 }}>{formatCurrency(totalTax)}</span>
            </div>
          )}

          {discount > 0 && (
            <div style={{ ...s.summaryRow, color: '#dc2626' }}>
              <span>Discount</span>
              <span style={{ fontWeight: 600 }}>-{formatCurrency(discount)}</span>
            </div>
          )}

          <div style={s.totalRow}>
            <span>Total Amount</span>
            <span>{formatCurrency(grandTotal)}</span>
          </div>

          <div style={{ ...s.summaryRow, marginTop: '8px' }}>
            <span>Received</span>
            <span style={{ fontWeight: 600 }}>{formatCurrency(received)}</span>
          </div>

          <div style={s.balanceRow}>
            <span>Balance</span>
            <span>{formatCurrency(Math.abs(balance))}</span>
          </div>
        </div>

        {/* FOOTER */}
        <div style={s.footer}>
          <p style={s.footerText}>
            Thank you for your business! This is a computer-generated invoice.
          </p>
          <p style={{ ...s.footerText, marginTop: '4px' }}>
            For queries, contact: {business.phone || business.email || business.business_name}
          </p>
        </div>
      </div>
    );
  }
);

InvoiceShareView.displayName = 'InvoiceShareView';
export default InvoiceShareView;
