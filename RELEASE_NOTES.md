# Release Notes

## 2026-07-15

### Fixed
- **Vendor PO accuracy**: Removed a duplicate database trigger (`trg_sync_vendor_pos_on_finalize`) that ran alongside the app-level PO sync logic with slightly different matching rules, creating a risk of vendor line items splitting across two purchase orders for the same vendor/day. PO sync is now handled exclusively by `syncPOsFromWeightAdjustment()`.
- **Weight correction after finalization**: Previously, once an order's weights were finalized, all fields in the Weight Adjustment dialog were permanently locked — any correction (e.g. vendor-supplied weight entered incorrectly) required a direct database edit. Added a "Correct Weights" mode that unlocks the fields post-finalization, recalculates the order total, and resyncs the linked vendor PO on save.

### Verified
- Confirmed vendor POs for Aqsa Mutton Stall and Feroz Fish Stall are correctly computed from actual/vendor-supplied weight rather than customer-billed weight.
- Confirmed "Party Due" aggregation (grouped by flat + building, falling back to phone) is computing correctly; an earlier apparent discrepancy was a stale client-side cache, not a logic error.

## 2026-07-15 (follow-up)

### Fixed
- The "Finalized" badge on the Orders admin table was previously a static, non-clickable badge — making the new weight-correction flow (added earlier today) unreachable for orders already marked finalized. It's now clickable and opens the same Weight Adjustment dialog.
- Added a confirmation prompt before saving any weight correction, since the order may already have been invoiced to the customer.

## 2026-07-15 (invoice edit fix)

### Fixed
- Editing an invoice's quantity/rate via "Preview & Edit Invoice" updated `total_amount` but not `balance_due` — meaning the customer's outstanding due stayed stuck at the pre-edit amount (found on INV-2026-01314: total corrected from ₹329 to ₹282, but Party Due still showed ₹329). Balance due and payment status now recompute correctly on save, and the linked vendor PO resyncs too.

## 2026-07-16 (party due / credit balance fix)

### Fixed
- Party Due aggregation was silently dropping credit balances (orders with negative `balance_due` from accepted overpayments) instead of netting them against other dues. A party with a ₹232 credit and a ₹1402 invoice due now correctly shows Party Due as ₹1,170 instead of the full ₹1,402.
- Added an explicit green "Credit: ₹X" indicator next to Party Due whenever a party has a net credit balance, linking to their ledger.

## 2026-07-16 (security fixes)

### Fixed — Critical
- Invoices storage bucket was public with no authentication required — any customer invoice file was accessible to anyone with (or guessing) the file URL. Bucket is now private; access requires admin role or (for a customer's own invoice) ownership — served via signed URLs going forward.
- Customer-facing order details page exposed internal vendor cost data (`vendor_cost`, `vendor_id`, `vendor_supplied_weight`) via an unrestricted `select('*')` on `order_items`. Added a column-limited view (`order_items_customer_view`) for customer-facing queries; vendor cost data is no longer reachable by customer accounts.

### Fixed — Warnings
- Business settings and GST configuration (GSTIN, business email, phone) were readable by any authenticated user, not just admins. Restricted to admin role.
- Several `SECURITY DEFINER` database functions meant only to run via internal triggers (financial year assignment, PO sync, invoice/credit-note numbering, etc.) had default `EXECUTE` permission open to all authenticated and anonymous users. Revoked direct execute access; trigger-based invocation is unaffected.
