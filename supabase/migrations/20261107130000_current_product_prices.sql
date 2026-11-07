-- Step 3: the price in force today for each product and supplier (supplier may be empty),
-- read by Rate Management and the order forms. security_invoker keeps the admin-only
-- rule of product_prices. Safe to re-run.
CREATE OR REPLACE VIEW public.current_product_prices
WITH (security_invoker = true) AS
SELECT DISTINCT ON (product_id, vendor_id)
  id, product_id, vendor_id, effective_date, purchase_price, selling_price, source, override_reason,
  updated_at, updated_by
FROM public.product_prices
WHERE effective_date <= public.ist_today()
ORDER BY product_id, vendor_id, effective_date DESC;

-- Rate Management saves seafood sheets, mutton and other prices with this source too.
ALTER TABLE public.product_prices DROP CONSTRAINT IF EXISTS product_prices_source_check;
ALTER TABLE public.product_prices ADD CONSTRAINT product_prices_source_check
  CHECK (source IN ('manual', 'chicken_rate', 'repeat', 'migration', 'bulk_upload', 'seafood_sheet'));
