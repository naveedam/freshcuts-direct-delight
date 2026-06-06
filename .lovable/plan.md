# Vendor Settlement & Procurement Tracking

Additive enhancement to the **existing** Purchase Order system. No replacement, no consolidated POs, no inventory module. The current flow (Order → Vendor Assign → PO → Weight Adjust → Invoice → Customer Pay → Vendor Settle) stays byte-identical; we only automate status, add reporting, and add settlement screens.

## 1. PO Status Lifecycle (automatic)

Extend `purchase_orders.status` enum-by-convention to support: `draft → assigned → received → payable → paid → cancelled`. Existing `draft/sent/confirmed/partially_received/received/cancelled` strings remain valid (legacy data unaffected).

Triggers (app-level, in the existing mutation paths — no DB triggers on production tables):

| Action | Where | New status |
|---|---|---|
| Vendor assigned to order_item | `WeightAdjustmentDialog` / vendor assign mutation | `assigned` |
| Actual weight finalized on the order | weight finalize mutation | `received` + sync `actual_received_weight`, `received_quantity`, recompute `total_amount` |
| Invoice generated (sale created) | invoice generator | `payable` |
| `paid_amount >= total_amount` | `VendorPaymentsDialog` after insert | `paid` |

All transitions are idempotent and forward-only (a manual `cancelled` from admin still allowed).

## 2. Weight Adjustment = Goods Received

When `order_items.actual_weight` is set and `orders.weight_finalized = true`:
- For each PO linked to that order, update its `purchase_order_items`:
  - `received_quantity = actual_weight` (or ordered qty for unit-based)
  - `actual_received_weight = actual_weight`
  - `total_cost = actual_weight * unit_cost`
  - `received_at = now()`
- Recompute PO `subtotal` and `total_amount` from items.
- Set PO `status = 'received'`, `received_date = now()`.

No separate GRN screen required. Existing `ReceiveOrderDialog` stays as a manual override but is no longer the only path.

## 3. Vendor Ledger (new screen `/admin/vendors/:id/ledger`)

Summary cards: Purchase Value, Paid Value, Outstanding, Open POs, Last Payment Date.

Detail table (one row per PO): Date · PO# · Customer Order# · Invoice# · Purchase ₹ · Paid ₹ · Outstanding ₹ · Status.

Filters: vendor (when accessed from list view), date range, status. Export to Excel via existing `excel-utils`.

## 4. Vendor Payment (already exists, minor polish)

`VendorPaymentsDialog` already supports Cash / UPI / Bank Transfer / Cheque / Other plus reference + notes + partial payments. Add:
- After payment insert, if `paid_amount >= total_amount` → set PO `status = 'paid'`.
- Show "Outstanding" badge on PO list rows.

## 5. Procurement Dashboard (new section in `Dashboard.tsx`)

Cards:
- Today's Procurement (sum of PO totals where `order_date::date = today`)
- This Week / This Month Procurement
- Vendor Outstanding (sum `total_amount - paid_amount` across active POs)
- Payments Due (POs where status = `payable` and outstanding > 0)
- Open Payables count

Plus a **Top 5 Vendors by Procurement Value** list (current month).

## 6. Daily Vendor Procurement Summary (new dialog)

"Vendor Summary" button on `PurchaseOrdersAdmin`. Picks date (default today), groups all active POs for that date by vendor, lists product · actual_qty · cost · subtotal. Actions:
- Print (browser print)
- Download PDF (reuse `generate-purchase-order` pattern → new lightweight HTML template `vendor-daily-summary`)
- WhatsApp share via `https://wa.me/<vendor.phone>?text=<encoded summary>`

Pure reporting layer — no new entities, just a SELECT/JOIN over `purchase_orders` + items.

## 7. Vendor Profitability Report

New tab on Vendor Ledger or new page `/admin/vendors/profitability`.

For each vendor in date range:
- Sales Value = Σ `order_items.total_price` where `vendor_id = v` and order is invoiced
- Vendor Cost = Σ `order_items.vendor_cost * actual_weight` (fallback to `quantity`)
- Margin = Sales − Cost, Margin % = Margin / Sales × 100

Sortable. Export Excel.

## 8. PO Visibility (retain & enrich)

`PurchaseOrderDetailsDialog` already shows items. Add per-item columns:
- Customer Order # (link), Invoice #, Apartment, Flat #, Ordered Qty, Actual Qty.

Resolved by joining `purchase_order_items.order_id` → `orders` (already present).

## 9. Auto-Archive Paid POs

`PurchaseOrdersAdmin` default view filters out `status = 'paid'` and `cancelled`. Add a "Show archived" toggle. Paid POs remain reachable via Vendor Ledger and global search — no deletion, no schema change.

## 10. Safety / Non-Goals

Untouched: Orders, Order Items, Order Processing, Weight Adjustment business logic (we only **read** results to update POs), Invoices, GST Reports & Reconciliation, Customer Payments, Customer/Party Ledger, Packing Labels, Website Ordering, WhatsApp Ordering, Storefront, Auth.

Migration scope: zero schema changes required — all needed columns (`status`, `paid_amount`, `actual_received_weight`, `received_quantity`, `received_at`, `vendor_cost`, `actual_weight`, `invoice_number`, `flat_number`, `building_name`) already exist.

## Files

**New**
- `src/pages/admin/VendorLedger.tsx`
- `src/pages/admin/VendorProfitability.tsx`
- `src/components/admin/VendorDailySummaryDialog.tsx`
- `src/lib/po-lifecycle.ts` — pure helpers: `syncPOFromWeightAdjustment`, `markPOPayableOnInvoice`, `markPOPaidIfSettled`, `transitionPOOnVendorAssign`

**Edited (minimal, additive)**
- `src/pages/admin/PurchaseOrdersAdmin.tsx` — archive filter, Vendor Summary button, status badges for new states, outstanding column
- `src/pages/admin/Dashboard.tsx` — procurement cards + top vendors
- `src/components/admin/WeightAdjustmentDialog.tsx` — call `syncPOFromWeightAdjustment` after finalize
- `src/components/admin/VendorPaymentsDialog.tsx` — call `markPOPaidIfSettled` after payment
- `src/components/admin/PurchaseOrderDetailsDialog.tsx` — enrich item rows
- `src/lib/invoice-generator.ts` (or the invoice creation site) — call `markPOPayableOnInvoice`
- `src/components/admin/AdminSidebar.tsx` — add "Vendor Ledger" + "Vendor Profitability" links
- `src/App.tsx` — routes

**No edits** to: GST reports/reconciliation, packing label, shipping label, edge functions for invoices, orders flow, cart, checkout, storefront.

## Testing checklist

- Assign vendor to an order item → PO row flips to `assigned`.
- Finalize weight on the order → linked PO updates `received_quantity` + `total_amount`, status `received`.
- Generate invoice → PO → `payable`.
- Record full payment in VendorPaymentsDialog → PO → `paid`, disappears from default list.
- Record partial payment → PO stays `payable`, outstanding updates in ledger.
- Vendor Daily Summary → groups correctly, WhatsApp link opens with prefilled text.
- Vendor Profitability numbers reconcile against existing reports.
- Regression spot-checks: Orders create/edit, weight adjust dialog, invoice PDF, GST reconciliation total, packing label print — all unchanged.
