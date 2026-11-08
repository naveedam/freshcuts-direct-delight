-- Phase 4: the delivery partner advance ledger. Kept apart from Expenses: nothing here creates,
-- changes or counts an expense. Safe to re-run.
--
-- Entry types and their effect:
--   opening   advance the partner already held when tracking started  -> advance held +
--   advance   additional advance given                                -> advance held +
--   charge    amount earned for one or more delivery days             -> owed to partner +
--   recovery  amount deducted from the advance against what's owed    -> advance held -, owed -
--   payment   amount paid to the partner                              -> owed -
-- Net position = advance held - owed to partner (positive: the partner holds our money).

ALTER TABLE public.partner_ledger DROP CONSTRAINT IF EXISTS partner_ledger_entry_type_check;
ALTER TABLE public.partner_ledger ADD CONSTRAINT partner_ledger_entry_type_check
  CHECK (entry_type IN ('opening', 'advance', 'charge', 'recovery', 'payment'));

CREATE OR REPLACE VIEW public.partner_balances WITH (security_invoker = true) AS
SELECT p.id AS partner_id,
  coalesce(sum(l.amount) FILTER (WHERE l.entry_type IN ('opening', 'advance')), 0)
    - coalesce(sum(l.amount) FILTER (WHERE l.entry_type = 'recovery'), 0) AS advance_balance,
  coalesce(sum(l.amount) FILTER (WHERE l.entry_type = 'charge'), 0)
    - coalesce(sum(l.amount) FILTER (WHERE l.entry_type IN ('recovery', 'payment')), 0) AS amount_due,
  max(l.period_to) FILTER (WHERE l.entry_type = 'charge') AS settled_up_to
FROM public.delivery_partners p
LEFT JOIN public.partner_ledger l ON l.partner_id = p.id
GROUP BY p.id;

-- A deduction can't take more than the advance held (opening balance included).
CREATE OR REPLACE FUNCTION public.check_partner_recovery()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE held NUMERIC;
BEGIN
  IF NEW.entry_type <> 'recovery' THEN RETURN NEW; END IF;
  SELECT coalesce(sum(amount) FILTER (WHERE entry_type IN ('opening', 'advance')), 0)
       - coalesce(sum(amount) FILTER (WHERE entry_type = 'recovery'), 0)
  INTO held FROM partner_ledger WHERE partner_id = NEW.partner_id AND id IS DISTINCT FROM NEW.id;
  IF NEW.amount > held + 0.001 THEN
    RAISE EXCEPTION 'Can''t deduct ₹% from an advance of ₹%', NEW.amount, held USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

-- Every ledger and partner change goes into the audit log (old value, new value, who, when).
DROP TRIGGER IF EXISTS audit_partner_ledger ON public.partner_ledger;
CREATE TRIGGER audit_partner_ledger AFTER INSERT OR UPDATE OR DELETE ON public.partner_ledger
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
DROP TRIGGER IF EXISTS audit_delivery_partners ON public.delivery_partners;
CREATE TRIGGER audit_delivery_partners AFTER INSERT OR UPDATE OR DELETE ON public.delivery_partners
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
