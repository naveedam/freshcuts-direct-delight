-- Step 5: orders and payments. Safe to re-run.

-- 1. Settlements: an agreed discount or round-off recorded against an invoice, so a customer who
--    has settled up shows no due. They count towards what was received on the invoice, but are
--    marked as adjustments so cash-collection figures can leave them out.
ALTER TABLE public.customer_payments
  ADD COLUMN IF NOT EXISTS is_adjustment BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.customer_payments DROP CONSTRAINT IF EXISTS customer_payments_payment_method_check;
ALTER TABLE public.customer_payments ADD CONSTRAINT customer_payments_payment_method_check
  CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'upi', 'other', 'settlement'));

-- 2. Keep an order's stored paid amount, balance and payment status in line with its payments.
--    Before: Finalize Weights and Edit Order changed the total without rechecking them, so an
--    order could say "Paid" while money was still due (or the reverse).
CREATE OR REPLACE FUNCTION public.recompute_order_payment(p_order_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  paid NUMERIC;
  o RECORD;
BEGIN
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

CREATE OR REPLACE FUNCTION public.on_payment_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM recompute_order_payment(coalesce(NEW.order_id, OLD.order_id));
  IF TG_OP = 'UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    PERFORM recompute_order_payment(OLD.order_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_payment_change ON public.customer_payments;
CREATE TRIGGER on_payment_change AFTER INSERT OR UPDATE OR DELETE ON public.customer_payments
  FOR EACH ROW EXECUTE FUNCTION public.on_payment_change();

CREATE OR REPLACE FUNCTION public.on_order_total_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.invoice_cancelled IS DISTINCT FROM OLD.invoice_cancelled THEN
    PERFORM recompute_order_payment(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_order_total_change ON public.orders;
CREATE TRIGGER on_order_total_change AFTER UPDATE OF total_amount, invoice_cancelled ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.on_order_total_change();

-- Only orders that already have payments, so storefront orders with other statuses are untouched.
SELECT public.recompute_order_payment(o.id)
FROM public.orders o WHERE EXISTS (SELECT 1 FROM public.customer_payments p WHERE p.order_id = o.id);

-- 3. Every new order line keeps a copy of its product's category and unit at the time of the order,
--    whichever screen created it (checkout, New Order, Edit Order, WhatsApp).
CREATE OR REPLACE FUNCTION public.snapshot_order_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.product_id IS NOT NULL AND (NEW.category_name IS NULL OR NEW.unit IS NULL) THEN
    SELECT coalesce(NEW.category_name, c.name, p.category), coalesce(NEW.unit, p.unit)
    INTO NEW.category_name, NEW.unit
    FROM products p LEFT JOIN categories c ON c.id = product_category_id(p.id)
    WHERE p.id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS snapshot_order_item ON public.order_items;
CREATE TRIGGER snapshot_order_item BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_order_item();
