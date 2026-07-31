# Changelog

All notable changes to FreshCuts Daily are documented here.

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