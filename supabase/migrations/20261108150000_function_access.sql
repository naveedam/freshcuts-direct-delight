-- Lock down database functions added in Nov 2026 so only the right people can call them.
-- Functions are callable by everyone (including signed-out visitors) unless access is removed.
-- The triggers that use these keep working: they run as the database owner. Safe to re-run.

-- Run with full rights: only the database itself (triggers, scheduled job) should call them.
REVOKE EXECUTE ON FUNCTION public.refresh_product_price(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_all_product_prices() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_order_payment(UUID) FROM PUBLIC, anon, authenticated;

-- Admin screens only (these already respect table security; this stops signed-out calls).
REVOKE EXECUTE ON FUNCTION public.expense_cost_between(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expense_cost_between(DATE, DATE) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_delivery_partner(UUID, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_delivery_partner(UUID, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.current_purchase_price(UUID, UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_purchase_price(UUID, UUID, DATE) TO authenticated;
