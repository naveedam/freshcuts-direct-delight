# Fix: Orders ribbon undercounts because queries hit the 1000-row default limit

## Diagnosis

I queried the DB directly for Villa 170:

- 15 orders, all fully paid, totalling **₹66,313.10** — matches the Ledger exactly.
- The ribbon shows only **14 orders / ₹61,543 billed / ₹36,899 paid**.
- The missing order is `INV-2026-00093` (03-Apr-2026, ₹4,769.80). That accounts for the 1-order and ₹4,770 gap in **billed**, but not the ₹29,414 gap in **paid**.

Row counts in the database:
- `orders`: **1,180 rows**
- `customer_payments`: **1,083 rows**

`src/pages/admin/OrdersAdmin.tsx` fetches both with plain `select('*')` — Supabase's PostgREST client silently caps responses at **1,000 rows** unless a range is set. So:

- The `orders` query drops ~180 oldest rows → Villa 170's April order is missing from the ribbon.
- The `customer_payments` query drops ~83 oldest rows → historical payments for this party (and every long-standing party) disappear from the ribbon's "Paid" total.

The Ledger sheet is correct because it queries the DB **scoped to one party** (`WHERE flat_number='Villa 170'`), so it never hits the 1000-row ceiling.

Same silent truncation affects the top-of-page widgets (Total Outstanding, Overdue) and the Party Due badges — they'll drift as the business grows.

## Fix

Fetch orders and payments in **paged batches until exhausted**, so the client-side aggregations see every row.

### 1. `src/pages/admin/OrdersAdmin.tsx`
- Replace the `orders` query body with a loop using `.range(from, from+999)` that keeps requesting 1000-row pages until a short page is returned, then concatenates.
- Do the same for the `allPayments` query.
- Keep the existing `queryKey`s and downstream logic unchanged — only the fetch changes.

### 2. Audit other admin pages that aggregate all-time data
Quick sweep for the same pattern and apply the same paging helper where the count could exceed 1000:
- `src/pages/admin/Dashboard.tsx` (revenue / outstanding widgets)
- `src/pages/admin/GSTReportsAdmin.tsx` (invoice register)
- `src/lib/gst-reports.ts` / `src/lib/gst-reconciliation.ts` (if they pull orders or sales)
- `src/pages/admin/VendorLedger.tsx`, `VendorProfitability.tsx`, `PurchaseOrdersAdmin.tsx`

Only change files where a full-history aggregation is done client-side. Detail dialogs already scope by id and are unaffected.

### 3. Small shared helper (optional but cleaner)
Add `fetchAllRows(query, pageSize = 1000)` in `src/lib/supabase-paginate.ts` so each call site becomes a one-liner instead of hand-rolling the loop.

## Out of scope
- No schema changes.
- No change to Ledger sheet, invoice generation, or PO logic.
- Not switching to server-side aggregation yet (RPC) — paged fetch is enough for current scale (~1k–5k rows) and preserves the existing filter UX.

## Verification
- Reload `/admin/orders`, search "villa 170", confirm ribbon shows **15 / ₹66,313 / ₹66,313 / ₹0**, matching the Ledger.
- Confirm the top "Total Outstanding" and "Overdue" widgets increase to reflect the previously-hidden older orders.
