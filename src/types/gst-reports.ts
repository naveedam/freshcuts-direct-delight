// GST Report Types for GSTR-1 and GSTR-3B

export interface GSTR1Table4Row {
  rate: number;
  taxable_value: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

export interface GSTR1Table8Row {
  description: string;
  nil_rated: number;
  exempted: number;
  non_gst: number;
}

export interface GSTR1HSNRow {
  hsn_code: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  taxable_value: number;
  integrated_tax: number;
  central_tax: number;
  state_tax: number;
  cess: number;
}

export interface B2CSmallInvoice {
  place_of_supply: string;
  rate: number;
  taxable_value: number;
  cess: number;
  type: 'OE'; // OE for outward supplies
}

export interface GSTR1Data {
  gstin: string;
  return_period: string; // MMYYYY format
  table_4: GSTR1Table4Row[];
  table_8: GSTR1Table8Row[];
  hsn_summary: GSTR1HSNRow[];
  b2cs: B2CSmallInvoice[];
  total_invoices: number;
  total_value: number;
}

export interface GSTR3BTable31a {
  taxable_value: number;
  integrated_tax: number;
  central_tax: number;
  state_tax: number;
  cess: number;
}

export interface GSTR3BTable31c {
  nil_rated: number;
  exempted: number;
  non_gst: number;
}

export interface GSTR3BData {
  gstin: string;
  return_period: string;
  table_3_1_a: GSTR3BTable31a; // Taxable outward supplies
  table_3_1_c: GSTR3BTable31c; // Exempt/Nil supplies
  tax_payable: {
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
    total: number;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ReconciliationData {
  total_invoice_value: number;
  gstr1_total: number;
  gstr3b_total: number;
  difference: number;
  is_reconciled: boolean;
}

export interface MonthOption {
  value: string;
  label: string;
  month: number;
  year: number;
}

export interface InvoiceForReport {
  id: string;
  invoice_number: string | null;
  created_at: string;
  total_amount: number;
  is_igst: boolean;
  place_of_supply: string | null;
  items: InvoiceItemForReport[];
}

export interface InvoiceItemForReport {
  id: string;
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
