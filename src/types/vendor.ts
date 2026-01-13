export interface Vendor {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  gstin: string | null;
  pan_number: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  payment_terms: string | null;
  status: 'active' | 'inactive' | 'blacklisted';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorProduct {
  id: string;
  vendor_id: string;
  product_id: string;
  cost_price: number;
  is_preferred_vendor: boolean;
  lead_time_days: number;
  minimum_order_quantity: number;
  notes: string | null;
  created_at: string;
  product?: {
    id: string;
    name: string;
    category: string;
  };
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string;
  status: 'draft' | 'sent' | 'confirmed' | 'partially_received' | 'received' | 'cancelled';
  order_date: string;
  expected_delivery_date: string | null;
  received_date: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  payment_status: 'pending' | 'partial' | 'paid';
  paid_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  vendor?: Vendor;
  items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_cost: number;
  received_quantity: number;
  total_cost: number;
  created_at: string;
}

export interface VendorPayment {
  id: string;
  vendor_id: string;
  purchase_order_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'other';
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  vendor?: Vendor;
  purchase_order?: PurchaseOrder;
}

export interface VendorForm {
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  gstin: string;
  pan_number: string;
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  payment_terms: string;
  status: 'active' | 'inactive' | 'blacklisted';
  notes: string;
}

export const defaultVendorForm: VendorForm = {
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  state: '',
  postal_code: '',
  gstin: '',
  pan_number: '',
  bank_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  payment_terms: '30 days',
  status: 'active',
  notes: ''
};
