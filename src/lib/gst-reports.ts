import type {
  GSTR1Data,
  GSTR1Table4Row,
  GSTR1Table8Row,
  GSTR1HSNRow,
  B2CSmallInvoice,
  GSTR3BData,
  ValidationResult,
  ReconciliationData,
  InvoiceForReport,
  MonthOption,
} from '@/types/gst-reports';

/**
 * Generate last 12 months for month selector
 */
export function generateMonthOptions(): MonthOption[] {
  const options: MonthOption[] = [];
  const now = new Date();
  
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    
    options.push({
      value: `${month.toString().padStart(2, '0')}${year}`,
      label: date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      month,
      year,
    });
  }
  
  return options;
}

/**
 * Generate GSTR-1 data from invoices
 */
export function generateGSTR1(
  invoices: InvoiceForReport[],
  gstin: string,
  returnPeriod: string
): GSTR1Data {
  // Table 4: Taxable outward supplies grouped by rate
  const table4Map = new Map<number, GSTR1Table4Row>();
  
  // Table 8: Nil-rated / Exempt / Non-GST supplies
  const table8: GSTR1Table8Row = {
    description: 'Supplies to Registered/Unregistered Persons',
    nil_rated: 0,
    exempted: 0,
    non_gst: 0,
  };
  
  // HSN Summary
  const hsnMap = new Map<string, GSTR1HSNRow>();
  
  // B2CS aggregation by place of supply and rate
  const b2csMap = new Map<string, B2CSmallInvoice>();
  
  let totalValue = 0;
  
  invoices.forEach(invoice => {
    // CRITICAL: Scale per-item values so that the sum equals the FINAL posted
    // invoice total (after weight adjustments, discounts, edits, regeneration).
    // Without this, GSTR-1 reflects pre-adjustment raw item rows and overstates
    // turnover vs. the Invoice Register.
    const rawItemSum = invoice.items.reduce((s, i) => s + Number(i.total_price || 0), 0);
    const finalTotal = Number(invoice.total_amount || 0);
    const scale = rawItemSum > 0 && finalTotal > 0 ? finalTotal / rawItemSum : 1;

    invoice.items.forEach(rawItem => {
      const item = scaleItem(rawItem, scale);
      totalValue += item.total_price;
      
      if (item.gst_type === 'nil') {
        table8.nil_rated += item.total_price;
      } else if (item.gst_type === 'exempt') {
        table8.exempted += item.total_price;
      } else if (item.gst_type === 'taxable') {
        // Table 4: Group by rate
        const rate = item.gst_rate;
        const existing = table4Map.get(rate);
        
        if (existing) {
          existing.taxable_value += item.taxable_value;
          existing.cgst += item.cgst_amount;
          existing.sgst += item.sgst_amount;
          existing.igst += item.igst_amount;
        } else {
          table4Map.set(rate, {
            rate,
            taxable_value: item.taxable_value,
            cgst: item.cgst_amount,
            sgst: item.sgst_amount,
            igst: item.igst_amount,
            cess: 0,
          });
        }
        
        // HSN Summary
        const hsnCode = item.hsn_code || 'N/A';
        const hsnKey = `${hsnCode}_${rate}`;
        const existingHSN = hsnMap.get(hsnKey);
        
        if (existingHSN) {
          existingHSN.quantity += item.quantity;
          existingHSN.taxable_value += item.taxable_value;
          existingHSN.integrated_tax += item.igst_amount;
          existingHSN.central_tax += item.cgst_amount;
          existingHSN.state_tax += item.sgst_amount;
        } else {
          hsnMap.set(hsnKey, {
            hsn_code: hsnCode,
            description: item.product_name,
            quantity: item.quantity,
            unit: 'NOS',
            rate,
            taxable_value: item.taxable_value,
            integrated_tax: item.igst_amount,
            central_tax: item.cgst_amount,
            state_tax: item.sgst_amount,
            cess: 0,
          });
        }
        
        // B2CS aggregation
        const pos = invoice.place_of_supply || 'Unknown';
        const b2csKey = `${pos}_${rate}`;
        const existingB2CS = b2csMap.get(b2csKey);
        
        if (existingB2CS) {
          existingB2CS.taxable_value += item.taxable_value;
        } else {
          b2csMap.set(b2csKey, {
            place_of_supply: pos,
            rate,
            taxable_value: item.taxable_value,
            cess: 0,
            type: 'OE',
          });
        }
      }
    });
  });
  
  return {
    gstin,
    return_period: returnPeriod,
    table_4: Array.from(table4Map.values()).sort((a, b) => a.rate - b.rate),
    table_8: [table8],
    hsn_summary: Array.from(hsnMap.values()).sort((a, b) => a.hsn_code.localeCompare(b.hsn_code)),
    b2cs: Array.from(b2csMap.values()),
    total_invoices: invoices.length,
    total_value: totalValue,
  };
}

