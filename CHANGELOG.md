# Changelog

All notable changes to FreshCuts Daily are documented here.

## 2026-11-10

### Fixed
- **Orders → payment filter** now matches the badge on each row (it was reading a stored status that could be out of date). You can tick more than one, e.g. Unpaid + Partial.

### Added
- **Products:** "All on / off" above the Storefront, In stock, Orderable, Pre-order and Order form columns. It changes only the products currently shown by your filters.
- **Delivery Partner Advances:** delete a partner and their advance entries (asks first; Deactivate still keeps the history).
- **Prices switch products on:** once a product has both a buying and a selling price for today (seafood: both dated today), it's switched on for Storefront, In stock, Orderable and Order form. Pre-order is left as it is. A daily job at 00:10 IST does the same for anything priced in advance. You can still switch things off by hand.
- **Live Google rating:** a `google-rating` function refreshes the star rating and review count from Google every 6 hours once a Places API key and Place ID are set; until then the numbers from Admin → Content are shown.

### Changed
- **Price check** flags only changes of 30% or more, up or down (all categories set to 30%).
- **Expenses:** the "Spread over" dates are gone; packaging and overhead are shared out over the month of the expense date.
- **Storefront:** classier menu (Prime Mutton, Farm Poultry, Ocean Fresh, The Pantry) in spaced serif capitals with a gold underline; product cards are larger, 4 to a row on desktop (2 on phones) with an "Add to basket" button; Today's Catch cards are larger with the fish photo on the left; the WhatsApp button is a small round button in the corner (label slides out on hover) with room left below the last row.

## 2026-11-09 (Logo)

### Changed
- The Fresh Cuts Daily logo (vector, sharp at any size) is used in the storefront header (larger, with a slight lift on hover), in white in the footer, on the sign-in page, and in the admin sidebar (the cleaver alone when the sidebar is collapsed).
- Browser tab and phone home-screen icons use the cleaver (`public/favicon.svg`, `public/apple-touch-icon.png`).
- **Invoices use the Fresh Cuts Daily colours:** logo brown for the business name, section labels, table headings and rules; a thin gold line under the header; warm cream panels; the website red for the Total band; the website's fonts (Playfair Display for the business name). An unpaid balance stays red.
- **Invoices** (PDF and WhatsApp image) show the logo at the top left, beside the business name and address. It's built into the invoice layout (`src/lib/brand-logo.ts`), so it's always included.

## 2026-11-09 (Party ledger payments)

### Fixed
- **A party payment shows as one line in the party ledger** with the full amount (e.g. ₹12,647 cash), not one line per invoice it settled. It's still applied to the open invoices oldest-first, as before; the line notes how many invoices it settled. Earlier split payments are grouped the same way (records saved together by the same person with the same method, reference and note). Migration `20261109100000_payment_batches.sql` adds `customer_payments.payment_batch_id`.
- **Notes entered with a payment show in the ledger**, under the method and reference.
- A payment that settled several invoices has a **Show the N invoices settled** link that lists each invoice number and the amount applied to it.

### Changed
- The payment method in both payment windows (single order and party) starts on **UPI**.

## 2026-11-09 (Home title bar, Today's Catch roll)

### Changed
- **Home page title bar** now matches the category bars: same height, and it stays in place under the site menu. The search bar stays in place just under it.
- **Today's Catch** never shows a gap: with only a few fish the cards are repeated to fill the width, and the speed stays the same however many there are.
- **Today's Catch** rolling no longer depends on the shared stylesheet, and it rolls on every computer, including ones with the "reduce motion" / "show animations" setting turned off (that setting had stopped it).

## 2026-11-08 (Outstanding figures, fixed screen tops, storefront)

### Fixed
- **Outstanding** in the party bar on Orders (e.g. B2901 Zenith Residences showed -₹687 instead of ₹7,241) and the **Total Outstanding** / **Overdue** cards on Orders and **Customer Outstanding** on the Dashboard now use the same figure as each row's Party Due: billed minus payments received, with advances set against later invoices. They used to add up each order's stored balance, which can be out of date or negative where an advance sits on one order. Shared in `src/lib/party-dues.ts`.

