// Products and order lines store GST type in lowercase ('exempt' | 'nil' | 'taxable');
// the order forms' dropdown uses display labels. Convert at the boundary so a picked
// product never leaves the GST field blank.
export type GstTypeUi = 'Exempt' | 'Nil-rated' | 'Taxable';

export function gstTypeToUi(t: string | null | undefined): GstTypeUi {
  const v = (t || '').trim().toLowerCase();
  if (v === 'nil' || v === 'nil-rated' || v === 'nil rated') return 'Nil-rated';
  if (v === 'taxable') return 'Taxable';
  return 'Exempt';
}

export function gstTypeToDb(t: string | null | undefined): 'exempt' | 'nil' | 'taxable' {
  const ui = gstTypeToUi(t);
  return ui === 'Nil-rated' ? 'nil' : ui === 'Taxable' ? 'taxable' : 'exempt';
}

// GST for an order line: the product's category setting (Rate Management → Categories), so meat
// and fish come out Exempt without per-product upkeep. A product explicitly marked Taxable
// (e.g. a frozen, pre-packed and labelled pack) keeps its own rate.
export function resolveGst(
  product: { category?: string | null; category_id?: string | null; gst_type?: string | null; gst_rate?: number | null; hsn_code?: string | null },
  categories: { id: string; slug?: string | null; name?: string | null; gst_type?: string | null; gst_rate?: number | null; hsn_code?: string | null }[] | undefined,
): { gst_type: GstTypeUi; gst_rate: number; hsn_code: string } {
  const text = String(product.category || '').trim().toLowerCase();
  const cat = categories?.find((c) => c.id === product.category_id)
    || categories?.find((c) => (c.slug || '').toLowerCase() === text || (c.name || '').toLowerCase() === text);
  const productTaxable = gstTypeToDb(product.gst_type) === 'taxable';
  const useCategory = !!cat?.gst_type && !productTaxable;
  const type = gstTypeToUi(useCategory ? cat!.gst_type : product.gst_type);
  return {
    gst_type: type,
    gst_rate: type === 'Taxable' ? Number(useCategory ? cat!.gst_rate : product.gst_rate) || 0 : 0,
    hsn_code: product.hsn_code || cat?.hsn_code || '',
  };
}