/**
 * Scale a single item's monetary fields by a factor.
 * Used to project raw order_item rows onto the FINAL posted invoice value
 * so GSTR-1 / GSTR-3B totals match orders.total_amount exactly.
 */
function scaleItem(item: InvoiceItemForReport, scale: number): InvoiceItemForReport {
  if (scale === 1) return item;
  return {
    ...item,
    total_price: +(Number(item.total_price || 0) * scale).toFixed(2),
    taxable_value: +(Number(item.taxable_value || 0) * scale).toFixed(2),
    cgst_amount: +(Number(item.cgst_amount || 0) * scale).toFixed(2),
    sgst_amount: +(Number(item.sgst_amount || 0) * scale).toFixed(2),
    igst_amount: +(Number(item.igst_amount || 0) * scale).toFixed(2),
  };
}

/**
 * Generate GSTR-3B data from invoices
 */
export function generateGSTR3B(
  invoices: InvoiceForReport[],
  gstin: string,
  returnPeriod: string
): GSTR3BData {
  const table31a: GSTR3BData['table_3_1_a'] = {
    taxable_value: 0,
    integrated_tax: 0,
    central_tax: 0,
    state_tax: 0,
    cess: 0,
  };
  
  const table31c: GSTR3BData['table_3_1_c'] = {
    nil_rated: 0,
    exempted: 0,
    non_gst: 0,
  };
  
  invoices.forEach(invoice => {
    const rawItemSum = invoice.items.reduce((s, i) => s + Number(i.total_price || 0), 0);
    const finalTotal = Number(invoice.total_amount || 0);
    const scale = rawItemSum > 0 && finalTotal > 0 ? finalTotal / rawItemSum : 1;

    invoice.items.forEach(rawItem => {
      const item = scaleItem(rawItem, scale);
      if (item.gst_type === 'nil') {
        table31c.nil_rated += item.total_price;
      } else if (item.gst_type === 'exempt') {
        table31c.exempted += item.total_price;
      } else if (item.gst_type === 'taxable') {
        table31a.taxable_value += item.taxable_value;
        table31a.integrated_tax += item.igst_amount;
        table31a.central_tax += item.cgst_amount;
        table31a.state_tax += item.sgst_amount;
      }
    });
  });
  
  return {
    gstin,
    return_period: returnPeriod,
    table_3_1_a: table31a,
    table_3_1_c: table31c,
    tax_payable: {
      igst: table31a.integrated_tax,
      cgst: table31a.central_tax,
      sgst: table31a.state_tax,
      cess: 0,
      total: table31a.integrated_tax + table31a.central_tax + table31a.state_tax,
    },
  };
}

/**
 * Validate GSTR-1 data
 */
