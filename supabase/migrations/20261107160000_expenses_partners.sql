-- Step 7: expense types (so bulk packaging and monthly bills don't sink one day's profit) and a
-- ledger for delivery partners paid in advance. Safe to re-run.

-- 1. Expense type and the period an expense is spread over.
--    daily     : counted on its date (delivery, ice, fuel)
--    packaging : boxes, covers, labels bought in bulk; spread over the period chosen
--    overhead  : electricity, water, rent, internet; spread over the period it covers
--    capital   : freezer, scale; not part of daily profit (shown in the monthly view)
--    Any type can carry a spread period (e.g. two days of delivery charges paid together).
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS expense_type TEXT NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS spread_from DATE,
  ADD COLUMN IF NOT EXISTS spread_to DATE;

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_expense_type_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_expense_type_check
  CHECK (expense_type IN ('daily', 'packaging', 'overhead', 'capital'));
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_spread_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_spread_check
  CHECK ((spread_from IS NULL AND spread_to IS NULL) OR (spread_from IS NOT NULL AND spread_to >= spread_from));

-- Cost counted between two dates (inclusive): daily expenses on their date, spread expenses by
-- their share of days in the range, capital purchases excluded.
CREATE OR REPLACE FUNCTION public.expense_cost_between(p_from DATE, p_to DATE)
RETURNS NUMERIC LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(round(sum(
    CASE WHEN spread_from IS NULL THEN amount
         ELSE amount * (least(spread_to, p_to) - greatest(spread_from, p_from) + 1)::numeric
              / (spread_to - spread_from + 1)
    END), 2), 0)
  FROM expenses
  WHERE expense_type <> 'capital'
    AND ((spread_from IS NULL AND expense_date BETWEEN p_from AND p_to)
      OR (spread_from IS NOT NULL AND spread_from <= p_to AND spread_to >= p_from))
$$;
GRANT EXECUTE ON FUNCTION public.expense_cost_between(DATE, DATE) TO authenticated;

-- 2. Delivery partners and their ledger.
--    advance  : money given in advance (not an expense)
--    charge   : delivery charges earned (also recorded as a Delivery expense)
--    recovery : charges settled out of the advance
--    payment  : charges paid in cash or UPI
--    Advance held by the partner = advances - recoveries; still owed to the partner = charges - recoveries - payments.
CREATE TABLE IF NOT EXISTS public.delivery_partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES public.delivery_partners(id) ON DELETE RESTRICT,
  entry_date DATE NOT NULL DEFAULT public.ist_today(),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('advance', 'charge', 'recovery', 'payment')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  period_from DATE,
  period_to DATE,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_ledger_partner ON public.partner_ledger (partner_id, entry_date);

ALTER TABLE public.delivery_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage delivery partners" ON public.delivery_partners;
CREATE POLICY "Admins manage delivery partners" ON public.delivery_partners FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins manage partner ledger" ON public.partner_ledger;
CREATE POLICY "Admins manage partner ledger" ON public.partner_ledger FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE VIEW public.partner_balances WITH (security_invoker = true) AS
SELECT p.id AS partner_id,
  coalesce(sum(l.amount) FILTER (WHERE l.entry_type = 'advance'), 0)
    - coalesce(sum(l.amount) FILTER (WHERE l.entry_type = 'recovery'), 0) AS advance_balance,
  coalesce(sum(l.amount) FILTER (WHERE l.entry_type = 'charge'), 0)
    - coalesce(sum(l.amount) FILTER (WHERE l.entry_type IN ('recovery', 'payment')), 0) AS amount_due,
  max(l.period_to) FILTER (WHERE l.entry_type = 'charge') AS settled_up_to
FROM public.delivery_partners p
LEFT JOIN public.partner_ledger l ON l.partner_id = p.id
GROUP BY p.id;

-- A recovery can't take more than the advance the partner holds.
CREATE OR REPLACE FUNCTION public.check_partner_recovery()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE held NUMERIC;
BEGIN
  IF NEW.entry_type <> 'recovery' THEN RETURN NEW; END IF;
  SELECT coalesce(sum(amount) FILTER (WHERE entry_type = 'advance'), 0)
       - coalesce(sum(amount) FILTER (WHERE entry_type = 'recovery'), 0)
  INTO held FROM partner_ledger WHERE partner_id = NEW.partner_id AND id IS DISTINCT FROM NEW.id;
  IF NEW.amount > held + 0.001 THEN
    RAISE EXCEPTION 'Can''t recover ₹% from an advance of ₹%', NEW.amount, held USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_partner_recovery ON public.partner_ledger;
CREATE TRIGGER check_partner_recovery BEFORE INSERT OR UPDATE ON public.partner_ledger
  FOR EACH ROW EXECUTE FUNCTION public.check_partner_recovery();

-- Start the list from the delivery names already used in Expenses.
INSERT INTO public.delivery_partners (name)
SELECT DISTINCT btrim(sub_category) FROM public.expenses
WHERE category = 'Delivery' AND coalesce(btrim(sub_category), '') NOT IN ('', 'Other')
ON CONFLICT (name) DO NOTHING;

-- Settle a partner for a run of days in one go: the delivery cost goes into Expenses (spread
-- over those days), and the ledger records the charge, what came out of the advance, and what
-- was paid. All or nothing, so a failed step never leaves half a settlement behind.
CREATE OR REPLACE FUNCTION public.settle_delivery_partner(
  p_partner_id UUID, p_from DATE, p_to DATE, p_charge NUMERIC,
  p_recovery NUMERIC DEFAULT 0, p_payment NUMERIC DEFAULT 0,
  p_paid_by TEXT DEFAULT 'bank', p_entry_date DATE DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_name TEXT; v_expense UUID; v_day DATE := coalesce(p_entry_date, public.ist_today());
  v_days INT; v_bal RECORD;
BEGIN
  SELECT name INTO v_name FROM delivery_partners WHERE id = p_partner_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Delivery partner not found' USING ERRCODE = '22023'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'Pick the days being settled' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_charge, 0) < 0 OR coalesce(p_recovery, 0) < 0 OR coalesce(p_payment, 0) < 0 THEN
    RAISE EXCEPTION 'Amounts can''t be negative' USING ERRCODE = '22023';
  END IF;
  v_days := p_to - p_from + 1;

  IF coalesce(p_charge, 0) > 0 THEN
    INSERT INTO expenses (expense_date, category, sub_category, amount, paid_by, payee, notes,
                          expense_type, spread_from, spread_to)
    VALUES (v_day, 'Delivery', v_name, p_charge, coalesce(p_paid_by, 'bank'), v_name,
            coalesce(p_notes, format('Delivery for %s day(s), %s to %s', v_days, p_from, p_to)),
            'daily', p_from, p_to)
    RETURNING id INTO v_expense;
    INSERT INTO partner_ledger (partner_id, entry_date, entry_type, amount, period_from, period_to, expense_id, notes)
    VALUES (p_partner_id, v_day, 'charge', p_charge, p_from, p_to, v_expense, p_notes);
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
  RETURN jsonb_build_object('expense_id', v_expense, 'days', v_days,
    'advance_balance', v_bal.advance_balance, 'amount_due', v_bal.amount_due);
END;
$$;
GRANT EXECUTE ON FUNCTION public.settle_delivery_partner(UUID, DATE, DATE, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE, TEXT) TO authenticated;
