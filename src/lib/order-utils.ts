import type { PricingModel } from '@/types/product';
import { calculatePrice, getTotalWeightKg } from '@/lib/weight-utils';

/**
 * Represents a cart item ready for checkout
 */
export interface CheckoutCartItem {
  product: {
    id: string;
    name: string;
    price: number;
    pricingModel?: PricingModel;
    hsn_code?: string | null;
    gst_type?: string;
    gst_rate?: number;
  };
  quantity: number;
}

/**
 * Shape of an order item row to be inserted into the database
 */
export interface OrderItemRow {
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  hsn_code: string | null;
  gst_type: string;
  gst_rate: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
}

/**
 * Build order item rows from cart items (customer checkout path).
 * Converts weight-based quantities from 500g units to kg for DB storage.
 */
export function buildOrderItems(
  orderId: string,
  cartItems: CheckoutCartItem[],
): OrderItemRow[] {
  return cartItems.map(({ product, quantity }) => {
    const pm = product.pricingModel || 'weight_based';
    const dbQuantity = pm === 'weight_based' ? getTotalWeightKg(quantity) : quantity;
    const totalPrice = calculatePrice(product.price, quantity, pm);

    return {
      order_id: orderId,
      product_id: product.id,
      product_name: product.name,
      quantity: dbQuantity,
      unit_price: product.price,
      total_price: totalPrice,
      hsn_code: product.hsn_code || null,
      gst_type: product.gst_type || 'exempt',
      gst_rate: product.gst_rate || 0,
      taxable_value: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
    };
  });
}

/**
 * Admin order line item input
 */
export interface AdminLineItem {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  hsn_code: string;
  gst_type: string;
  gst_rate: number;
}

/**
 * Calculate GST for a single admin order line item.
 */
export function calculateAdminLineGST(
  item: AdminLineItem,
  isIGST: boolean,
): { taxableValue: number; cgst: number; sgst: number; igst: number; total: number } {
  const taxableValue = item.quantity * item.unit_price;

  if (item.gst_type === 'Exempt' || item.gst_type === 'Nil-rated') {
    return { taxableValue, cgst: 0, sgst: 0, igst: 0, total: taxableValue };
  }

  const gstAmount = (taxableValue * item.gst_rate) / 100;

  if (isIGST) {
    return { taxableValue, cgst: 0, sgst: 0, igst: gstAmount, total: taxableValue + gstAmount };
  }
  const halfGst = gstAmount / 2;
  return { taxableValue, cgst: halfGst, sgst: halfGst, igst: 0, total: taxableValue + gstAmount };
}

/**
 * Build order item rows from admin-entered line items (admin order creation path).
 */
export function buildAdminOrderItems(
  orderId: string,
  lineItems: AdminLineItem[],
  isIGST: boolean,
): OrderItemRow[] {
  return lineItems
    .filter(item => item.product_name)
    .map(item => {
      const gst = calculateAdminLineGST(item, isIGST);
      return {
        order_id: orderId,
        product_id: item.product_id || '',
        product_name: item.product_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: gst.total,
        hsn_code: item.hsn_code || null,
        gst_type: item.gst_type,
        gst_rate: item.gst_rate,
        taxable_value: gst.taxableValue,
        cgst_amount: gst.cgst,
        sgst_amount: gst.sgst,
        igst_amount: gst.igst,
      };
    });
}

/**
 * Calculate order total from admin line items.
 */
export function calculateAdminOrderTotal(
  lineItems: AdminLineItem[],
  isIGST: boolean,
): { taxableValue: number; cgst: number; sgst: number; igst: number; total: number } {
  return lineItems.reduce(
    (acc, item) => {
      const gst = calculateAdminLineGST(item, isIGST);
      return {
        taxableValue: acc.taxableValue + gst.taxableValue,
        cgst: acc.cgst + gst.cgst,
        sgst: acc.sgst + gst.sgst,
        igst: acc.igst + gst.igst,
        total: acc.total + gst.total,
      };
    },
    { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
  );
}
