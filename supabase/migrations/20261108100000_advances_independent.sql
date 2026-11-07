-- Delivery partner advances become a ledger of their own, separate from Expenses.
-- Settling a partner now records only ledger entries; delivery payments are entered in
-- Expenses as before. Nothing already recorded is changed.

CREATE OR REPLACE FUNCTION public.settle_delivery_partner(
  p_partner_id UUID, p_from DATE, p_to DATE, p_charge NUMERIC,
  p_recovery NUMERIC DEFAULT 0, p_payment NUMERIC DEFAULT 0,
  p_paid_by TEXT DEFAULT NULL, p_entry_date DATE DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_day DATE := coalesce(p_entry_date, public.ist_today());
  v_bal RECORD;
BEGIN
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

-- Advances go to individual people, not delivery companies. Remove the companies that were
-- copied in from Expenses, but only where they have no ledger entries.
DELETE FROM public.delivery_partners p
WHERE lower(p.name) IN ('rapido', 'porter', 'uber', 'uber courier', 'uncle delivery', 'dunzo', 'swiggy genie')
  AND NOT EXISTS (SELECT 1 FROM public.partner_ledger l WHERE l.partner_id = p.id);
