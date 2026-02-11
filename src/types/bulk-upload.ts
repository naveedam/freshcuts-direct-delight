export const SYSTEM_FIELDS = [
  { key: 'product_name', label: 'Product Name', required: true },
  { key: 'category', label: 'Category', required: true },
  { key: 'selling_price', label: 'Selling Price', required: true },
  { key: 'hsn_code', label: 'HSN Code', required: true },
  { key: 'gst_type', label: 'GST Type', required: true },
  { key: 'gst_rate', label: 'GST Rate', required: true },
  { key: 'sku', label: 'SKU', required: false },
  { key: 'brand', label: 'Brand', required: false },
  { key: 'description', label: 'Description', required: false },
  { key: 'mrp', label: 'MRP', required: false },
  { key: 'unit_type', label: 'Unit Type', required: false },
  { key: 'stock_quantity', label: 'Stock Quantity', required: false },
  { key: 'is_active', label: 'Is Active', required: false },
] as const;

export type SystemFieldKey = typeof SYSTEM_FIELDS[number]['key'];

export type ColumnMapping = Record<string, SystemFieldKey | 'ignore'>;

export interface ParsedRow {
  [key: string]: unknown;
}

export interface ValidationResult {
  rowIndex: number;
  mappedData: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

export interface ImportState {
  fileName: string;
  rawHeaders: string[];
  rawData: Record<string, unknown>[];
  columnMapping: ColumnMapping;
  validationResults: ValidationResult[];
  isImporting: boolean;
  importProgress: number;
  importLog: {
    successCount: number;
    failedCount: number;
    errors: { row: number; error: string }[];
  } | null;
}
