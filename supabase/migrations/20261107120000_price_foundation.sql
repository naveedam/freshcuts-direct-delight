-- Step 2: pricing and product-master foundation.
--
-- * product_prices: every purchase/selling price as a dated record, optionally per supplier.
-- * Validation in the database: selling below cost, and big moves versus the previous price,
--   are refused unless an admin gives an override reason.
-- * products.price stays as a cached copy of today's selling price for the storefront.
-- * audit_log: old and new values for products, prices and categories.
-- * Category GST/HSN defaults and price-change limits; product switches; order snapshots;
--   delivery date on orders; business hours.
-- * Copies existing prices in. Nothing is dropped or overwritten. Safe to re-run.

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION public.ist_today()
RETURNS DATE LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;

-- products.category may hold the category name or slug, and category_id may be empty.
CREATE OR REPLACE FUNCTION public.product_category_id(p_product_id UUID)
RETURNS UUID LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    p.category_id,
    (SELECT c.id FROM categories c
      WHERE lower(c.name) = lower(btrim(p.category)) OR lower(c.slug) = lower(btrim(p.category))
      LIMIT 1))
  FROM products p WHERE p.id = p_product_id
$$;

-- ---------------------------------------------------------------- categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS gst_type TEXT CHECK (gst_type IS NULL OR gst_type IN ('exempt', 'nil', 'taxable')),
  ADD COLUMN IF NOT EXISTS gst_rate NUMERIC CHECK (gst_rate IS NULL OR (gst_rate >= 0 AND gst_rate <= 28)),
  ADD COLUMN IF NOT EXISTS hsn_code TEXT,
  ADD COLUMN IF NOT EXISTS price_change_limit_pct NUMERIC NOT NULL DEFAULT 25 CHECK (price_change_limit_pct > 0);

-- Fresh meat and fish: exempt (Notification 2/2017-CT(Rate)); confirm with your accountant.
UPDATE public.categories SET gst_type = 'exempt', gst_rate = 0
WHERE gst_type IS NULL AND (slug IN ('lamb', 'poultry', 'seafood') OR name ILIKE '%beef%');
UPDATE public.categories SET hsn_code = '0204' WHERE hsn_code IS NULL AND slug = 'lamb';
UPDATE public.categories SET hsn_code = '0207' WHERE hsn_code IS NULL AND slug = 'poultry';
UPDATE public.categories SET hsn_code = '0302' WHERE hsn_code IS NULL AND slug = 'seafood';
UPDATE public.categories SET hsn_code = '0201' WHERE hsn_code IS NULL AND name ILIKE '%beef%';
UPDATE public.categories SET price_change_limit_pct = 15
WHERE price_change_limit_pct = 25 AND slug IN ('lamb', 'poultry');
UPDATE public.categories SET price_change_limit_pct = 40
WHERE price_change_limit_pct = 25 AND slug = 'seafood';

-- ---------------------------------------------------------------- products: switches + HSN
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_orderable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS preorder_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_order_form BOOLEAN,
  ADD COLUMN IF NOT EXISTS hsn_auto_filled BOOLEAN NOT NULL DEFAULT false;

-- Order-form dropdown starts as "published products" so nothing in use disappears.
UPDATE public.products SET show_in_order_form = is_published WHERE show_in_order_form IS NULL;
ALTER TABLE public.products ALTER COLUMN show_in_order_form SET DEFAULT true;
ALTER TABLE public.products ALTER COLUMN show_in_order_form SET NOT NULL;

-- Fill blank HSN codes in the meat and fish categories (4-digit headings). Existing codes are kept.
-- hsn_auto_filled marks them for a quick review.
WITH cat AS (
  SELECT p.id, p.name, c.slug, c.name AS cname
  FROM products p JOIN categories c ON c.id = public.product_category_id(p.id)
  WHERE coalesce(btrim(p.hsn_code), '') = ''
)
UPDATE public.products p SET hsn_auto_filled = true, hsn_code = CASE
    WHEN cat.slug = 'lamb' AND cat.name ~* '(liver|kidney|brain|spleen|heart|paya|trotter|head|boti|tongue)' THEN '0206'
    WHEN cat.slug = 'lamb' THEN '0204'
    WHEN cat.slug = 'poultry' THEN '0207'
    WHEN cat.cname ILIKE '%beef%' THEN '0201'
    WHEN cat.slug = 'seafood' AND cat.name ~* '(prawn|shrimp|crab|lobster)' THEN '0306'
    WHEN cat.slug = 'seafood' AND cat.name ~* '(squid|clam|mussel|oyster|octopus|cuttle)' THEN '0307'
    WHEN cat.slug = 'seafood' AND cat.name ~* '(fillet|steak|cube)' THEN '0304'
    WHEN cat.slug = 'seafood' THEN '0302'
  END
