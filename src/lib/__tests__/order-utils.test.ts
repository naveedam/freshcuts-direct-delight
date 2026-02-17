import { describe, it, expect } from 'vitest';
import {
  buildOrderItems,
  calculateAdminLineGST,
  buildAdminOrderItems,
  calculateAdminOrderTotal,
} from '@/lib/order-utils';
import type { CheckoutCartItem, AdminLineItem } from '@/lib/order-utils';

// ─── Customer checkout: buildOrderItems ─────────────────────────────

describe('buildOrderItems (customer checkout)', () => {
  const ORDER_ID = 'order-001';

  it('converts weight-based quantity from 500g units to kg', () => {
    const items: CheckoutCartItem[] = [
      {
        product: { id: 'p1', name: 'Chicken Breast', price: 600, pricingModel: 'weight_based' },
        quantity: 3, // 3 × 500g = 1.5kg
      },
    ];
    const rows = buildOrderItems(ORDER_ID, items);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(1.5);
    expect(rows[0].total_price).toBe(900); // 1.5kg × 600
    expect(rows[0].unit_price).toBe(600);
  });

  it('keeps unit-based quantity as-is', () => {
    const items: CheckoutCartItem[] = [
      {
        product: { id: 'p2', name: 'Sriracha Mayo', price: 250, pricingModel: 'unit_based' },
        quantity: 3,
      },
    ];
    const rows = buildOrderItems(ORDER_ID, items);
    expect(rows[0].quantity).toBe(3);
    expect(rows[0].total_price).toBe(750);
  });

  it('handles mixed cart (weight + unit) correctly', () => {
    const items: CheckoutCartItem[] = [
      {
        product: { id: 'p1', name: 'Lamb Leg', price: 800, pricingModel: 'weight_based' },
        quantity: 2, // 1kg
      },
      {
        product: { id: 'p2', name: 'Hot Sauce', price: 150, pricingModel: 'unit_based' },
        quantity: 2,
      },
    ];
    const rows = buildOrderItems(ORDER_ID, items);
    expect(rows).toHaveLength(2);

    // Lamb: 1kg × 800 = 800
    expect(rows[0].quantity).toBe(1);
    expect(rows[0].total_price).toBe(800);

    // Hot Sauce: 2 × 150 = 300
    expect(rows[1].quantity).toBe(2);
    expect(rows[1].total_price).toBe(300);

    const orderTotal = rows.reduce((s, r) => s + r.total_price, 0);
    expect(orderTotal).toBe(1100);
  });

  it('defaults to weight_based when pricingModel is undefined', () => {
    const items: CheckoutCartItem[] = [
      { product: { id: 'p1', name: 'Fish', price: 500 }, quantity: 2 },
    ];
    const rows = buildOrderItems(ORDER_ID, items);
    expect(rows[0].quantity).toBe(1); // 2 × 500g = 1kg
    expect(rows[0].total_price).toBe(500);
  });

  it('preserves product metadata (hsn, gst)', () => {
    const items: CheckoutCartItem[] = [
      {
        product: {
          id: 'p1', name: 'Paneer', price: 400,
          pricingModel: 'unit_based', hsn_code: '0406', gst_type: 'taxable', gst_rate: 12,
        },
        quantity: 1,
      },
    ];
    const rows = buildOrderItems('o1', items);
    expect(rows[0].hsn_code).toBe('0406');
    expect(rows[0].gst_type).toBe('taxable');
    expect(rows[0].gst_rate).toBe(12);
  });
});

// ─── Admin order: calculateAdminLineGST ─────────────────────────────

describe('calculateAdminLineGST', () => {
  const taxableItem: AdminLineItem = {
    product_id: 'p1', product_name: 'Chicken', quantity: 2, unit_price: 500,
    hsn_code: '0207', gst_type: 'Taxable', gst_rate: 5,
  };

  it('calculates CGST/SGST for intra-state taxable item', () => {
    const r = calculateAdminLineGST(taxableItem, false);
    expect(r.taxableValue).toBe(1000);
    expect(r.cgst).toBe(25);
    expect(r.sgst).toBe(25);
    expect(r.igst).toBe(0);
    expect(r.total).toBe(1050);
  });

  it('calculates IGST for inter-state taxable item', () => {
    const r = calculateAdminLineGST(taxableItem, true);
    expect(r.igst).toBe(50);
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
    expect(r.total).toBe(1050);
  });

  it('returns zero tax for Exempt item', () => {
    const exempt: AdminLineItem = {
      product_id: 'p2', product_name: 'Veg', quantity: 3, unit_price: 100,
      hsn_code: '0701', gst_type: 'Exempt', gst_rate: 0,
    };
    const r = calculateAdminLineGST(exempt, false);
    expect(r.cgst).toBe(0);
    expect(r.igst).toBe(0);
    expect(r.total).toBe(300);
  });

  it('returns zero tax for Nil-rated item', () => {
    const nil: AdminLineItem = {
      product_id: 'p3', product_name: 'Milk', quantity: 2, unit_price: 60,
      hsn_code: '0401', gst_type: 'Nil-rated', gst_rate: 0,
    };
    const r = calculateAdminLineGST(nil, true);
    expect(r.total).toBe(120);
    expect(r.igst).toBe(0);
  });

  it('handles 12% GST intra-state', () => {
    const item: AdminLineItem = {
      product_id: 'p4', product_name: 'Paneer', quantity: 1, unit_price: 400,
      hsn_code: '0406', gst_type: 'Taxable', gst_rate: 12,
    };
    const r = calculateAdminLineGST(item, false);
    expect(r.cgst).toBe(24);
    expect(r.sgst).toBe(24);
    expect(r.total).toBe(448);
  });

  it('handles 18% GST inter-state', () => {
    const item: AdminLineItem = {
      product_id: 'p5', product_name: 'Sauce', quantity: 1, unit_price: 200,
      hsn_code: '2103', gst_type: 'Taxable', gst_rate: 18,
    };
    const r = calculateAdminLineGST(item, true);
    expect(r.igst).toBe(36);
    expect(r.total).toBe(236);
  });
});

