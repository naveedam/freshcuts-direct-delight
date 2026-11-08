-- FreshCuts security check. It changes nothing: every test change is undone immediately. Run in the Supabase SQL Editor. It pretends to be (1) a signed-out
-- visitor, (2) a signed-in customer who isn't an admin and (3) an admin, tries to read and change
-- each table, and lists the results. Every row should say OK.

SELECT set_config('rls.out', '', false);
SELECT set_config('rls.admin', coalesce((SELECT user_id::text FROM public.user_roles WHERE role = 'admin' LIMIT 1), ''), false);

-- Shared checker, removed at the end.
CREATE OR REPLACE FUNCTION public.zz_rls_probe(who TEXT, tbl TEXT, expect_read BOOLEAN, expect_write BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE n BIGINT; w BIGINT; rd TEXT; wr TEXT; has_id BOOLEAN;
BEGIN
  IF to_regclass('public.' || tbl) IS NULL THEN RETURN; END IF;
  BEGIN
    EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO n;
  EXCEPTION WHEN insufficient_privilege THEN n := 0;
  END;
  -- Must see nothing when it shouldn't read; any count is fine when it may.
  IF NOT expect_read AND n > 0 THEN rd := 'PROBLEM'; ELSE rd := 'OK'; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'id') INTO has_id;
  w := 0; wr := 'n/a';
  IF has_id AND (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.' || tbl)) = 'r' THEN
    -- Try the change, count the rows it would touch, then undo it straight away.
    BEGIN
      EXECUTE format('UPDATE public.%I SET id = id', tbl);
      GET DIAGNOSTICS w = ROW_COUNT;
      RAISE EXCEPTION 'zz_undo';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'zz_undo' THEN w := 0; END IF;
    END;
    IF NOT expect_write AND w > 0 THEN wr := 'PROBLEM'; ELSE wr := 'OK'; END IF;
  END IF;

  PERFORM set_config('rls.out', current_setting('rls.out') || format(E'%s|%s|sees %s rows: %s|can change %s rows: %s\n',
    who, tbl, n, rd, w, wr), false);
END $$;
GRANT EXECUTE ON FUNCTION public.zz_rls_probe(TEXT, TEXT, BOOLEAN, BOOLEAN) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.zz_rls_run(who TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE admin BOOLEAN := who LIKE '%admin'; t TEXT;
BEGIN
  -- Admin-only data: nobody else may read or change it.
  FOREACH t IN ARRAY ARRAY['product_prices', 'audit_log', 'delivery_partners', 'partner_ledger', 'partner_balances',
    'current_product_prices', 'expenses', 'vendors', 'vendor_products', 'customer_payments', 'live_mutton_rates',
    'mutton_cuts', 'mutton_cut_multipliers', 'daily_rate_settings', 'seafood_buying_prices', 'chicken_cut_multipliers',
    'purchase_orders', 'user_roles', 'orders', 'order_items'] LOOP
    PERFORM public.zz_rls_probe(who, t, admin, admin);
  END LOOP;
  -- Shop data: anyone may read, only admins may change.
  FOREACH t IN ARRAY ARRAY['products', 'categories', 'seafood_selling_prices', 'seafood_price_publications'] LOOP
    PERFORM public.zz_rls_probe(who, t, true, admin);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.zz_rls_run(TEXT) TO anon, authenticated;

-- 1. Signed-out visitor
SELECT set_config('request.jwt.claims', '{"role":"anon"}', false), set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT public.zz_rls_run('1 signed-out');
RESET ROLE;

-- 2. Signed-in customer, not an admin (a made-up user id)
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000c0de"}', false),
       set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c0de', false);
SET ROLE authenticated;
SELECT public.zz_rls_run('2 customer');
RESET ROLE;

-- 3. Admin (your first admin account): should see and change everything
SELECT set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', current_setting('rls.admin'))::text, false),
       set_config('request.jwt.claim.sub', current_setting('rls.admin'), false);
SET ROLE authenticated;
SELECT public.zz_rls_run('3 admin');
RESET ROLE;

-- Function access: actually call each one as a signed-out visitor and as a customer.
CREATE OR REPLACE FUNCTION public.zz_fn_probe(who TEXT, call TEXT, should_work BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE outcome TEXT;
BEGIN
  BEGIN
    EXECUTE call;
    outcome := 'ran';
    RAISE EXCEPTION 'zz_undo';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'zz_undo' THEN outcome := 'ran';
    ELSIF SQLSTATE = '42501' THEN outcome := 'refused';
    ELSE outcome := 'ran (' || left(SQLERRM, 60) || ')';
    END IF;
  END;
  PERFORM set_config('rls.out', current_setting('rls.out') || format(E'%s|%s|%s|%s\n', who, call, outcome,
    CASE WHEN (outcome = 'refused') = NOT should_work THEN 'OK' ELSE 'PROBLEM' END), false);
END $$;
GRANT EXECUTE ON FUNCTION public.zz_fn_probe(TEXT, TEXT, BOOLEAN) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.zz_fn_run(who TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE c TEXT; z CONSTANT TEXT := '''00000000-0000-0000-0000-000000000000''';
BEGIN
  FOREACH c IN ARRAY ARRAY[
    'SELECT public.refresh_all_product_prices()',
    'SELECT public.refresh_product_price(' || z || ')',
    'SELECT public.recompute_order_payment(' || z || ')',
    'SELECT public.expense_cost_between(current_date, current_date)',
    'SELECT public.current_purchase_price(' || z || ', NULL, NULL)',
    'SELECT public.settle_delivery_partner(' || z || ', current_date, current_date, 1, 0, 0, NULL, NULL, NULL)'
  ] LOOP
    PERFORM public.zz_fn_probe(who, c, false);
  END LOOP;
  PERFORM public.zz_fn_probe(who, 'SELECT public.get_business_hours()', true);
END $$;
GRANT EXECUTE ON FUNCTION public.zz_fn_run(TEXT) TO anon, authenticated;

SELECT set_config('request.jwt.claims', '{"role":"anon"}', false), set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT public.zz_fn_run('4 signed-out calls');
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000c0de"}', false),
       set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c0de', false);
SET ROLE authenticated;
SELECT public.zz_fn_run('5 customer calls');
RESET ROLE;

-- Clean up and show the report.
SELECT set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.sub', '', false);
DROP FUNCTION public.zz_rls_run(TEXT);
DROP FUNCTION public.zz_fn_run(TEXT);
DROP FUNCTION public.zz_fn_probe(TEXT, TEXT, BOOLEAN);
DROP FUNCTION public.zz_rls_probe(TEXT, TEXT, BOOLEAN, BOOLEAN);

SELECT split_part(line, '|', 1) AS who, split_part(line, '|', 2) AS what,
       split_part(line, '|', 3) AS reading, split_part(line, '|', 4) AS changing
FROM regexp_split_to_table(rtrim(current_setting('rls.out'), E'\n'), E'\n') AS line
ORDER BY (line LIKE '%PROBLEM%') DESC, 1, 2;