export function validateGSTR1(data: GSTR1Data): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check GSTIN
  if (!data.gstin || data.gstin.length !== 15) {
    errors.push('Invalid GSTIN format');
  }
  
  // Check for tax breakup when taxable value exists
  data.table_4.forEach(row => {
    if (row.taxable_value > 0 && row.cgst === 0 && row.sgst === 0 && row.igst === 0) {
      errors.push(`Tax breakup missing for ${row.rate}% rate supplies`);
    }
  });
  
  // Check for consistency
  const totalTable4Tax = data.table_4.reduce((sum, r) => sum + r.cgst + r.sgst + r.igst, 0);
  const hsnTotalTax = data.hsn_summary.reduce((sum, r) => sum + r.central_tax + r.state_tax + r.integrated_tax, 0);
  
  if (Math.abs(totalTable4Tax - hsnTotalTax) > 1) {
    warnings.push(`Table 4 tax (₹${totalTable4Tax.toFixed(2)}) doesn't match HSN summary (₹${hsnTotalTax.toFixed(2)})`);
  }
  
  // Check if all exempt
  const hasExempt = data.table_8.some(r => r.nil_rated > 0 || r.exempted > 0);
  const hasTaxable = data.table_4.some(r => r.taxable_value > 0);
  
  if (hasExempt && !hasTaxable) {
    const table4Total = data.table_4.reduce((sum, r) => sum + r.taxable_value, 0);
    if (table4Total !== 0) {
      errors.push('All supplies are exempt but taxable value is not zero');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate GSTR-3B data
 */
export function validateGSTR3B(data: GSTR3BData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check GSTIN
  if (!data.gstin || data.gstin.length !== 15) {
    errors.push('Invalid GSTIN format');
  }
  
  // Check tax payable matches calculated values
  const calculatedTotal = data.table_3_1_a.integrated_tax + data.table_3_1_a.central_tax + data.table_3_1_a.state_tax;
  if (Math.abs(calculatedTotal - data.tax_payable.total) > 0.01) {
    errors.push('Tax payable doesn\'t match calculated tax amounts');
  }
  
  // Check for tax leakage
  if (data.tax_payable.total > 0 && data.table_3_1_a.taxable_value === 0) {
    errors.push('Tax payable exists but no taxable supplies');
  }
  
  // Check for consistent IGST/CGST-SGST
  if (data.table_3_1_a.integrated_tax > 0 && (data.table_3_1_a.central_tax > 0 || data.table_3_1_a.state_tax > 0)) {
    warnings.push('Both IGST and CGST/SGST present - verify place of supply');
  }
  
  // If all exempt, taxable should be zero
  if ((data.table_3_1_c.nil_rated + data.table_3_1_c.exempted) > 0 && data.table_3_1_a.taxable_value === 0) {
    if (data.tax_payable.total !== 0) {
      errors.push('All supplies are exempt/nil but tax payable is not zero');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Reconcile invoice totals with GSTR totals
 */
export function reconcileData(
  invoices: InvoiceForReport[],
  gstr1: GSTR1Data,
  gstr3b: GSTR3BData
): ReconciliationData {
  const totalInvoiceValue = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
  
  const gstr1Total = gstr1.table_4.reduce((sum, r) => sum + r.taxable_value + r.cgst + r.sgst + r.igst, 0) +
    gstr1.table_8.reduce((sum, r) => sum + r.nil_rated + r.exempted + r.non_gst, 0);
  
  const gstr3bTotal = gstr3b.table_3_1_a.taxable_value + gstr3b.table_3_1_a.integrated_tax + 
    gstr3b.table_3_1_a.central_tax + gstr3b.table_3_1_a.state_tax +
    gstr3b.table_3_1_c.nil_rated + gstr3b.table_3_1_c.exempted + gstr3b.table_3_1_c.non_gst;
  
  const difference = Math.abs(totalInvoiceValue - gstr1Total);
  
  return {
    total_invoice_value: totalInvoiceValue,
    gstr1_total: gstr1Total,
    gstr3b_total: gstr3bTotal,
    difference,
    is_reconciled: difference < 1, // Allow 1 rupee tolerance for rounding
  };
}

/**
 * Export GSTR-1 as GSTN compatible JSON
 */
export function exportGSTR1AsJSON(data: GSTR1Data): string {
  const gstnFormat = {
    gstin: data.gstin,
    fp: data.return_period,
    b2cs: data.b2cs.map(item => ({
      sply_ty: 'INTRA',
      pos: item.place_of_supply.substring(0, 2),
      rt: item.rate,
      txval: Number(item.taxable_value.toFixed(2)),
      csamt: item.cess,
      typ: item.type,
    })),
    hsn: {
      data: data.hsn_summary.map(item => ({
        hsn_sc: item.hsn_code,
        desc: item.description,
        uqc: item.unit,
        qty: item.quantity,
        val: Number(item.taxable_value.toFixed(2)),
        txval: Number(item.taxable_value.toFixed(2)),
        iamt: Number(item.integrated_tax.toFixed(2)),
        camt: Number(item.central_tax.toFixed(2)),
        samt: Number(item.state_tax.toFixed(2)),
        csamt: item.cess,
      })),
    },
    nil: {
      inv: data.table_8.map(item => ({
        sply_ty: 'INTRB2C',
        nil_amt: Number(item.nil_rated.toFixed(2)),
        expt_amt: Number(item.exempted.toFixed(2)),
        ngsup_amt: Number(item.non_gst.toFixed(2)),
      })),
    },
  };
  
  return JSON.stringify(gstnFormat, null, 2);
}

/**
 * Export GSTR-3B as GSTN compatible JSON
 */
export function exportGSTR3BAsJSON(data: GSTR3BData): string {
  const gstnFormat = {
    gstin: data.gstin,
    ret_period: data.return_period,
    sup_details: {
      osup_det: {
        txval: Number(data.table_3_1_a.taxable_value.toFixed(2)),
        iamt: Number(data.table_3_1_a.integrated_tax.toFixed(2)),
        camt: Number(data.table_3_1_a.central_tax.toFixed(2)),
        samt: Number(data.table_3_1_a.state_tax.toFixed(2)),
        csamt: data.table_3_1_a.cess,
      },
      osup_nil_exmp: {
        nil_amt: Number(data.table_3_1_c.nil_rated.toFixed(2)),
        expt_amt: Number(data.table_3_1_c.exempted.toFixed(2)),
        ngsup_amt: Number(data.table_3_1_c.non_gst.toFixed(2)),
      },
    },
  };
  
  return JSON.stringify(gstnFormat, null, 2);
}
