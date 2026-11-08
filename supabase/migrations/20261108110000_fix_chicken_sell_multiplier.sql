-- Fix chicken selling prices worked out from a selling multiplier that was really a price
-- (e.g. 370 typed in "Sell ×", giving 143 × 370 = ₹52,910), and stop it happening again.
-- Past orders and invoices are untouched: they keep their own prices.

-- 1. What will be corrected (kept for the report at the end).
DROP TABLE IF EXISTS fix_report;
CREATE TEMP TABLE fix_report AS
SELECT 'sell multiplier cleared' AS fix, c.name AS item, m.effective_date AS from_date,
       m.selling_multiplier::text AS old_value
FROM chicken_cut_multipliers m JOIN chicken_cuts c ON c.id = m.cut_id
WHERE m.selling_multiplier > 10;

INSERT INTO fix_report
SELECT 'selling price removed', p.name, pp.effective_date, pp.selling_price::text
FROM product_prices pp JOIN products p ON p.id = pp.product_id
WHERE pp.selling_price > 10 * pp.purchase_price AND pp.purchase_price > 0;

-- 2. Clear the wrong multipliers; the selling price then stays as it was (blank = unchanged).
UPDATE chicken_cut_multipliers SET selling_multiplier = NULL WHERE selling_multiplier > 10;

-- 3. Clear the selling prices worked out from them (the purchase prices are right and stay).
DROP TABLE IF EXISTS fixed_products;
CREATE TEMP TABLE fixed_products AS
SELECT DISTINCT product_id, selling_price AS bad_price FROM product_prices
WHERE selling_price > 10 * purchase_price AND purchase_price > 0;

UPDATE product_prices SET selling_price = NULL,
  override_reason = 'Correction: selling multiplier entered as a price'
WHERE selling_price > 10 * purchase_price AND purchase_price > 0;

-- 4. Put each product's shop price back. Prefer the latest remaining selling price; otherwise the
--    price it had just before the wrong one, from the change log.
UPDATE products p SET price = coalesce(
  current_selling_price(p.id),
  (SELECT (a.changes -> 'price' ->> 'old')::numeric FROM audit_log a
   WHERE a.table_name = 'products' AND a.record_id = p.id::text
     AND (a.changes -> 'price' ->> 'new')::numeric IN (SELECT bad_price FROM fixed_products f WHERE f.product_id = p.id)
   ORDER BY a.created_at LIMIT 1),
  p.price)
WHERE p.id IN (SELECT product_id FROM fixed_products);

INSERT INTO fix_report
SELECT 'shop price now', p.name, NULL, p.price::text FROM products p
WHERE p.id IN (SELECT product_id FROM fixed_products);

-- 5. Multipliers above 10 are refused from now on (existing buy multipliers aren't re-checked).
DO $$ BEGIN
  ALTER TABLE chicken_cut_multipliers ADD CONSTRAINT chicken_multiplier_sane
    CHECK (multiplier IS NULL OR multiplier <= 10) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE chicken_cut_multipliers ADD CONSTRAINT chicken_selling_multiplier_sane
    CHECK (selling_multiplier IS NULL OR selling_multiplier <= 10) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6. Price check: also flag a selling price over 5 times cost, and compare a supplier's first
--    selling price with the product's current price (it used to skip that case).
CREATE OR REPLACE FUNCTION public.check_product_price()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  prev RECORD;
  lim NUMERIC;
  problems TEXT[] := '{}';
  pct NUMERIC;
  base_price NUMERIC;
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN NEW.updated_by := coalesce(NEW.updated_by, auth.uid());
  ELSE NEW.updated_by := coalesce(auth.uid(), NEW.updated_by); END IF;

  IF NEW.source = 'migration' THEN RETURN NEW; END IF;

  IF NEW.override_reason IS NOT NULL AND btrim(NEW.override_reason) = '' THEN
    NEW.override_reason := NULL;
  END IF;

  -- A selling price many times the cost is almost always a typing mistake (a price entered
  -- where a multiplier was expected).
  IF NEW.selling_price IS NOT NULL AND NEW.purchase_price > 0
     AND NEW.selling_price > NEW.purchase_price * 5 THEN
    problems := problems || format('Selling price ₹%s is more than 5 times the purchase price ₹%s', NEW.selling_price, NEW.purchase_price);
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

  -- First selling price from this supplier: compare with the product's current selling price.
  IF NEW.selling_price IS NOT NULL AND (NOT FOUND OR prev.selling_price IS NULL) THEN
    SELECT price INTO base_price FROM products WHERE id = NEW.product_id;
    IF base_price > 0 THEN
      pct := round((NEW.selling_price - base_price) / base_price * 100);
      IF abs(pct) > lim THEN
        problems := problems || format('Selling price ₹%s is %s%% %s the current ₹%s (limit %s%%)',
          NEW.selling_price, abs(pct), CASE WHEN pct > 0 THEN 'above' ELSE 'below' END, base_price, lim);
      END IF;
    END IF;
  END IF;

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


SELECT * FROM fix_report ORDER BY fix, item;
