# Security Audit — July 30, 2026

Full review of FreshCuts Daily's codebase, database, and infrastructure ahead of opening customer accounts to the public.

## Summary

No critical or actively exploitable issues found. RLS policies and edge function auth are solid. Two code-level bugs were found and fixed during the audit (not security-critical, but worth fixing). A handful of dependency vulnerabilities remain, all low real-world risk given how this app uses them, deferred to routine maintenance.

## Areas checked

| Area | Result |
|---|---|
| Secrets/config exposure | Clean. No live Supabase service-role key or credentials in frontend code. An old Supabase project's anon/publishable key exists in git history (`jifwwnuenblbnttxynbb`) — that project is no longer in use; recommend confirming it's paused/deleted in the Supabase dashboard to close it out permanently. |
| Database RLS (all tables) | Enabled on every table. Verified actual policy logic (not just presence) on `orders`, `order_items`, `profiles`, `user_roles` — all correctly chain through `has_role(auth.uid(), 'admin')` or `auth.uid() = user_id`. No privilege-escalation path (no client-writable `INSERT`/`UPDATE` on `user_roles`). |
| `has_role()` function | `SECURITY DEFINER`, always invoked with `auth.uid()` — never trusts a client-supplied user ID. |
| Edge functions | `generate-invoice`, `generate-shipping-label`, `generate-purchase-order`, `generate-packing-labels` all have `verify_jwt = false` in config but each performs its own manual Authorization-header → JWT claims → `has_role` admin check before touching data. Confirmed safe. |
| Storage buckets | `invoices` bucket is private (correct — contains customer PII). `product-images` is public (correct — public product photos). |
| `order_items_customer_view` | Has `security_invoker = true` — correctly runs with the querying user's permissions, so `OrderDetails.tsx`'s query (filtered only by `order_id`) is still protected by the underlying `order_items` RLS policy. |
| Frontend route guards | Every `/admin/*` route wrapped in `RequireAdmin`. Account pages (`UserDashboard`, `OrderHistory`, `OrderDetails`, `ProfileSettings`) aren't route-guarded at the `App.tsx` level but each self-guards with a `!user` redirect to `/auth`. |
| XSS surface | No unsafe `dangerouslySetInnerHTML` usage on user input (only one use, in the shadcn `chart.tsx` component, on static theme config). All edge functions HTML-escape user-supplied fields before interpolating into generated documents. |
| Dependency vulnerabilities | See below. |

## Fixed during this audit

- **Auth loading race condition** (`AuthContext.tsx`) — `loading` cleared before the admin-role check resolved; could briefly redirect a genuine admin away from admin pages on refresh. Fixed.
- **Missing `ErrorBoundary`** — no app-wide error boundary existed; an unhandled render error would show a blank page. Added one wrapping the full app tree.
- **`react-router-dom`** bumped to 6.30.4 via `npm audit fix` (patches an XSS/open-redirect advisory). Confirmed not exploitable in this app's current usage (no user-controlled navigation targets), but patched anyway since it was a non-breaking fix.

## Deferred (low priority, no urgent action needed)

- **react-router v6 → v7 migration** — the remaining open-redirect/SSR-hydration CVEs are only fixed in v7. Not currently exploitable in this app (no SSR, no user-controlled redirect targets), but a major-version migration deserves its own scheduled, tested effort rather than being rushed.
- **`dompurify` / `jspdf` / `html2pdf.js`** — vulnerable versions flagged, but only used in `src/lib/invoice-generator.ts` on data the business already controls (not arbitrary user input), so real-world XSS risk is minimal.
- **`esbuild` / `vite`** — dev-server-only issue, never reaches production or end users.
- **`uuid` / `exceljs`** — moderate severity, internal ID generation only, not attacker-facing.
- Old Lovable Supabase project (`jifwwnuenblbnttxynbb`) — confirm paused/deleted in dashboard.

## Not yet reviewed (candidates for a future pass)

- Rate limiting / CAPTCHA on Supabase Auth sign-in (dashboard-level setting, not code)
- Full review of remaining edge functions not covered above, if any exist
- Bulk customer import flow (planned but not yet built) — will need its own review once implemented
- Session token storage/expiry configuration