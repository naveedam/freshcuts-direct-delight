-- Second lock for database functions. The access settings in 20261108150000 didn't take on the
-- live project (Supabase's own account had granted them, so ours couldn't remove them). Each of
-- these functions now checks its caller itself: it runs only for an admin, or when the database
-- calls it internally (a trigger, the nightly price job, the SQL Editor). Signed-out visitors and
-- customers get "Not allowed". Nothing else changes. Safe to re-run.

CREATE OR REPLACE FUNCTION public.require_internal_or_admin()
RETURNS VOID LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE r TEXT := coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '');
BEGIN
  IF pg_trigger_depth() > 0 OR r NOT IN ('anon', 'authenticated') THEN RETURN; END IF; -- internal
  IF r = 'authenticated' AND public.has_role(auth.uid(), 'admin') THEN RETURN; END IF;
  RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_product_price(p_product_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v NUMERIC := current_selling_price(p_product_id);
BEGIN
  PERFORM public.require_internal_or_admin();
  IF v IS NOT NULL THEN
    UPDATE products SET price = v WHERE id = p_product_id AND price IS DISTINCT FROM v;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_all_product_prices()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  PERFORM public.require_internal_or_admin();
  FOR r IN SELECT DISTINCT product_id FROM product_prices WHERE effective_date <= ist_today() LOOP
    PERFORM refresh_product_price(r.product_id); n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_order_payment(p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  paid NUMERIC;
  o RECORD;
BEGIN
  PERFORM public.require_internal_or_admin();
  SELECT id, total_amount, invoice_cancelled INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  -- No payment rows: leave status alone (prepaid customers' later invoices draw down an advance
  -- recorded on another order); only keep an unpaid order's balance equal to its total.
  IF NOT EXISTS (SELECT 1 FROM customer_payments WHERE order_id = p_order_id) THEN
    UPDATE orders SET balance_due = CASE WHEN coalesce(o.invoice_cancelled, false) THEN 0 ELSE o.total_amount END
    WHERE id = p_order_id AND payment_status = 'unpaid'
      AND balance_due IS DISTINCT FROM (CASE WHEN coalesce(o.invoice_cancelled, false) THEN 0 ELSE o.total_amount END);
    RETURN;
  END IF;
  SELECT coalesce(sum(amount), 0) INTO paid FROM customer_payments WHERE order_id = p_order_id;
  UPDATE orders SET
    amount_paid = paid,
    balance_due = CASE WHEN coalesce(o.invoice_cancelled, false) THEN 0 ELSE o.total_amount - paid END,
    payment_status = CASE
      WHEN coalesce(o.invoice_cancelled, false) THEN payment_status
      WHEN paid >= o.total_amount - 0.01 AND o.total_amount > 0 THEN 'paid'
      WHEN paid > 0 THEN 'partial'
      ELSE 'unpaid' END
  WHERE id = p_order_id
    AND (amount_paid IS DISTINCT FROM paid
      OR balance_due IS DISTINCT FROM (CASE WHEN coalesce(o.invoice_cancelled, false) THEN 0 ELSE o.total_amount - paid END)
      OR payment_status NOT IN ('paid', 'partial', 'unpaid')
      OR payment_status IS DISTINCT FROM (CASE
           WHEN coalesce(o.invoice_cancelled, false) THEN payment_status
           WHEN paid >= o.total_amount - 0.01 AND o.total_amount > 0 THEN 'paid'
           WHEN paid > 0 THEN 'partial' ELSE 'unpaid' END));
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_delivery_partner(
  p_partner_id UUID, p_from DATE, p_to DATE, p_charge NUMERIC,
  p_recovery NUMERIC DEFAULT 0, p_payment NUMERIC DEFAULT 0,
  p_paid_by TEXT DEFAULT NULL, p_entry_date DATE DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_day DATE := coalesce(p_entry_date, public.ist_today());
  v_bal RECORD;
BEGIN
  PERFORM public.require_internal_or_admin();
  -- p_paid_by is kept so older screens still work; it's no longer used.
  IF NOT EXISTS (SELECT 1 FROM delivery_partners WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'Delivery partner not found' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Pick the days being settled' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_charge, 0) < 0 OR coalesce(p_recovery, 0) < 0 OR coalesce(p_payment, 0) < 0 THEN
    RAISE EXCEPTION 'Amounts can''t be negative' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_charge, 0) > 0 THEN
    INSERT INTO partner_ledger (partner_id, entry_date, entry_type, amount, period_from, period_to, notes)
    VALUES (p_partner_id, v_day, 'charge', p_charge, p_from, p_to, p_notes);
  END IF;
  IF coalesce(p_recovery, 0) > 0 THEN
    INSERT INTO partner_ledger (partner_id, entry_date, entry_type, amount, period_from, period_to, notes)
    VALUES (p_partner_id, v_day, 'recovery', p_recovery, p_from, p_to, p_notes);
  END IF;
  IF coalesce(p_payment, 0) > 0 THEN
    INSERT INTO partner_ledger (partner_id, entry_date, entry_type, amount, period_from, period_to, notes)
    VALUES (p_partner_id, v_day, 'payment', p_payment, p_from, p_to, p_notes);
  END IF;

  SELECT * INTO v_bal FROM partner_balances WHERE partner_id = p_partner_id;
  RETURN jsonb_build_object('days', p_to - p_from + 1,
    'advance_balance', v_bal.advance_balance, 'amount_due', v_bal.amount_due);
END;
$$;

CREATE OR REPLACE FUNCTION public.expense_cost_between(p_from DATE, p_to DATE)
RETURNS NUMERIC LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  PERFORM public.require_internal_or_admin();
  RETURN (
    SELECT coalesce(round(sum(
      CASE WHEN spread_from IS NULL THEN amount
           ELSE amount * (least(spread_to, p_to) - greatest(spread_from, p_from) + 1)::numeric
                / (spread_to - spread_from + 1)
      END), 2), 0)
    FROM expenses
    WHERE expense_type <> 'capital'
      AND ((spread_from IS NULL AND expense_date BETWEEN p_from AND p_to)
        OR (spread_from IS NOT NULL AND spread_from <= p_to AND spread_to >= p_from)));
END;
$$;

CREATE OR REPLACE FUNCTION public.current_purchase_price(p_product_id UUID, p_vendor_id UUID, p_on DATE DEFAULT NULL)
RETURNS NUMERIC LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  PERFORM public.require_internal_or_admin();
  RETURN (
    SELECT pp.purchase_price FROM product_prices pp
    WHERE pp.product_id = p_product_id AND pp.vendor_id IS NOT DISTINCT FROM p_vendor_id
      AND pp.purchase_price IS NOT NULL AND pp.effective_date <= coalesce(p_on, ist_today())
    ORDER BY pp.effective_date DESC LIMIT 1);
END;
$$;

-- And take away outside access (repeats 20261108150000, which didn't take effect on the live project).
REVOKE EXECUTE ON FUNCTION public.refresh_product_price(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_all_product_prices() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_order_payment(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expense_cost_between(DATE, DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_purchase_price(UUID, UUID, DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.settle_delivery_partner(UUID, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_internal_or_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_cost_between(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_purchase_price(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_delivery_partner(UUID, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE, TEXT) TO authenticated;

-- Shows who can call each function now (anon and the bare "=X" entry should be gone).
SELECT p.oid::regprocedure AS function, p.proacl AS access
FROM pg_proc p
WHERE p.proname IN ('refresh_product_price', 'refresh_all_product_prices', 'recompute_order_payment',
                    'expense_cost_between', 'current_purchase_price', 'settle_delivery_partner');
