---
name: Invoice Cancellation & Credit Notes
description: GST-safe reversal of invoiced orders via void or credit note paths
type: feature
---
When cancelling an order with a generated invoice, admin chooses one of:

1. **Cancel Order Only** — order status=cancelled, invoice stays live (rare).
2. **Cancel Invoice (void)** — for invoices NOT yet filed in GSTR.
   Sets `orders.invoice_cancelled=true`, `invoice_cancelled_at`, `invoice_cancelled_reason`, `invoice_cancelled_by`.
   Updates linked `sales` row → `payment_status='cancelled'`, `cancelled_at=now()`.
3. **Cancel with Credit Note** — for invoices ALREADY filed.
   All void steps PLUS inserts a `credit_notes` row (number `CN-YYYY-NNNNN` via `generate_credit_note_number()`),
   amount = invoice total, then back-links via `orders.credit_note_id`.

Reporting rules:
- Dashboard revenue and GSTR queries exclude `invoice_cancelled=true` and `status='cancelled'`.
- GSTR final value = invoice_total − credit_notes_total (banner shown in GST Reports page).

Audit trail is preserved — invoices, sales, and credit notes are NEVER deleted.

UI: "Cancelled Invoice" destructive badge replaces "Converted"; Share & Payment buttons disabled.
