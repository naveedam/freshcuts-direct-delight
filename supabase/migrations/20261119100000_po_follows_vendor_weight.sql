-- Purchase orders always use the vendor's weight (order_items.vendor_supplied_weight, the "Vendor Wt"
-- column in Adjust Weights). Whenever that weight changes, however it's edited, the linked PO line's
-- quantity, received weight and amount follow, and the PO total is recalculated (which also
-- refreshes its payment status). Safe to run more than once.

CREATE OR REPLACE FUNCTION public.sync_po_lines_from_order_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_qty NUMERIC := coalesce(NEW.vendor_supplied_weight, NEW.actual_weight, NEW.quantity);
  l RECORD; v_total NUMERIC; v_tax NUMERIC;
BEGIN
  IF v_qty IS NULL THEN RETURN NULL; END IF;
  FOR l IN SELECT i.* FROM purchase_order_items i JOIN purchase_orders p ON p.id = i.purchase_order_id
           WHERE i.order_item_id = NEW.id AND p.status <> 'cancelled' LOOP
    v_total := round(v_qty * coalesce(l.unit_cost, 0), 2);
    v_tax := CASE WHEN coalesce(l.total_cost, 0) > 0 THEN round(v_total * coalesce(l.tax_amount, 0) / l.total_cost, 2) ELSE 0 END;
    IF l.quantity IS DISTINCT FROM v_qty OR l.actual_received_weight IS DISTINCT FROM v_qty
       OR l.total_cost IS DISTINCT FROM v_total THEN
      UPDATE purchase_order_items
      SET quantity = v_qty, actual_received_weight = v_qty, received_quantity = greatest(1, round(v_qty)),
          total_cost = v_total, tax_amount = v_tax
      WHERE id = l.id;
      UPDATE purchase_orders x SET subtotal = s.sub, tax_amount = s.tax, total_amount = s.sub + s.tax
      FROM (SELECT round(sum(coalesce(total_cost, 0)), 2) sub, round(sum(coalesce(tax_amount, 0)), 2) tax
            FROM purchase_order_items WHERE purchase_order_id = l.purchase_order_id) s
      WHERE x.id = l.purchase_order_id;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS po_follows_vendor_weight ON public.order_items;
CREATE TRIGGER po_follows_vendor_weight
  AFTER UPDATE OF vendor_supplied_weight, actual_weight, quantity ON public.order_items
  FOR EACH ROW
  WHEN (coalesce(NEW.vendor_supplied_weight, NEW.actual_weight, NEW.quantity)
        IS DISTINCT FROM coalesce(OLD.vendor_supplied_weight, OLD.actual_weight, OLD.quantity))
  EXECUTE FUNCTION public.sync_po_lines_from_order_item();