FROM cat
WHERE p.id = cat.id AND (cat.slug IN ('lamb', 'poultry', 'seafood') OR cat.cname ILIKE '%beef%');

-- ---------------------------------------------------------------- orders: snapshots + delivery date
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS category_name TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_backfilled BOOLEAN NOT NULL DEFAULT false;

UPDATE public.order_items oi
SET category_name = coalesce(c.name, p.category), unit = p.unit, snapshot_backfilled = true
FROM products p LEFT JOIN categories c ON c.id = public.product_category_id(p.id)
WHERE oi.product_id = p.id AND oi.category_name IS NULL AND oi.unit IS NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_date DATE,
  ADD COLUMN IF NOT EXISTS is_preorder BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS opening_time TIME NOT NULL DEFAULT '06:00',
  ADD COLUMN IF NOT EXISTS closing_time TIME NOT NULL DEFAULT '18:00';

-- ---------------------------------------------------------------- product_prices
CREATE TABLE IF NOT EXISTS public.product_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE RESTRICT,
  effective_date DATE NOT NULL,
  purchase_price NUMERIC CHECK (purchase_price IS NULL OR purchase_price >= 0),
  selling_price NUMERIC CHECK (selling_price IS NULL OR selling_price > 0),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'chicken_rate', 'repeat', 'migration', 'bulk_upload')),
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID DEFAULT auth.uid(),
  CONSTRAINT product_prices_one_per_day UNIQUE NULLS NOT DISTINCT (product_id, vendor_id, effective_date),
  CONSTRAINT product_prices_has_a_price CHECK (purchase_price IS NOT NULL OR selling_price IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS product_prices_lookup ON public.product_prices (product_id, effective_date DESC);

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage product prices" ON public.product_prices;
CREATE POLICY "Admins manage product prices" ON public.product_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Selling price shown to customers on a date: the preferred supplier's (or a supplier-less)
-- latest price on or before that date, else any supplier's.
CREATE OR REPLACE FUNCTION public.current_selling_price(p_product_id UUID, p_on DATE DEFAULT NULL)
RETURNS NUMERIC LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT pp.selling_price
  FROM product_prices pp
  LEFT JOIN vendor_products vp
    ON vp.product_id = pp.product_id AND vp.vendor_id = pp.vendor_id AND vp.is_preferred_vendor
  WHERE pp.product_id = p_product_id
    AND pp.selling_price IS NOT NULL
    AND pp.effective_date <= coalesce(p_on, ist_today())
  ORDER BY (pp.vendor_id IS NULL OR vp.id IS NOT NULL) DESC, pp.effective_date DESC, pp.updated_at DESC
  LIMIT 1
$$;

-- Purchase price from a supplier on a date (latest on or before it); NULL supplier = supplier-less rows.
CREATE OR REPLACE FUNCTION public.current_purchase_price(p_product_id UUID, p_vendor_id UUID, p_on DATE DEFAULT NULL)
RETURNS NUMERIC LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT pp.purchase_price FROM product_prices pp
  WHERE pp.product_id = p_product_id AND pp.vendor_id IS NOT DISTINCT FROM p_vendor_id
    AND pp.purchase_price IS NOT NULL AND pp.effective_date <= coalesce(p_on, ist_today())
  ORDER BY pp.effective_date DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.refresh_product_price(p_product_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v NUMERIC := current_selling_price(p_product_id);
BEGIN
  IF v IS NOT NULL THEN
    UPDATE products SET price = v WHERE id = p_product_id AND price IS DISTINCT FROM v;
  END IF;
END;
$$;

-- Picks up future-dated prices on their day (scheduled below when pg_cron is available).
CREATE OR REPLACE FUNCTION public.refresh_all_product_prices()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  FOR r IN SELECT DISTINCT product_id FROM product_prices WHERE effective_date <= ist_today() LOOP
    PERFORM refresh_product_price(r.product_id); n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- Validation. Messages start with PRICE_CHECK so the admin screens can show the override prompt.
CREATE OR REPLACE FUNCTION public.check_product_price()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  prev RECORD;
  lim NUMERIC;
  problems TEXT[] := '{}';
  pct NUMERIC;
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN NEW.updated_by := coalesce(NEW.updated_by, auth.uid());
  ELSE NEW.updated_by := coalesce(auth.uid(), NEW.updated_by); END IF;

  IF NEW.source = 'migration' THEN RETURN NEW; END IF;

  IF NEW.override_reason IS NOT NULL AND btrim(NEW.override_reason) = '' THEN
    NEW.override_reason := NULL;
  END IF;

  IF NEW.selling_price IS NOT NULL AND NEW.purchase_price IS NOT NULL
     AND NEW.selling_price < NEW.purchase_price THEN
    problems := problems || format('Selling price ₹%s is below purchase price ₹%s', NEW.selling_price, NEW.purchase_price);
  END IF;

  SELECT coalesce(c.price_change_limit_pct, 25) INTO lim
  FROM categories c WHERE c.id = product_category_id(NEW.product_id);
  lim := coalesce(lim, 25);

  SELECT purchase_price, selling_price, effective_date INTO prev
  FROM product_prices
  WHERE product_id = NEW.product_id AND vendor_id IS NOT DISTINCT FROM NEW.vendor_id
    AND effective_date < NEW.effective_date
  ORDER BY effective_date DESC LIMIT 1;

  IF FOUND THEN
    IF NEW.purchase_price IS NOT NULL AND prev.purchase_price > 0 THEN
      pct := round((NEW.purchase_price - prev.purchase_price) / prev.purchase_price * 100);
      IF abs(pct) > lim THEN
        problems := problems || format('Purchase price ₹%s is %s%% %s the previous ₹%s (limit %s%%)',
          NEW.purchase_price, abs(pct), CASE WHEN pct > 0 THEN 'above' ELSE 'below' END, prev.purchase_price, lim);
      END IF;
    END IF;
    IF NEW.selling_price IS NOT NULL AND prev.selling_price > 0 THEN
      pct := round((NEW.selling_price - prev.selling_price) / prev.selling_price * 100);
      IF abs(pct) > lim THEN
        problems := problems || format('Selling price ₹%s is %s%% %s the previous ₹%s (limit %s%%)',
          NEW.selling_price, abs(pct), CASE WHEN pct > 0 THEN 'above' ELSE 'below' END, prev.selling_price, lim);
      END IF;
    END IF;
  END IF;

  IF array_length(problems, 1) > 0 THEN
    IF NEW.override_reason IS NULL THEN
      RAISE EXCEPTION 'PRICE_CHECK: %', array_to_string(problems, '; ')
        USING ERRCODE = 'P0001', HINT = 'Confirm with an override reason to save anyway.';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'PRICE_CHECK: only an admin can override: %', array_to_string(problems, '; ')
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- Nothing to override: don't keep a stale reason.
    NEW.override_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_product_price ON public.product_prices;
CREATE TRIGGER check_product_price BEFORE INSERT OR UPDATE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.check_product_price();

CREATE OR REPLACE FUNCTION public.after_product_price_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_product_price(OLD.product_id);
  ELSIF NEW.source <> 'migration' THEN
    PERFORM refresh_product_price(NEW.product_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS after_product_price_change ON public.product_prices;
CREATE TRIGGER after_product_price_change AFTER INSERT OR UPDATE OR DELETE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.after_product_price_change();

-- ---------------------------------------------------------------- audit log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  changes JSONB NOT NULL,
  override_reason TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_record ON public.audit_log (table_name, record_id, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read audit log" ON public.audit_log;
CREATE POLICY "Admins read audit log" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
-- No insert/update/delete policies: only the trigger below (SECURITY DEFINER) writes.

CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o JSONB := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  n JSONB := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  diff JSONB := '{}'::jsonb;
  k TEXT;
BEGIN
  FOR k IN SELECT jsonb_object_keys(o || n) LOOP
    CONTINUE WHEN k IN ('updated_at', 'created_at');
    IF (o -> k) IS DISTINCT FROM (n -> k) THEN
      diff := diff || jsonb_build_object(k, jsonb_build_object('old', o -> k, 'new', n -> k));
    END IF;
  END LOOP;
  IF diff = '{}'::jsonb THEN RETURN NULL; END IF;
  INSERT INTO audit_log (table_name, record_id, action, changes, override_reason, user_id)
  VALUES (TG_TABLE_NAME, coalesce(n ->> 'id', o ->> 'id'), lower(TG_OP), diff,
          CASE WHEN TG_TABLE_NAME = 'product_prices' THEN n ->> 'override_reason' END, auth.uid());
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_products ON public.products;
CREATE TRIGGER audit_products AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
DROP TRIGGER IF EXISTS audit_categories ON public.categories;
CREATE TRIGGER audit_categories AFTER INSERT OR UPDATE OR DELETE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ---------------------------------------------------------------- copy existing prices in
-- (no audit rows for the copy itself; the price audit trigger is created after it)

-- a) Seafood: dated selling prices (no supplier) and dated buying prices per supplier.
DO $$
BEGIN
  IF to_regclass('public.seafood_selling_prices') IS NOT NULL THEN
    INSERT INTO product_prices (product_id, vendor_id, effective_date, selling_price, source)
    SELECT product_id, NULL, effective_date, price, 'migration' FROM seafood_selling_prices
    ON CONFLICT (product_id, vendor_id, effective_date) DO NOTHING;
  END IF;
  IF to_regclass('public.seafood_buying_prices') IS NOT NULL THEN
    INSERT INTO product_prices (product_id, vendor_id, effective_date, purchase_price, source)
    SELECT product_id, vendor_id, effective_date, price, 'migration' FROM seafood_buying_prices
    ON CONFLICT (product_id, vendor_id, effective_date) DO NOTHING;
  END IF;
END $$;

-- b) Chicken (M N Broilers): each saved live-rate day × the multiplier set in force that day,
--    for cuts linked to a product. Selling price only where a selling multiplier was set.
DO $$
DECLARE has_sell BOOLEAN;
BEGIN
  IF to_regclass('public.live_chicken_rates') IS NULL OR to_regclass('public.chicken_cuts') IS NULL
     OR to_regclass('public.chicken_cut_multipliers') IS NULL THEN RETURN; END IF;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chicken_cut_multipliers' AND column_name = 'selling_multiplier')
  INTO has_sell;
  EXECUTE format($q$
    INSERT INTO product_prices (product_id, vendor_id, effective_date, purchase_price, selling_price, source)
    SELECT cc.product_id, '1af69332-a20d-42c0-bc2e-610dbc28d98a'::uuid, r.rate_date,
           round(r.rate * m.multiplier), %s, 'migration'
    FROM live_chicken_rates r
    JOIN chicken_cuts cc ON cc.product_id IS NOT NULL
    JOIN LATERAL (
      SELECT * FROM chicken_cut_multipliers x
      WHERE x.cut_id = cc.id AND x.vendor_id = '1af69332-a20d-42c0-bc2e-610dbc28d98a'::uuid
        AND x.effective_date <= r.rate_date
      ORDER BY x.effective_date DESC LIMIT 1) m ON true
    WHERE m.multiplier IS NOT NULL
    ON CONFLICT (product_id, vendor_id, effective_date) DO NOTHING
  $q$, CASE WHEN has_sell THEN 'CASE WHEN m.selling_multiplier IS NOT NULL THEN round(r.rate * m.selling_multiplier) END' ELSE 'NULL' END);
END $$;

-- c) Every other product: today's catalog price, with the preferred supplier's cost on the same
--    record (tied to that supplier) when there is one.
INSERT INTO product_prices (product_id, vendor_id, effective_date, purchase_price, selling_price, source)
SELECT p.id, vp.vendor_id, public.ist_today(), vp.cost_price,
       CASE WHEN p.price > 0 THEN p.price END, 'migration'
FROM products p
LEFT JOIN LATERAL (
  SELECT x.vendor_id, x.cost_price FROM vendor_products x
  WHERE x.product_id = p.id AND x.cost_price > 0
  ORDER BY x.is_preferred_vendor DESC NULLS LAST, x.created_at LIMIT 1) vp ON true
WHERE NOT EXISTS (SELECT 1 FROM product_prices pp WHERE pp.product_id = p.id)
  AND (p.price > 0 OR vp.cost_price IS NOT NULL)
ON CONFLICT (product_id, vendor_id, effective_date) DO NOTHING;

DROP TRIGGER IF EXISTS audit_product_prices ON public.product_prices;
CREATE TRIGGER audit_product_prices AFTER INSERT OR UPDATE OR DELETE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ---------------------------------------------------------------- daily refresh at 00:05 IST
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'refresh-product-prices';
    PERFORM cron.schedule('refresh-product-prices', '35 18 * * *', 'SELECT public.refresh_all_product_prices()');
  ELSE
    RAISE NOTICE 'pg_cron is not enabled: future-dated prices apply when the next price for that product is saved, or after enabling pg_cron and re-running this migration.';
  END IF;
END $$;
