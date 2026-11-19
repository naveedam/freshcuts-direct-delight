// Sanity checks for weights and prices typed in by hand, to catch slips like 13 kg for 1.3 kg.
// They only warn; the person can still save after confirming.

export interface LineCheckInput {
  ordered: number;            // quantity the customer ordered
  actual: number;             // actual weight (customer)
  vendor: number;             // vendor weight
  unitPrice: number;          // selling price per kg/unit
  vendorCost?: number | null; // vendor's rate per kg/unit
  savedActual?: number | null;
  savedVendor?: number | null;
  savedPrice?: number | null;
  isUnit?: boolean;
}

const ratio = (a: number, b: number) => (a > 0 && b > 0 ? Math.max(a, b) / Math.min(a, b) : 1);
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** "looks like a missing/extra decimal point" when one number is ~10×, 100× or 1000× the other. */
function decimalHint(a: number, b: number): string {
  const r = ratio(a, b);
  return [10, 100, 1000].some((k) => Math.abs(r / k - 1) < 0.08) ? ' — looks like a decimal point slip' : '';
}

export function checkLine(i: LineCheckInput): string[] {
  const out: string[] = [];
  const unit = i.isUnit ? 'units' : 'kg';

  // Vendor and customer weights are normally almost the same.
  if (i.vendor > 0 && i.actual > 0 && ratio(i.vendor, i.actual) >= 1.25 && Math.abs(i.vendor - i.actual) > 0.05) {
    out.push(`Vendor weight ${fmt(i.vendor)} ${unit} vs actual ${fmt(i.actual)} ${unit}${decimalHint(i.vendor, i.actual)}`);
  }
  // Actual far from what was ordered.
  if (i.actual > 0 && i.ordered > 0 && ratio(i.actual, i.ordered) >= 2) {
    out.push(`Actual ${fmt(i.actual)} ${unit} vs ordered ${fmt(i.ordered)} ${unit}${decimalHint(i.actual, i.ordered)}`);
  }
  // Big change from what was saved before (corrections).
  if (i.savedVendor && i.vendor > 0 && ratio(i.vendor, i.savedVendor) >= 2) {
    out.push(`Vendor weight changed from ${fmt(i.savedVendor)} to ${fmt(i.vendor)} ${unit}${decimalHint(i.vendor, i.savedVendor)}`);
  }
  if (i.savedActual && i.actual > 0 && ratio(i.actual, i.savedActual) >= 2) {
    out.push(`Actual weight changed from ${fmt(i.savedActual)} to ${fmt(i.actual)} ${unit}${decimalHint(i.actual, i.savedActual)}`);
  }
  if (i.savedPrice && i.unitPrice > 0 && ratio(i.unitPrice, i.savedPrice) >= 1.5) {
    out.push(`Price changed from ₹${fmt(i.savedPrice)} to ₹${fmt(i.unitPrice)}${decimalHint(i.unitPrice, i.savedPrice)}`);
  }
  // Paying the vendor more than the customer pays for this line.
  const cost = (i.vendorCost || 0) * i.vendor;
  const sale = i.unitPrice * i.actual;
  if (cost > 0 && sale > 0 && cost > sale * 1.02) {
    out.push(`Vendor cost ${inr(cost)} is more than the sale ${inr(sale)} (loss on this line)`);
  }
  return out;
}
