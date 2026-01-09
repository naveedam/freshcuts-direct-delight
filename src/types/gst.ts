// GST Types for Indian Tax Compliance

export type GSTType = 'exempt' | 'nil' | 'taxable';

export interface GSTConfig {
  id: string;
  category: string;
  hsn_code: string;
  description: string | null;
  default_gst_type: GSTType;
  default_gst_rate: number;
  is_configurable: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GSTLineItem {
  product_name: string;
  hsn_code: string | null;
  quantity: number;
  unit_price: number;
  line_value: number;
  gst_type: GSTType;
  gst_rate: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_with_tax: number;
}

export interface HSNSummary {
  hsn_code: string;
  description: string;
  quantity: number;
  taxable_value: number;
  cgst_rate: number;
  cgst_amount: number;
  sgst_rate: number;
  sgst_amount: number;
  igst_rate: number;
  igst_amount: number;
  total_tax: number;
}

export interface GSTSummary {
  total_taxable_value: number;
  total_exempt_value: number;
  total_nil_rated_value: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_tax: number;
  grand_total: number;
}

export interface InvoiceData {
  invoice_number: string | null;
  invoice_date: string;
  order_id: string;
  place_of_supply: string | null;
  is_igst: boolean;
  items: GSTLineItem[];
  hsn_summary: HSNSummary[];
  gst_summary: GSTSummary;
  business: BusinessInfo;
  customer: CustomerInfo;
}

export interface BusinessInfo {
  business_name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  state_code: string | null;
  state_name: string | null;
}

export interface CustomerInfo {
  name?: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
}

// HSN codes for common food categories
export const HSN_CODES = {
  // Meat
  BEEF_FRESH: '0201',
  BEEF_FROZEN: '0202',
  PORK: '0203',
  LAMB_MUTTON: '0204',
  POULTRY: '0207',
  
  // Seafood
  FISH_FRESH: '0302',
  FISH_FROZEN: '0303',
  CRUSTACEANS: '0306',
  
  // Fruits & Vegetables
  VEGETABLES: '0701',
  FRUITS: '0803',
  
  // Dairy
  MILK_FRESH: '0401',
  PANEER_CHEESE: '0406',
} as const;

// GST rates applicable in India
export const GST_RATES = [0, 5, 12, 18, 28] as const;

// State codes for India (for IGST determination)
export const INDIAN_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};
