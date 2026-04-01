

## Fix Invoice Total Calculation Bug

### Root Cause

The admin order creation stores GST type values as UI labels (`'Exempt'`, `'Nil-rated'`, `'Taxable'`) in the `order_items` table, but the invoice edge function expects lowercase DB values (`'exempt'`, `'nil'`, `'taxable'`). This means `calculateGSTSummary` in the edge function matches none of the three `if` branches, so all category totals remain zero — producing ₹0 subtotal, tax, and grand total despite correct line items.

### Changes

**1. `src/components/admin/NewOrderDialog.tsx`** — Normalize gst_type when inserting order_items

Add a helper and apply it at line 428 where `gst_type: item.gst_type` is stored:

```typescript
// Reuse existing gstTypeToDb helper (already at line 359)
// Move it above the submit handler so it's available earlier
const gstTypeToDb = (t: string) => t === 'Nil-rated' ? 'nil' : t.toLowerCase();
```

Change line 428 from:
```
gst_type: item.gst_type,
```
to:
```
gst_type: gstTypeToDb(item.gst_type),
```

**2. `src/components/admin/EditOrderDialog.tsx`** — Same normalization

Add the same `gstTypeToDb` helper and apply it at lines 292 and 317 where order_items are upserted/inserted.

**3. `supabase/functions/generate-invoice/index.ts`** — Defensive normalization

Add case-insensitive matching in `calculateGSTSummary` (line 132) and `calculateLineItemGST` (line 91) to handle any existing orders with mixed-case values:

```typescript
// Normalize gst_type to lowercase for comparison
const gstType = String(item.gst_type || '').toLowerCase();
const normalizedType = gstType === 'nil-rated' ? 'nil' : gstType;
```

Apply same normalization in `buildHSNSummary` to filter out exempt/nil items (matching client-side behavior).

**4. HSN Summary Mismatch Fix** — `supabase/functions/generate-invoice/index.ts`

The edge function's `buildHSNSummary` includes exempt and nil-rated items (showing their `taxable_value` which is the full line value), creating inflated HSN totals vs the GST summary. Add a filter to only include taxable items, matching `src/lib/gst-utils.ts` line 75:

```typescript
// Skip non-taxable items in HSN summary
const normalizedType = ...;
if (normalizedType !== 'taxable') return;
```

**5. Customer checkout zero GST** — `src/lib/order-utils.ts`

The `buildOrderItems` function at line 62 hardcodes `taxable_value: 0` and zero GST amounts. This is fine because the invoice uses `recalculate: true`, but for data integrity, compute GST at insert time. This is a minor improvement, not the primary bug.

### Impact
- Fixes ₹0 totals on all new invoices
- Fixes HSN summary showing inflated values
- Existing orders with wrong casing will be handled by the edge function's defensive normalization
- No schema changes needed

