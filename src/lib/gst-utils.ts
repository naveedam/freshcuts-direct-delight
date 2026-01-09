import type { GSTType, GSTLineItem, HSNSummary, GSTSummary } from '@/types/gst';

/**
 * Calculate GST for a single line item
 */
export function calculateLineItemGST(
  quantity: number,
  unitPrice: number,
  gstType: GSTType,
  gstRate: number,
  isIGST: boolean
): { taxableValue: number; cgst: number; sgst: number; igst: number } {
  const lineValue = quantity * unitPrice;
  
  // Exempt and NIL rated items have no tax
  if (gstType === 'exempt' || gstType === 'nil' || gstRate === 0) {
    return { taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
  }
  
  // For taxable items, calculate GST
  const taxableValue = lineValue;
  const totalGST = (taxableValue * gstRate) / 100;
  
  if (isIGST) {
    // Inter-state: full tax as IGST
    return { taxableValue, cgst: 0, sgst: 0, igst: totalGST };
  } else {
    // Intra-state: split 50/50 between CGST and SGST
    const halfGST = totalGST / 2;
    return { taxableValue, cgst: halfGST, sgst: halfGST, igst: 0 };
  }
}

/**
 * Build complete line item with GST calculations
 */
export function buildGSTLineItem(
  productName: string,
  hsnCode: string | null,
  quantity: number,
  unitPrice: number,
  gstType: GSTType,
  gstRate: number,
  isIGST: boolean
): GSTLineItem {
  const lineValue = quantity * unitPrice;
  const gst = calculateLineItemGST(quantity, unitPrice, gstType, gstRate, isIGST);
  const totalTax = gst.cgst + gst.sgst + gst.igst;
  
  return {
    product_name: productName,
    hsn_code: hsnCode,
    quantity,
    unit_price: unitPrice,
    line_value: lineValue,
    gst_type: gstType,
    gst_rate: gstRate,
    taxable_value: gst.taxableValue,
    cgst_amount: gst.cgst,
    sgst_amount: gst.sgst,
    igst_amount: gst.igst,
    total_with_tax: lineValue + totalTax,
  };
}

/**
 * Build HSN summary table from line items
 */
export function buildHSNSummary(items: GSTLineItem[], isIGST: boolean): HSNSummary[] {
  const hsnMap = new Map<string, HSNSummary>();
  
  items.forEach(item => {
    // Only include taxable items in HSN summary
    if (item.gst_type !== 'taxable') return;
    
    const hsnCode = item.hsn_code || 'N/A';
    const existing = hsnMap.get(hsnCode);
    
    if (existing) {
      existing.quantity += item.quantity;
      existing.taxable_value += item.taxable_value;
      existing.cgst_amount += item.cgst_amount;
      existing.sgst_amount += item.sgst_amount;
      existing.igst_amount += item.igst_amount;
      existing.total_tax = existing.cgst_amount + existing.sgst_amount + existing.igst_amount;
    } else {
      hsnMap.set(hsnCode, {
        hsn_code: hsnCode,
        description: item.product_name,
        quantity: item.quantity,
        taxable_value: item.taxable_value,
        cgst_rate: isIGST ? 0 : item.gst_rate / 2,
        cgst_amount: item.cgst_amount,
        sgst_rate: isIGST ? 0 : item.gst_rate / 2,
        sgst_amount: item.sgst_amount,
        igst_rate: isIGST ? item.gst_rate : 0,
        igst_amount: item.igst_amount,
        total_tax: item.cgst_amount + item.sgst_amount + item.igst_amount,
      });
    }
  });
  
  return Array.from(hsnMap.values());
}

/**
 * Calculate complete GST summary from line items
 */
export function calculateGSTSummary(items: GSTLineItem[]): GSTSummary {
  let totalTaxableValue = 0;
  let totalExemptValue = 0;
  let totalNilRatedValue = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;
  
  items.forEach(item => {
    if (item.gst_type === 'exempt') {
      totalExemptValue += item.line_value;
    } else if (item.gst_type === 'nil') {
      totalNilRatedValue += item.line_value;
    } else if (item.gst_type === 'taxable') {
      totalTaxableValue += item.taxable_value;
    }
    
    totalCGST += item.cgst_amount;
    totalSGST += item.sgst_amount;
    totalIGST += item.igst_amount;
  });
  
  const totalTax = totalCGST + totalSGST + totalIGST;
  const grandTotal = totalTaxableValue + totalExemptValue + totalNilRatedValue + totalTax;
  
  return {
    total_taxable_value: totalTaxableValue,
    total_exempt_value: totalExemptValue,
    total_nil_rated_value: totalNilRatedValue,
    total_cgst: totalCGST,
    total_sgst: totalSGST,
    total_igst: totalIGST,
    total_tax: totalTax,
    grand_total: grandTotal,
  };
}

/**
 * Format currency in Indian Rupees
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Get display label for GST type
 */
export function getGSTTypeLabel(gstType: GSTType, gstRate: number): string {
  if (gstType === 'exempt') return 'Exempt';
  if (gstType === 'nil') return 'NIL (0%)';
  return `${gstRate}%`;
}

/**
 * Get CSS class for GST type badge
 */
export function getGSTTypeClass(gstType: GSTType): string {
  switch (gstType) {
    case 'exempt':
      return 'bg-yellow-100 text-yellow-800';
    case 'nil':
      return 'bg-blue-100 text-blue-800';
    case 'taxable':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Determine if IGST applies based on state codes
 */
export function isInterState(sellerStateCode: string | null, buyerStateCode: string | null): boolean {
  if (!sellerStateCode || !buyerStateCode) return false;
  return sellerStateCode !== buyerStateCode;
}

/**
 * Extract state code from GSTIN (first 2 digits)
 */
export function getStateCodeFromGSTIN(gstin: string | null): string | null {
  if (!gstin || gstin.length < 2) return null;
  return gstin.substring(0, 2);
}