### Changed
- **Admin screens:** on larger screens the top of each list screen (title, totals, filters, and the tab bar on tabbed screens) stays in place while the list below scrolls: Orders, Products, Categories, Vendors, Purchase Orders, Vendor Ledger, Vendor Profitability, Delivery Partner Advances, Documents, Delivery Runs and Rate Management. Phones scroll as before.
- **Storefront home:** heading now "Fresh meat & fish, delivered to your doorstep" with the line "The finest cuts and freshest catches, delivered to you". The category buttons under Today's Catch are removed (the same categories are in the site menu); the home page shows every fresh category, and search still works.
- **Today's Catch** cards roll slowly from right to left and stop while the customer hovers over or touches them (they stay still for visitors who have reduced motion turned on).
- **Category pages:** the coloured bar with the category name is shorter and stays in place under the site menu while the products scroll.

## 2026-11-08 (Chicken tabs alike; suppliers)

### Changed
- **Chicken selling price is one price for all suppliers.** Rate Management → Chicken shows the same **Selling Price** table (by cut and date) under both M N Broilers and Bismillah. Existing selling prices entered against either supplier became the shared price on the same dates (M N Broilers' where both had one).
- **Bismillah Chicken tab laid out like M N Broilers:** a **Purchase Price** table by cut and date, entered by hand, above the shared Selling Price table.
- **Other poultry items** (liver, country chicken, kebabs, eggs) have their own price list under Chicken.
- **Suppliers:** Chicken Kebabs and Mutton Kebabs → Patli Galli; Country Chicken → Al Azeez and A S Chicken; every egg product → A J Eggs (their other supplier links removed).
- **Vendor Management → Manage Products:** tick any number of products, or a whole category, and link them to the vendor in one go.
- Migration `20261108170000_shared_chicken_selling_and_vendors.sql`.

## 2026-11-08 (Security check)

### Security
- Database functions that run with full rights (`refresh_product_price`, `refresh_all_product_prices`, `recompute_order_payment`) can no longer be called from outside; only the database's own triggers and scheduled job use them. Admin-only helpers can't be called by signed-out visitors. Migration `20261108150000_function_access.sql`.
- The access change didn't take effect on the live project, so `20261108160000_function_guards.sql` adds a second lock: each of those functions now checks its caller and answers "Not allowed" to anyone but an admin or the database itself (triggers, the nightly price job). It also repeats the access change.
- `supabase/rls_check.sql`: a check to run in the SQL Editor; it now also calls each function as a signed-out visitor and a customer to confirm they're refused.
- (Earlier version of the check:) a check to run in the SQL Editor. It acts as a signed-out visitor, a signed-in customer and an admin, tries to read and change each table, undoes every change, and lists the results (every row should say OK).

## 2026-11-08 (Invoice share closes on download)

### Fixed
- Closing the invoice windows after a download crashed the Orders screen ("Cannot read properties of null (reading 'invoice_number')"): the preview read the order after the page had already cleared it. The preview now keeps the order until it has closed.
- Downloading the same invoice a second time failed to save its copy (storage refused to replace the file). Migration `20261108140000_invoice_storage_update.sql` lets admins replace invoice files.
- Downloading an invoice as PDF or image from Share now closes the Share and Invoice Preview windows as soon as the file is downloaded, back to the Orders list. Saving a copy to the flat's documents carries on in the background; before, the windows waited for that and stayed open if it was slow or failed.

## 2026-11-08 (Delivery partner advance ledger)

### Added
- **Expenses → Delivery Partner Advances** is now a full ledger per delivery person, kept apart from Expenses (nothing here creates or counts an expense):
  - Entries: Opening advance balance, Additional advance, Amount for delivery (with the days it covers), Amount deducted, Amount paid; each with a date and remarks.
  - Two running balances: **advance held** (opening + additional − deducted) and **owed to partner** (delivery − deducted − paid). Closing balance = advance held − owed.
  - **Settle days** records delivery, deduction and payment together and reminds you to enter the full delivery amount in Expenses.
  - **Ledger** shows every entry with the balances after it for any date range, with **Share via WhatsApp**, **Copy summary** and a downloadable **Statement** (Excel).
  - Entries aren't edited; a wrong one is removed (and kept in the audit log) and entered again.
- The Expenses form reminds you, for Delivery, to enter the full amount for the days.
- Migration `20261108130000_partner_ledger.sql`: the opening balance entry, balances and deduction check updated, and an audit trail for the ledger and partners.

## 2026-11-08 (Seafood in the order form)

### Changed
- **New Order** has a **Delivery date** (today by default). Seafood appears in the product dropdown only if the seafood sheet has a selling price for that date, and a fish line takes that day's selling price. Saving, repeating or removing sheet prices updates the list straight away. Orders for a later date are marked as pre-orders.
- A line that already holds an unpriced fish (e.g. a repeated order) keeps it and shows "No seafood price for <date>".
- **Products** screen: for seafood the Order form column shows **Auto · On/Off** for today, worked out from the sheet, instead of a switch. The "Not in order form" filter uses the same rule. Storefront visibility and stock are unchanged and stay separate.

## 2026-11-08 (Catalogue: chicken, mutton, seafood)

### Changed
- **One chicken list of 14 cuts**, used by both M N Broilers (buying price from the live rate) and Bismillah (prices entered by hand). Duplicate products created from the cut names were merged into the products that hold the order history, which took the cut names. Chicken Breast, Chicken Boneless and Chicken Breast Fillet are now one product, **Chicken Breast Fillet**; the breast cut is renamed to match. Chicken Wings became **Chicken Wings With Skin**. Every cut is now linked to its product, so all 14 get M N Broilers buying prices.
- **Mutton: 17 items** with the agreed names and selling rates from 8 Nov 2026 (Goat Boneless, Goat Spleen, Goat Liver and Goat Head are new). Brain / Bheja is sold per piece at ₹180.
- **Seafood: 55 items** with the agreed names; 12 are new and wait for the daily sheet to price them.
- Switched off (hidden, not deleted): the merged duplicates, a duplicate Tender Lamb Shanks, "Goat - Heart, Liver , Kidney", Salmon, Fresh Sea Bass, Live Maine Lobster and Mussels.
- **Products screen:** the Price column and price fields are removed; prices are set only in Rate Management. A new product shows "No price yet" and stays off the storefront until it is priced.
- Past orders and invoices keep the names and prices they were made with.
- Migration `20261108120000_catalogue.sql` (ends with a list of the catalogue as it now stands).

## 2026-11-08 (M N Broilers selling prices in rupees)

### Changed
- M N Broilers selling prices are now entered as rupee amounts in a **Selling Price** table under the live rate (Rate Management → Chicken → M N Broilers), laid out like the buying-price table: one column per cut, one row per date. A price applies from its date until the next change. "In force today" shows the current price of every cut; "Set new prices" adds a dated row, and Edit corrects one.
- The **Sell ×** row is removed from the multiplier table; multipliers now set the buying price only. Saving a rate or multiplier set no longer changes any selling price.

## 2026-11-08 (Chicken selling price fix)

### Fixed
- **Chicken - Skin out showed a selling price of ₹52,910.** A selling multiplier of 370 (a price typed into "Sell ×") was multiplied by the live rate (143 × 370). Migration `20261108110000_fix_chicken_sell_multiplier.sql` clears multipliers above 10, removes the selling prices worked out from them, and puts the product's price back to the latest correct one. Past orders and invoices are unchanged.

### Added
- Chicken multipliers above 10 are refused, on screen and in the database, with a message that it looks like a price.
- The price check now flags a selling price more than 5 times its cost, and compares a supplier's first selling price with the product's current price (it used to skip that case).

## 2026-11-08 (Screens combined)

### Changed
- **Vendor Management** replaces four menu items: tabs for Vendors, Purchase Orders, Vendor Ledger and Vendor Profitability. Each tab is the existing screen unchanged; old links open the matching tab.
- **Product Management** replaces Products and Categories: one screen with two tabs.
- **Expenses** has a second tab, **Delivery Partner Advances**, in place of the separate Delivery Partners screen.
- Delivery partner advances are now kept apart from Expenses: settling a partner records ledger entries only and no longer adds an expense. Delivery payments are entered in Expenses as before. Delivery companies (Rapido, Porter, Uber Courier, Uncle Delivery) are removed from the partner list where they have no entries.
- Migration `20261108100000_advances_independent.sql`.

### Removed
- The **Link cuts to catalog products** section in Chicken rates. Existing links stay in place and keep pricing; unlinked cuts will be matched to products automatically when the chicken catalogue is standardised.

## 2026-11-08 (Collections fix)

### Fixed
- **Collections Today missed payments received after midnight.** Payment times are stored in UTC, and the Dashboard and Orders cards compared the UTC date with today's IST date, so a payment at 12:01 AM IST counted towards the previous day. Both cards now take each payment's IST date. The Orders card also leaves out settlement adjustments, matching the Dashboard. No stored data changes.

## 2026-11-07 (Expenses and delivery partners)

### Added
- **Delivery Partners** page (Admin → Delivery Partners): each partner's advance held, amount still owed and the date they're settled up to. **Advance** records cash given in advance (not an expense). **Settle** pays for a run of days: amount for the days, how much comes out of the advance, and what's paid now. It saves everything in one step, adds the cost to Expenses spread over those days, and gives a ready-to-send WhatsApp message (opening advance, amount for N days, deducted, paid, advance left). History shows every entry.
- Partners are started from the delivery names already used in Expenses (Aslam, Rapido, …).
- **Business hours** (opening and closing time, IST) in Business Settings.

### Changed
- **Expense types:** Daily running cost (counted on the day), Packaging stock and Fixed overhead (spread over the period they cover), Capital purchase (left out of daily profit). Packaging and Utilities default to a month-long spread. Electricity, Water and Rent added under Utilities.
- Dashboard **Operating Expenses** and **Net Profit Today** use what's counted for today, so a month's electricity bill or a box order no longer makes one day look like a loss.
- Expenses shows "Paid this month" and "Counted in profit", and the month list always covers the last 12 months. Dates use IST.
- Migration `20261107160000_expenses_partners.sql`: expense type and spread columns, `expense_cost_between()`, `delivery_partners`, `partner_ledger`, `partner_balances`, `settle_delivery_partner()`, and a check that a deduction can't exceed the advance held.

## 2026-11-07 (Storefront)

### Changed
- **Prices show at all hours.** The 6 PM cut-off and the morning publish gate for seafood are gone.
- **Four independent switches decide what customers see and can do:** hidden or inactive products don't appear; in stock + orderable → Add to cart; out of stock + pre-order → "Pre-order" for the next delivery date; out of stock without pre-order → Out of Stock label, no ordering; not orderable → shown with price, "Not available to order".
- **Business hours (default 06:00–18:00 IST) and delivery dates.** Orders before closing are delivered today, after closing the next day; outside hours they are marked pre-orders. Checkout shows the delivery date and stores it on the order (`delivery_date`, `is_preorder`), as does the WhatsApp form.
- Checkout re-checks each item's availability before placing the order.
- Migration `20261107150000_storefront.sql`: `get_business_hours()`, a database check that refuses unavailable items in customer orders (admins and server-side code are not restricted), and the WhatsApp order function updated for pre-orders and delivery date.

## 2026-11-07 (Orders and payments)

### Added
- **Settle remaining balance** in the payment dialog: records an agreed discount or round-off as an adjustment (with reason), so the invoice and Party Due clear. Excluded from cash-received figures.
- New Order and Edit Order list only active products marked "Show in New Order dropdown".

### Changed
- GST on New Order, Repeat Order and Edit Order comes from the product's category (meat and fish: Exempt). Products explicitly marked Taxable keep their own rate.
- Repeat Order applies today's selling price and current GST, not the old order's.
- Migration `20261107140000_orders_payments.sql`: an order's paid amount, balance and payment status are rechecked whenever a payment is added or removed, or its total changes (e.g. at Finalize Weights). Every new order line stores the product's category and unit.

### Fixed
- An order paid in full and then increased at weighing kept saying "Paid" while Party Due showed the difference (the ₹83 case).

## 2026-11-07 (Product Master)

### Changed
- **Products is now the Product Master.** Each product has independent switches, editable in the list and in the Add/Edit dialog: Active, Show on storefront, In stock, Orderable, Pre-order, Show in New Order dropdown.
- Filters by category and status (hidden, out of stock, not orderable, pre-orders on, not in order form, HSN to check, inactive) plus search.
- Price is read-only on Products, with a link to its Rate Management tab. A new product's starting selling (and optional purchase) price becomes its first dated price record.
- Deactivated products can be reactivated; badges flag products with no price yet and automatically filled HSN codes.
- Saving a product also sets its category id, so name/slug mismatches stop.

## 2026-11-07 (Rate Management)

### Added
- **Rate Management** (Admin → Rate Management) with four tabs, each with per-product history:
  - **Chicken:** M N Broilers uses the Chicken Rate screen as it was before 5 November (live rate × multiplier) plus a Sell × row per set; every saved rate, set or link records that day's purchase and selling price. Bismillah Chicken uses fixed, dated prices per product.
  - **Mutton:** the nine mutton products with purchase and selling price, Edit (new dated record), Delete (a wrong record) and History; no live rate.
  - **Seafood:** a daily sheet with Repeat Previous Day and Copy From Date. Saving creates independent records for that date, ticks Today's Catch, and for today marks listed fish In Stock and other seafood Out of Stock.
  - **Other Products:** every other category, with category filter and search.
- Unusual prices (below cost, or beyond the category limit vs the last price) open a prompt: fix them, or an admin gives a reason that is logged.
- Migration `20261107130000_current_product_prices.sql`: `current_product_prices` view, `seafood_sheet` price source.

### Changed
- New Order buying prices come from Rate Management (M N Broilers chicken still from the live rate).
- Finalize Weights no longer re-prices seafood: customers are billed the price shown when they ordered.
- Purchase orders and Bulk Upload use the dated price records.

### Removed
- Chicken Rate, Mutton Rate, Seafood Rate, Price History and Today's Catch screens; their links open the matching tab.

## 2026-11-07

### Fixed
- Invoice Preview now closes after a successful download or share, returning to Orders.
- Typing 0.5 in an order quantity no longer turns into 0.0001 (New Order, custom item, Edit Order).
- Picking a product on New or Edit Order no longer leaves the GST field blank (stored lowercase vs displayed labels).
- Recording a payment refreshes Paid badges, invoice dues and Party Due immediately; status changes show at once.
- Apartment autocomplete shows every matching building again; a typed flat number only sorts matches first.
- Dashboard KPI cards all roll over at 12:00 AM IST (Expenses and Payments Today used the UTC date; the expenses card didn't recompute).
- Add Product dialog scrolls inside, with Save/Cancel fixed at the bottom.
- Footer wordmark reads "Fresh Cuts Daily" without the stray comma; apartment-count claim removed from the home page.

## 2026-11-05 (evening)

### Added
- **Mutton Rate** (Admin → Mutton Rate): works like Chicken Rate. Daily live rate, cuts with buying and selling multipliers, supplier chosen on the page, cuts added on the page.
- **Selling multipliers for chicken and mutton**: website price = latest live rate × the cut's selling multiplier, rounded to the rupee. It updates when a rate, multiplier set or link is saved. A blank selling multiplier leaves the Products price alone.
- **Price History** (Admin → Price History): the price in force each day for chicken, mutton and seafood (up to 92 days), with type filter, search and Excel export.
- **Seafood Rate search** on the fish column.
- New seafood and mutton products stay off the storefront until their first price is entered (`products.awaiting_daily_price`). WhatsApp orders refuse them too.
- Migration `20261105210000_mutton_rate_and_daily_price_visibility.sql` (safe to re-run).

### Changed
- Chicken Rate and Mutton Rate show cuts as rows (no sideways scrolling); the monthly list shows rates only, with per-cut prices on Price History.
- Share Invoice closes after a download or share. The payment dialog opens with the balance filled in and closes once the order is fully paid.
- Less scrolling across admin: tighter table rows and card padding, every dialog fits the screen and scrolls inside, single page padding, New Order fits customer and address on two rows, merges GST/HSN into one column and keeps Create Order in view, Orders list merges order ID, date and source into one column.

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