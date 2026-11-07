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