// ─── Admin order: buildAdminOrderItems ──────────────────────────────

describe('buildAdminOrderItems', () => {
  it('filters out empty-name items', () => {
    const items: AdminLineItem[] = [
      { product_id: null, product_name: '', quantity: 1, unit_price: 0, hsn_code: '', gst_type: 'Exempt', gst_rate: 0 },
      { product_id: 'p1', product_name: 'Chicken', quantity: 2, unit_price: 500, hsn_code: '0207', gst_type: 'Taxable', gst_rate: 5 },
    ];
    const rows = buildAdminOrderItems('o1', items, false);
    expect(rows).toHaveLength(1);
    expect(rows[0].product_name).toBe('Chicken');
  });

  it('populates GST columns correctly', () => {
    const items: AdminLineItem[] = [
      { product_id: 'p1', product_name: 'Chicken', quantity: 2, unit_price: 500, hsn_code: '0207', gst_type: 'Taxable', gst_rate: 5 },
    ];
    const rows = buildAdminOrderItems('o1', items, false);
    expect(rows[0].taxable_value).toBe(1000);
    expect(rows[0].cgst_amount).toBe(25);
    expect(rows[0].sgst_amount).toBe(25);
    expect(rows[0].igst_amount).toBe(0);
    expect(rows[0].total_price).toBe(1050);
  });
});

// ─── Admin order: calculateAdminOrderTotal ──────────────────────────

describe('calculateAdminOrderTotal', () => {
  it('totals a mixed-GST cart (Exempt + 5% + 12%) intra-state', () => {
    const items: AdminLineItem[] = [
      { product_id: 'p1', product_name: 'Vegetables', quantity: 2, unit_price: 100, hsn_code: '0701', gst_type: 'Exempt', gst_rate: 0 },
      { product_id: 'p2', product_name: 'Chicken', quantity: 1, unit_price: 1000, hsn_code: '0207', gst_type: 'Taxable', gst_rate: 5 },
      { product_id: 'p3', product_name: 'Paneer', quantity: 1, unit_price: 400, hsn_code: '0406', gst_type: 'Taxable', gst_rate: 12 },
    ];
    const t = calculateAdminOrderTotal(items, false);

    expect(t.taxableValue).toBe(1600); // 200 + 1000 + 400
    expect(t.cgst).toBe(25 + 24); // 50/2 + 48/2
    expect(t.sgst).toBe(25 + 24);
    expect(t.igst).toBe(0);
    expect(t.total).toBe(200 + 1050 + 448); // 1698
  });

  it('totals an IGST cart', () => {
    const items: AdminLineItem[] = [
      { product_id: 'p1', product_name: 'Chicken', quantity: 2, unit_price: 500, hsn_code: '0207', gst_type: 'Taxable', gst_rate: 5 },
    ];
    const t = calculateAdminOrderTotal(items, true);
    expect(t.igst).toBe(50);
    expect(t.cgst).toBe(0);
    expect(t.total).toBe(1050);
  });
});

// ─── End-to-end order total integrity ───────────────────────────────

describe('Order total integrity (E2E scenario)', () => {
  it('customer checkout: total matches sum of line item totals', () => {
    const items: CheckoutCartItem[] = [
      { product: { id: 'p1', name: 'Mutton', price: 1200, pricingModel: 'weight_based' }, quantity: 3 },  // 1.5kg × 1200 = 1800
      { product: { id: 'p2', name: 'Sardines Can', price: 180, pricingModel: 'unit_based' }, quantity: 4 }, // 4 × 180 = 720
      { product: { id: 'p3', name: 'Fresh Veg', price: 400, pricingModel: 'weight_based' }, quantity: 2 },  // 1kg × 400 = 400
    ];

    const rows = buildOrderItems('order-e2e', items);
    const lineTotal = rows.reduce((s, r) => s + r.total_price, 0);
    expect(lineTotal).toBe(2920);

    // Shipping logic
    const shippingThreshold = 2000;
    const shippingCost = lineTotal >= shippingThreshold ? 0 : 99;
    expect(shippingCost).toBe(0); // Free shipping (2920 > 2000)
    expect(lineTotal + shippingCost).toBe(2920);
  });

  it('admin order: total matches sum of line items with GST', () => {
    const items: AdminLineItem[] = [
      { product_id: 'p1', product_name: 'Mutton', quantity: 1.5, unit_price: 1200, hsn_code: '0204', gst_type: 'Exempt', gst_rate: 0 },
      { product_id: 'p2', product_name: 'Sriracha', quantity: 2, unit_price: 250, hsn_code: '2103', gst_type: 'Taxable', gst_rate: 18 },
    ];

    const rows = buildAdminOrderItems('order-admin', items, false);
    const lineTotal = rows.reduce((s, r) => s + r.total_price, 0);

    const totals = calculateAdminOrderTotal(items, false);
    expect(totals.total).toBe(lineTotal);

    // Verify individually: Mutton = 1800 (exempt), Sriracha = 500 + 90 = 590
    expect(totals.total).toBe(2390);
    expect(totals.cgst).toBe(45);
    expect(totals.sgst).toBe(45);
  });
});
