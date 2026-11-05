# Changelog

All notable changes to FreshCuts Daily are documented here.

## 2026-11-05

### Fixed
- **Order on WhatsApp never worked**: the form inserted into `orders` directly, which the RLS policy rejects for every customer (logged out: no insert permission; logged in: the order wasn't tied to their login). Orders now go through a `create_whatsapp_order` database function (migration `20261105200000_create_whatsapp_order.sql`) that validates input, prices items from the product list, and limits each phone number to 5 WhatsApp orders an hour.
- WhatsApp now opens directly on phones and in the app, and a new tab on desktop, with an **Open WhatsApp** button as a fallback when the browser blocks it.
- The WhatsApp product list now includes products stored under the category name (bulk uploads) and excludes unpublished products.
- The WhatsApp delivery date picker no longer blocks tomorrow.

### Added
- **Seafood Rate** (Admin → Seafood Rate): daily selling price per fish and buying price per fish per supplier, entered around 8:30 AM. Prices carry forward until changed; **Publish** (or "Publish: no change today") makes the day's prices live. Publishing also updates the catalog price and the supplier's standing cost, and can tick fish into Today's Catch. Monthly list of price changes.
- **Storefront seafood price window**: seafood prices show only after the day's prices are published and until 6 PM IST. Otherwise product cards, product pages, Today's Catch, cart, checkout and the WhatsApp order form show "Prices will be updated tomorrow morning at around 8:30 AM" (or "this morning" after midnight). Customers can still order; seafood is left out of the displayed total.
- **Finalize Weights re-pricing**: on first finalization, seafood lines take the selling and buying prices in force that day, with the old price shown. Warns if today's prices aren't published. Correction mode never re-prices.
- New Order buying prices and vendor PO sync use the day's seafood buying price.
- Migration `20261105190000_seafood_rates.sql` (seeds starting prices from current catalog prices and supplier costs).

## 2026-07-28 to 2026-07-30

### Migration
- Completed full migration off Lovable-managed Supabase to a self-owned Supabase project (schema, data, storage, edge functions all migrated and verified live).

### Fixed
- **Duplicate Purchase Order bug**: `NewOrderDialog.tsx` and `EditOrderDialog.tsx` were each creating a redundant one-off PO per vendor, separate from the correct daily-consolidated PO (created by the `sync_vendor_pos_on_finalize` DB trigger). Removed both redundant code paths. Cleaned up 26 duplicate POs created before the fix deployed.
- **Stale `balance_due` on cancelled invoices**: cancelling an invoice never zeroed its `balance_due`, causing incorrect "Outstanding" totals to leak into the Orders page party summary banner (which was also missing a filter to exclude cancelled invoices, unlike other totals on the same page). Fixed both the display calculation and the cancellation flow itself (now zeroes `balance_due` going forward). Cleaned up 17 existing cancelled invoices carrying stale non-zero `balance_due` (confirmed safe — none had payments recorded against them).
- **Auth loading race condition**: `AuthContext.tsx` set `loading = false` before the admin-role check (`checkAdminRole`) resolved, creating a brief window where a real admin could be redirected away from `/admin/*` routes. Fixed so `loading` only clears after the role check completes.
- **Dependency vulnerabilities**: patched `react-router-dom` (XSS via open redirect) and other non-breaking `npm audit fix` updates. Confirmed the open-redirect path isn't reachable in this app (no `navigate()`/`<Link>` calls use user-controlled destinations). Remaining vulnerabilities require breaking major-version bumps (`dompurify`/`jspdf`, `esbuild`/`vite`, `uuid`/`exceljs`) and are deferred as routine maintenance — see `docs/security-audit-2026-07-30.md`.

### Added
- **Delete Cancelled Orders** (Admin → Orders): permanently delete a cancelled order with no invoice generated, with confirmation. Blocked if the order has payment records against it.
- **Repeat Order** (Admin → Orders): one-click button that opens a new order prefilled with a past order's customer details and items, fully editable before submitting.
- **`ErrorBoundary`**: wraps the entire app; an unhandled render error now shows a friendly fallback screen instead of a blank page.

### Security
- Full security audit performed — see `docs/security-audit-2026-07-30.md` for the complete findings.
- Confirmed Lovable is **not** actively connected to the GitHub repo (Lovable's "Connect project" screen shows a "Connect" button, not a connected state) — commit history visible in Lovable is just a read-only display of GitHub activity, not a live two-way sync. No action needed; noting this so it doesn't need re-checking later.

## 2026-07-31

### Fixed
- **Vendor payment duplicates (Aqsa Mutton Stall, Feroz Fish Stall)**: found via user report that vendor ledgers looked messy. Cross-checked `vendor_payments` against real weekly payment records (customer-provided spreadsheet). Removed 7 rows — 3 exact duplicates plus 4 real-but-redundant weekly entries that were superseded by monthly consolidated payment totals for April–June. Inserted Aqsa's missing June consolidated payment (₹73,626), then caught and removed an accidental double-insert of that same row. Final verified totals: Aqsa ₹366,875 (6 payments), Feroz ₹527,448 (7 payments).
- **Weekly vendor payment allocation bug**: `handleWeeklyPayment` (Purchase Orders admin → "Record Payment") recorded one payment amount but then blanket-marked *every* currently-filtered pending PO as fully paid, regardless of whether the amount entered actually covered them. Investigated scope across all vendors — confirmed every vendor's total real payments meet or exceed their total PO-paid amounts, so no PO was left falsely marked paid without money behind it; no further data reconciliation needed. Fixed the function to allocate the entered amount proportionally across outstanding POs (oldest-first, capped at what's actually owed), matching the same lifecycle handling already used by the single-PO payment dialog.

### Added
- **Vendor Ledger quick-view** (Purchase Orders page): clicking a vendor's name opens a running ledger (purchases as debits, payments as credits, live balance) — same pattern as the customer party ledger.

## 2026-08-06 to 2026-08-08

### Fixed
- **Credit badge showing raw overpayment instead of net balance**: the Orders page Credit indicator summed only the negative (overpaid) side of a party's orders in isolation, without netting against that same party's unpaid orders — could show a misleadingly large credit figure (e.g. Villa 10, Aristos 1: showed ₹10,345 when the true net was ₹7,039.20). Fixed to derive Credit from the same netted calculation already used for Party Due, so both figures are always consistent with the true balance.
- **Customer payment overpayment silently discarded**: `PartyBulkPaymentDialog` previously reported any amount exceeding a party's outstanding orders as "not allocated" and took no further action — the excess was never recorded anywhere. Fixed so any leftover is automatically applied as extra payment on the party's most recent order, visibly carried forward as credit (consistent with how existing overpayment cases like Suhail and T4 18B were manually corrected). Live-tested on a real account (Fayaz, Fortune Silverton: ₹10,000 payment against ₹4,033 outstanding, ₹5,967 correctly carried forward, then cleanly reverted).
- **Data corrections**: fixed misallocated/duplicate payment records for Suhail (Elegant Mabel), T25 401 (L&T Raintree Boulevard), 4108 (Casa Paradiso 2), T4 18B (SNN Clermont), and Villa 10 (Aristos 1). T25 401's fix also resolved a shared placeholder phone/email that had been merging ~50 unrelated flats into one incorrect party.
- **Duplicate customer records**: merged Suhail, Fayaz, and Mary's orders — each had been split across an inconsistent placeholder building name ("Bangalore") and their correct building name, making them look like separate customers.

### Added
- **Record Payment for parties** (Orders page, both vendors and customers): a single lump payment now automatically allocates across a party's outstanding orders/invoices oldest-first, instead of requiring separate manual payments per invoice.