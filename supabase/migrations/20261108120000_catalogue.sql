-- Phase 2: one clean catalogue for chicken, mutton and seafood, with the names given on 8 Nov 2026.
--
-- * Existing products are renamed in place, so their history (orders, prices, suppliers) stays
--   with them. Past orders and invoices keep the name, price and category they were made with:
--   each order line holds its own copy.
-- * Duplicates are merged: their prices and suppliers move to the product that is kept, and the
--   duplicate is switched off (hidden from the shop and order forms). Nothing is deleted.
-- * Only items that don't exist yet are created.
-- * Safe to run more than once.

-- ---------------------------------------------------------------------------------------------
-- Helpers (dropped at the end)
-- ---------------------------------------------------------------------------------------------

-- Merge product p_drop into p_keep, then switch p_drop off.
CREATE OR REPLACE FUNCTION pg_temp.merge_product(p_keep UUID, p_drop UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF p_keep = p_drop OR NOT EXISTS (SELECT 1 FROM products WHERE id = p_drop) THEN RETURN; END IF;
  -- Prices: move those the kept product doesn't already have for that supplier and day.
  DELETE FROM product_prices d
  WHERE d.product_id = p_drop AND EXISTS (
    SELECT 1 FROM product_prices k WHERE k.product_id = p_keep
      AND k.vendor_id IS NOT DISTINCT FROM d.vendor_id AND k.effective_date = d.effective_date);
  UPDATE product_prices SET product_id = p_keep, override_reason = 'Catalogue merge (8 Nov 2026)'
  WHERE product_id = p_drop;
  -- Suppliers.
  INSERT INTO vendor_products (vendor_id, product_id, cost_price, is_preferred_vendor, lead_time_days, minimum_order_quantity, notes)
  SELECT vp.vendor_id, p_keep, vp.cost_price, false, vp.lead_time_days, vp.minimum_order_quantity, vp.notes
  FROM vendor_products vp
  WHERE vp.product_id = p_drop
    AND NOT EXISTS (SELECT 1 FROM vendor_products x WHERE x.product_id = p_keep AND x.vendor_id = vp.vendor_id);
  UPDATE chicken_cuts SET product_id = p_keep WHERE product_id = p_drop;
  PERFORM pg_temp.switch_off(p_drop);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.switch_off(p_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE products SET is_active = false, is_published = false, is_orderable = false, show_in_order_form = false
  WHERE id = p_id;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.rename_product(p_id UUID, p_name TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE products SET name = p_name, is_active = true WHERE id = p_id AND name IS DISTINCT FROM p_name;
END $$;

-- Create a product like p_template (same category, tax, flags and suppliers) unless one with
-- that name already exists. Returns the product's id either way.
CREATE OR REPLACE FUNCTION pg_temp.ensure_product(p_template UUID, p_name TEXT) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE v_id UUID;
BEGIN
  SELECT p.id INTO v_id FROM products p, products t
  WHERE t.id = p_template AND lower(btrim(p.name)) = lower(btrim(p_name))
    AND p.category_id IS NOT DISTINCT FROM t.category_id
  ORDER BY p.is_active DESC, p.created_at LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE products SET is_active = true WHERE id = v_id;
    RETURN v_id;
  END IF;
  INSERT INTO products (name, category, category_id, unit, price, pricing_model, yield_multiplier,
                        is_processed, gst_rate, gst_type, hsn_code, is_published, in_stock,
                        is_active, is_orderable, show_in_order_form, preorder_enabled, awaiting_daily_price)
  SELECT p_name, t.category, t.category_id, t.unit, 0, t.pricing_model, t.yield_multiplier,
         t.is_processed, t.gst_rate, t.gst_type, t.hsn_code, t.is_published, t.in_stock,
         true, t.is_orderable, t.show_in_order_form, t.preorder_enabled, t.awaiting_daily_price
  FROM products t WHERE t.id = p_template
  RETURNING id INTO v_id;
  INSERT INTO vendor_products (vendor_id, product_id, cost_price, is_preferred_vendor)
  SELECT vp.vendor_id, v_id, 0, false FROM vendor_products vp WHERE vp.product_id = p_template;
  RETURN v_id;
END $$;

-- Selling price from today, not tied to a supplier (purchase prices are entered separately).
CREATE OR REPLACE FUNCTION pg_temp.set_selling(p_id UUID, p_price NUMERIC) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO product_prices (product_id, vendor_id, effective_date, selling_price, source, override_reason)
  VALUES (p_id, NULL, public.ist_today(), p_price, 'manual', 'Catalogue rates (8 Nov 2026)')
  ON CONFLICT (product_id, vendor_id, effective_date)
  DO UPDATE SET selling_price = EXCLUDED.selling_price, override_reason = EXCLUDED.override_reason;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Chicken: 14 cuts, one product each, shared by M N Broilers and Bismillah
-- ---------------------------------------------------------------------------------------------

-- Duplicates created from the cut names, merged into the products that hold the order history.
SELECT pg_temp.merge_product('f893b2e4-dbb8-4be5-a6b5-f67d8eca9659', 'a0da0c52-74d1-4c05-85f9-9544a5089a17'); -- Skin Out
SELECT pg_temp.merge_product('6c92d1f3-b07f-4361-abe1-d33efb4a7a06', 'f05ea150-76c0-40d9-8544-8459ae52f0c3'); -- With Skin
SELECT pg_temp.merge_product('3472b515-b873-4141-a673-aac24a991ba5', 'dfb6f296-ae2e-4e31-bdf2-42e1c04aef70'); -- Drumstick Skin Out
SELECT pg_temp.merge_product('3882fa91-e953-4c9b-8ea2-63a125392b4b', 'e29cfad7-7c68-4662-ae74-73ff38175608'); -- Drumstick With Skin
SELECT pg_temp.merge_product('2e1c325f-84ca-41b8-a2a6-6ab4ca54c548', '329c5b02-adf4-44a5-8339-02f5d18b8c44'); -- Leg & Thigh Skin Out
SELECT pg_temp.merge_product('ee8f216a-cbc8-4ef0-838e-a12fd1f91795', 'cb519522-a28a-4799-a9e9-56de29da7839'); -- Leg & Thigh With Skin
SELECT pg_temp.merge_product('ca54470c-b1fa-4ea9-8b9d-4fd4512f017f', '05f217b2-5b4d-4d8a-a892-7527f98759c8'); -- Minced
SELECT pg_temp.merge_product('4fed3529-d859-4ea3-a550-21c75a376079', 'c656e296-0a79-4939-9799-a0c1788e383d'); -- Wings With Skin
-- Chicken Breast, Chicken Boneless and the empty Breast Boneless all become Chicken Breast Fillet.
SELECT pg_temp.merge_product('dcb63371-9904-4f04-9efc-1b5b890ae53a', 'e0082c91-2256-4a85-92dc-2fea96adde6a');
SELECT pg_temp.merge_product('dcb63371-9904-4f04-9efc-1b5b890ae53a', 'c17670ea-11dc-497c-9b57-830ad8715700');
SELECT pg_temp.merge_product('dcb63371-9904-4f04-9efc-1b5b890ae53a', 'bb31e469-b4ca-4f4f-a05d-987714a92969');

SELECT pg_temp.rename_product('f893b2e4-dbb8-4be5-a6b5-f67d8eca9659', 'Chicken Skin Out');
SELECT pg_temp.rename_product('6c92d1f3-b07f-4361-abe1-d33efb4a7a06', 'Chicken With Skin');
SELECT pg_temp.rename_product('3472b515-b873-4141-a673-aac24a991ba5', 'Chicken Drumstick Skin Out');
SELECT pg_temp.rename_product('3882fa91-e953-4c9b-8ea2-63a125392b4b', 'Chicken Drumstick With Skin');
SELECT pg_temp.rename_product('2e1c325f-84ca-41b8-a2a6-6ab4ca54c548', 'Chicken Leg & Thigh Skin Out');
SELECT pg_temp.rename_product('ee8f216a-cbc8-4ef0-838e-a12fd1f91795', 'Chicken Leg & Thigh With Skin');
SELECT pg_temp.rename_product('2be70535-2db3-4d17-9f4c-3f56f0f37687', 'Chicken Lollipop Skin Out');
SELECT pg_temp.rename_product('9e561645-2988-465d-be3e-7c4e7c937437', 'Chicken Lollipop With Skin');
SELECT pg_temp.rename_product('703dad31-c175-4850-b411-bb129cb8054b', 'Chicken Wings Skin Out');
SELECT pg_temp.rename_product('4fed3529-d859-4ea3-a550-21c75a376079', 'Chicken Wings With Skin');
SELECT pg_temp.rename_product('ca54470c-b1fa-4ea9-8b9d-4fd4512f017f', 'Chicken Minced');
SELECT pg_temp.rename_product('dcb63371-9904-4f04-9efc-1b5b890ae53a', 'Chicken Breast Fillet');
SELECT pg_temp.rename_product('57d372eb-3563-44e3-ac5e-6ad983df15ab', 'Chicken Thigh Boneless');
SELECT pg_temp.rename_product('58bc1a82-afdd-43a1-8743-f5d156e1f200', 'Chicken Boneless With Skin');

-- The breast cut takes the product's name, and every cut is linked to its product, so the
-- M N Broilers live rate prices all 14.
UPDATE chicken_cuts SET name = 'Chicken Breast Fillet' WHERE name = 'Chicken Breast Boneless';

DROP TABLE IF EXISTS pg_temp.cut_links;
CREATE TEMP TABLE cut_links (cut_name TEXT, product_id UUID);
INSERT INTO cut_links VALUES
  ('Chicken Skin Out', 'f893b2e4-dbb8-4be5-a6b5-f67d8eca9659'),
  ('Chicken With Skin', '6c92d1f3-b07f-4361-abe1-d33efb4a7a06'),
  ('Chicken Drumstick Skin Out', '3472b515-b873-4141-a673-aac24a991ba5'),
  ('Chicken Drumstick With Skin', '3882fa91-e953-4c9b-8ea2-63a125392b4b'),
  ('Chicken Leg & Thigh Skin Out', '2e1c325f-84ca-41b8-a2a6-6ab4ca54c548'),
  ('Chicken Leg & Thigh With Skin', 'ee8f216a-cbc8-4ef0-838e-a12fd1f91795'),
  ('Chicken Lollipop Skin Out', '2be70535-2db3-4d17-9f4c-3f56f0f37687'),
  ('Chicken Lollipop With Skin', '9e561645-2988-465d-be3e-7c4e7c937437'),
  ('Chicken Wings Skin Out', '703dad31-c175-4850-b411-bb129cb8054b'),
  ('Chicken Wings With Skin', '4fed3529-d859-4ea3-a550-21c75a376079'),
  ('Chicken Minced', 'ca54470c-b1fa-4ea9-8b9d-4fd4512f017f'),
  ('Chicken Breast Fillet', 'dcb63371-9904-4f04-9efc-1b5b890ae53a'),
  ('Chicken Thigh Boneless', '57d372eb-3563-44e3-ac5e-6ad983df15ab'),
  ('Chicken Boneless With Skin', '58bc1a82-afdd-43a1-8743-f5d156e1f200');

UPDATE chicken_cuts c SET product_id = l.product_id
FROM cut_links l WHERE lower(btrim(c.name)) = lower(l.cut_name) AND c.product_id IS DISTINCT FROM l.product_id;

-- All 14 can be bought from both M N Broilers and Bismillah (and keep their other suppliers).
INSERT INTO vendor_products (vendor_id, product_id, cost_price, is_preferred_vendor)
SELECT v.id, l.product_id, 0, false
FROM cut_links l
CROSS JOIN (SELECT id FROM vendors WHERE id = '1af69332-a20d-42c0-bc2e-610dbc28d98a'
            UNION SELECT id FROM vendors WHERE name ILIKE 'Bismillah%') v
WHERE NOT EXISTS (SELECT 1 FROM vendor_products x WHERE x.vendor_id = v.id AND x.product_id = l.product_id);

-- M N Broilers buying price for today's live rate on the newly linked cuts (the screen fills in
-- the rest whenever a rate or multiplier is saved).
INSERT INTO product_prices (product_id, vendor_id, effective_date, purchase_price, source, override_reason)
SELECT c.product_id, '1af69332-a20d-42c0-bc2e-610dbc28d98a', r.rate_date,
       round(r.rate * m.multiplier), 'chicken_rate', 'Catalogue: cut linked (8 Nov 2026)'
FROM chicken_cuts c
JOIN LATERAL (SELECT rate_date, rate FROM live_chicken_rates
              WHERE rate_date <= public.ist_today() ORDER BY rate_date DESC LIMIT 1) r ON true
JOIN LATERAL (SELECT multiplier FROM chicken_cut_multipliers m
              WHERE m.cut_id = c.id AND m.vendor_id = '1af69332-a20d-42c0-bc2e-610dbc28d98a'
                AND m.effective_date <= r.rate_date AND m.multiplier IS NOT NULL
              ORDER BY m.effective_date DESC LIMIT 1) m ON true
WHERE c.product_id IS NOT NULL
ON CONFLICT (product_id, vendor_id, effective_date)
DO UPDATE SET purchase_price = EXCLUDED.purchase_price
WHERE product_prices.purchase_price IS NULL;

-- Cuts with no selling price yet stay off the shop (shown as "No price yet") until one is set.
UPDATE products SET awaiting_daily_price = true
WHERE id IN (SELECT product_id FROM cut_links) AND coalesce(price, 0) <= 0 AND NOT awaiting_daily_price;

-- ---------------------------------------------------------------------------------------------
-- Mutton: 17 items with their selling rates
-- ---------------------------------------------------------------------------------------------

SELECT pg_temp.merge_product('ad5fe7a6-745a-432e-9edf-d5d9a270bb13', 'de1c3a0a-fabc-4532-9f6d-0623a576a422'); -- duplicate Tender Lamb Shanks
SELECT pg_temp.switch_off('5c6555b7-7e0e-4642-8863-65e482e0ded1');                                         -- Goat - Heart, Liver, Kidney

SELECT pg_temp.rename_product('5787b421-207c-4beb-a5d4-e30f0523ef79', 'Mutton');
SELECT pg_temp.rename_product('7a80660a-1197-4b3c-bd1a-a1261af012a4', 'Goat Meat');
SELECT pg_temp.rename_product('4794abb0-6d03-4c5a-9f20-02a84ee5e4c5', 'Mutton Boneless');
SELECT pg_temp.rename_product('0906794e-9ecb-4604-9978-d7a15a2dd18d', 'Mutton Minced / Kheema');
SELECT pg_temp.rename_product('2737d5c2-f7c0-49e2-876d-9cd8c0ec5063', 'Goat Minced / Kheema');
SELECT pg_temp.rename_product('fd6cdd6d-7140-4a16-a97e-143d7a10cd22', 'Mutton Chops');
SELECT pg_temp.rename_product('ccea8075-e8bb-4f47-a2ab-42defe0ce5be', 'Goat Chops');
SELECT pg_temp.rename_product('8bbb52d9-63ef-446f-8ee7-bb36457ebd06', 'Mutton Spleen');
SELECT pg_temp.rename_product('31fc0a85-05e5-4b78-93c6-23621b2ed368', 'Mutton Liver');
SELECT pg_temp.rename_product('ad5fe7a6-745a-432e-9edf-d5d9a270bb13', 'Tender Lamb Shanks');
SELECT pg_temp.rename_product('4b833409-96f4-4a06-a604-15c6db918502', 'Paya / Trotters');
SELECT pg_temp.rename_product('68d32247-229d-4bcf-bec5-1f03b60a8742', 'Kidneys / Gurda');
SELECT pg_temp.rename_product('3da4d07a-a4f7-4974-a6f8-f8b44c78135c', 'Brain / Bheja');
-- Bheja is sold per piece.
UPDATE products SET pricing_model = 'unit_based', unit = 'piece'
WHERE id = '3da4d07a-a4f7-4974-a6f8-f8b44c78135c' AND (pricing_model <> 'unit_based' OR unit <> 'piece');

DO $$
DECLARE
  goat CONSTANT UUID := '7a80660a-1197-4b3c-bd1a-a1261af012a4';
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('Mutton', 970), ('Goat Meat', 970), ('Mutton Boneless', 1320), ('Goat Boneless', 1320),
    ('Mutton Minced / Kheema', 1320), ('Goat Minced / Kheema', 1320), ('Mutton Chops', 970),
    ('Goat Chops', 970), ('Mutton Spleen', 970), ('Goat Spleen', 970), ('Mutton Liver', 780),
    ('Goat Liver', 780), ('Goat Head', 575), ('Tender Lamb Shanks', 970), ('Paya / Trotters', 1280),
    ('Kidneys / Gurda', 970), ('Brain / Bheja', 180)
  ) AS t(name, rate)
  LOOP
    PERFORM pg_temp.set_selling(pg_temp.ensure_product(goat, r.name), r.rate);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Seafood: 55 items (prices come from the daily seafood sheet)
-- ---------------------------------------------------------------------------------------------

SELECT pg_temp.switch_off('cc59c85a-3261-4934-9629-1db6e77cf4d0'); -- Salmon
SELECT pg_temp.switch_off('75615968-bf90-41a8-ab22-ff15720f8394'); -- Fresh Sea Bass
SELECT pg_temp.switch_off('06eaea20-04e2-47d9-b8bc-75c7d1b43bf1'); -- Live Maine Lobster
SELECT pg_temp.switch_off('92d52b38-98d1-45c6-b55a-c783aef97b38'); -- Mussels

SELECT pg_temp.rename_product('f4d3cd6f-e0de-42dd-adc5-f373ba8d71ff', 'Adumeen / Parwa');
SELECT pg_temp.rename_product('e87c74af-a314-40ee-8781-d62469280ffa', 'Anchovies / Nethili');
SELECT pg_temp.rename_product('dfdd8fec-69c5-4b09-a5e2-4b78c11d6afc', 'Atlantic Salmon Cut Pieces');
SELECT pg_temp.rename_product('9db3581a-0d0c-49ab-8cab-d6bd131b2eef', 'Barracuda / Sheela');
SELECT pg_temp.rename_product('cd423573-5812-4b53-90a3-89ffbc852236', 'Bombay Duck / Bombil');
SELECT pg_temp.rename_product('57542851-27ac-4cfc-ac5e-e8933a6d36dd', 'Clams');
SELECT pg_temp.rename_product('58218803-9563-483f-9be6-e804cb3967f9', 'Katla');
SELECT pg_temp.rename_product('dbdcdf94-11ea-41a1-9950-88f519c8c643', 'King Fish / Modha');
SELECT pg_temp.rename_product('6be1273a-72d6-44e6-970d-0600ced851f8', 'Lady Fish / Kaane');
SELECT pg_temp.rename_product('c397981b-01dc-4fbb-8c42-59540836d5c5', 'Lobsters');
SELECT pg_temp.rename_product('d405ad22-acb5-4fa0-a1f7-19e1b810dd05', 'Mackerel / Bangda');
SELECT pg_temp.rename_product('d7582d81-6ed2-4e24-a93c-ed8acf531be2', 'Pearl Spot / Karimeen');
SELECT pg_temp.rename_product('6335cb60-6db5-441f-b2e4-8dfd6ce6a90f', 'Pink Perch / Shankara');
SELECT pg_temp.rename_product('26c71432-cfcb-4d85-9054-d409d5a57c72', 'Prawns - Medium');
SELECT pg_temp.rename_product('a90a2ff8-c947-449a-9657-47a4c2664e8c', 'Sardines / Mathi');
SELECT pg_temp.rename_product('62746e2d-0539-4aa3-8dbb-11c6c7afe8ea', 'Seabass / Bhetki');
SELECT pg_temp.rename_product('6e5b9b45-f22f-4425-9e28-bbdaf561689b', 'Seer Fish Slices');
SELECT pg_temp.rename_product('eb3b261c-399f-4b47-8ef0-6dec0b477a6d', 'Silver Fish / Veluri');
SELECT pg_temp.rename_product('393ef470-43c7-4788-ae2e-23220552f7fe', 'Tiger Prawns');

-- Bombay Duck had no suppliers; give it the fish stalls like the rest.
INSERT INTO vendor_products (vendor_id, product_id, cost_price, is_preferred_vendor)
SELECT vp.vendor_id, 'cd423573-5812-4b53-90a3-89ffbc852236', 0, false
FROM vendor_products vp WHERE vp.product_id = '4e567da6-53fd-47d6-85d5-6f8c10a24af0' -- Basa
  AND NOT EXISTS (SELECT 1 FROM vendor_products x
                  WHERE x.product_id = 'cd423573-5812-4b53-90a3-89ffbc852236' AND x.vendor_id = vp.vendor_id);

-- New items, set up like Basa (same category, tax, suppliers and daily-price behaviour).
DO $$
DECLARE n TEXT;
BEGIN
  FOREACH n IN ARRAY ARRAY[
    'Atlantic Salmon Whole', 'Black Salmon', 'Emperor / Palu', 'King Fish / Modha Cut Pieces',
    'Mud Crabs', 'Poomeen', 'Prachi', 'Prawns - Big', 'Seer Fish / Anjal', 'Sole Fish',
    'Tilapia', 'Yellow Fin Tuna'
  ] LOOP
    PERFORM pg_temp.ensure_product('4e567da6-53fd-47d6-85d5-6f8c10a24af0', n);
  END LOOP;
END $$;

-- New fish with no price yet stay off the shop until the day's sheet prices them.
UPDATE products SET awaiting_daily_price = true
WHERE category_id = (SELECT category_id FROM products WHERE id = '4e567da6-53fd-47d6-85d5-6f8c10a24af0')
  AND is_active AND coalesce(price, 0) <= 0 AND NOT awaiting_daily_price;

-- ---------------------------------------------------------------------------------------------
-- Report: the catalogue as it now stands
-- ---------------------------------------------------------------------------------------------
SELECT c.name AS category, p.name, p.unit,
       CASE WHEN p.is_active THEN 'active' ELSE 'switched off' END AS status,
       p.price AS selling_price
FROM products p LEFT JOIN categories c ON c.id = p.category_id
WHERE p.category_id IN (SELECT category_id FROM products WHERE id IN (
        'f893b2e4-dbb8-4be5-a6b5-f67d8eca9659', '7a80660a-1197-4b3c-bd1a-a1261af012a4', '4e567da6-53fd-47d6-85d5-6f8c10a24af0'))
ORDER BY 1, p.is_active DESC, 2;
