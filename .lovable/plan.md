# Yield-Aware Vendor Cost for Processed Products

Processed items (e.g., Mutton Mince/Kheema) lose weight during conversion from raw bone-in meat. Vendor cost needs to reflect that yield loss so profit calculations stay accurate.

## 1. Database (migration)

Add two optional columns to `products`:
- `is_processed boolean NOT NULL DEFAULT false`
- `yield_multiplier numeric NOT NULL DEFAULT 1.0` — e.g. 1.3 means 1.3 kg raw → 1 kg processed

No backfill needed; defaults preserve current behaviour.

## 2. Product admin (`ProductsAdmin.tsx`)

In the product edit form, add a "Processed Item" section:
- Toggle: **Is processed product**
- When ON, show numeric input: **Yield multiplier (raw kg per finished kg)** with helper text and example (Mutton Mince = 1.3).

## 3. Order line items (`NewOrderDialog.tsx` + `EditOrderDialog.tsx`)

Extend `LineItem` with:
- `is_processed?: boolean`
- `yield_multiplier?: number`
- `raw_cost_per_kg?: number` (UI-only helper input, not persisted)

When a product is selected and `is_processed === true`, render a small **Cost Calculation** helper block under the vendor cost field:

```
[ Raw meat cost / kg ] × [ yield 1.3 (auto) ] = Suggested ₹1,105/kg  [Apply]
```

- Raw cost prefilled from preferred vendor's `vendor_products.cost_price` (treated as raw price).
- Suggested cost shown in muted/grey text.
- "Apply" button writes `suggested = raw × yield` into the existing `vendor_cost` field.
- Vendor cost stays editable and bold; admin can override freely.
- `Tooltip` (using existing `@/components/ui/tooltip`) on the field label: *"For processed items, cost includes yield loss from raw material."*

For non-processed products: no helper shown; existing manual flow unchanged.

On product auto-fill (existing logic in `updateLineItem` when `product_id` changes), pre-populate `vendor_cost` with `yield_multiplier × cost_price` instead of plain `cost_price` when processed.

## 4. Profit calculation

Already uses `selling_price - vendor_cost` per line. No formula change — accuracy improves automatically because `vendor_cost` now reflects yield-adjusted true cost.

## 5. Types

Update `src/integrations/supabase/types.ts` is auto-generated post-migration — no manual edit. Local `LineItem` interfaces in both order dialogs get the two new optional fields.

## Files touched

- `supabase/migrations/<new>.sql` — add columns
- `src/pages/admin/ProductsAdmin.tsx` — toggle + yield input in product form
- `src/components/admin/NewOrderDialog.tsx` — helper UI, prefill logic, tooltip
- `src/components/admin/EditOrderDialog.tsx` — same helper UI for editing existing orders

No changes to invoices, GST, or reporting — vendor cost is internal cost-of-goods only.