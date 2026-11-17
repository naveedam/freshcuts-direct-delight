-- Keep purchase order statuses in step with payments.
--
-- 1. A PO's payment status (Unpaid / Part paid / Paid) is now recalculated whenever its total changes
--    (weights finalised, rates edited, "Fix purchase orders"), not only when a payment is recorded.
-- 2. The PO's own status follows: a fully paid PO that was Received or Payable becomes Paid, and moves
--    back to Payable if its total later rises above what was paid.
-- 3. One-time pass that brings every existing PO up to date.
-- Safe to run more than once.

CREATE OR REPLACE FUNCTION public.refresh_po_payment(p_po_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_paid NUMERIC; v_total NUMERIC; v_pay TEXT;
BEGIN
  SELECT coalesce(sum(amount), 0) INTO v_paid FROM vendor_payments WHERE purchase_order_id = p_po_id;
  SELECT coalesce(total_amount, 0) INTO v_total FROM purchase_orders WHERE id = p_po_id;
  v_pay := CASE WHEN v_paid <= 0.009 THEN 'pending'
                WHEN v_paid + 0.009 >= v_total THEN 'paid'
                ELSE 'partial' END;
  UPDATE purchase_orders
  SET paid_amount = v_paid,
      payment_status = v_pay,
      status = CASE
        WHEN v_pay = 'paid' AND v_total > 0 AND status IN ('received', 'payable') THEN 'paid'
        WHEN v_pay <> 'paid' AND status = 'paid' THEN 'payable'
        ELSE status END
  WHERE id = p_po_id
    AND (paid_amount IS DISTINCT FROM v_paid OR payment_status IS DISTINCT FROM v_pay
         OR (v_pay = 'paid' AND v_total > 0 AND status IN ('received', 'payable'))
         OR (v_pay <> 'paid' AND status = 'paid'));
END;
$$;

CREATE OR REPLACE FUNCTION public.on_po_total_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NULL; END IF;
  -- Always re-check this PO's payment status (cheap; doesn't change the total, so no loop).
  PERFORM refresh_po_payment(NEW.id);
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  -- Then apply any money paid in advance to this vendor's unpaid POs.
  IF EXISTS (SELECT 1 FROM vendor_payments
             WHERE vendor_id = NEW.vendor_id AND purchase_order_id IS NULL AND amount > 0) THEN
    PERFORM allocate_vendor_payments(NEW.vendor_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS allocate_on_po_total ON public.purchase_orders;
CREATE TRIGGER allocate_on_po_total
  AFTER UPDATE OF total_amount ON public.purchase_orders
  FOR EACH ROW WHEN (NEW.total_amount IS DISTINCT FROM OLD.total_amount)
  EXECUTE FUNCTION public.on_po_total_changed();

-- One-time catch-up for every existing PO.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM purchase_orders WHERE status <> 'cancelled' LOOP
    PERFORM refresh_po_payment(r.id);
  END LOOP;
END $$;

-- Check: every row should be zero.
SELECT
  count(*) FILTER (WHERE payment_status = 'paid' AND coalesce(paid_amount,0) + 0.009 < total_amount) AS marked_paid_but_short,
  count(*) FILTER (WHERE payment_status <> 'paid' AND coalesce(paid_amount,0) + 0.009 >= total_amount AND total_amount > 0) AS fully_paid_not_marked,
  count(*) FILTER (WHERE status = 'paid' AND payment_status <> 'paid') AS archived_but_unpaid,
  count(*) FILTER (WHERE payment_status = 'paid' AND status IN ('received','payable') AND total_amount > 0) AS paid_still_active
FROM purchase_orders WHERE status <> 'cancelled';

-- For information: POs left a few rupees short (their total rose slightly after they were paid).
SELECT v.name AS vendor, po.po_number, po.order_date::date AS po_date, po.total_amount, po.paid_amount,
       round(po.total_amount - po.paid_amount, 2) AS short_by
FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
WHERE po.status <> 'cancelled' AND po.paid_amount > 0 AND po.total_amount - po.paid_amount BETWEEN 0.01 AND 50
ORDER BY v.name, po.order_date;
