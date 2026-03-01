

## Plan: Update Admin Order Quantity Input to Support Decimals

### Current State
Line 387-392 in `NewOrderDialog.tsx`: The Qty input uses `min="1"`, no `step` attribute, and `parseInt()` which truncates decimals.

### Changes

**File: `src/components/admin/NewOrderDialog.tsx`**

1. **Qty input (lines 387-392)**: Change `min="1"` to `min="0.0001"`, add `step="0.0001"`, replace `parseInt(e.target.value) || 1` with a parsing function that rounds to 4 decimal places and enforces min 0.0001.

2. **Add a helper function** to sanitize quantity input:
   ```typescript
   const parseQuantity = (value: string): number => {
     const parsed = parseFloat(value);
     if (isNaN(parsed) || parsed < 0.0001) return 0.0001;
     return Math.round(parsed * 10000) / 10000; // 4 decimal precision
   };
   ```

3. **Default quantity on product select (line 141)**: Keep `quantity || 1` as-is -- this is fine since 1 works for both models.

No other files need changes. The `calculateLineGST` function already uses multiplication (`item.quantity * item.unit_price`) which handles decimals correctly. The database `order_items.quantity` column is already `numeric` type, so it accepts decimals. The `order-utils.ts` and invoice generation also use numeric math that handles decimals naturally.

