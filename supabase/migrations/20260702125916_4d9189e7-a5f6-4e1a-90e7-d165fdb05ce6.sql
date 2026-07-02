
CREATE OR REPLACE FUNCTION public.sync_vendor_pos_on_finalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date;
  v_now  timestamptz := now();
  v_vendor uuid;
  v_po_id uuid;
  v_po_number text;
  v_note text;
  v_item record;
  v_unit_cost numeric;
  v_qty numeric;
  v_total numeric;
  v_existing_item uuid;
  v_status text;
BEGIN
  -- Fire only on the transition to weight_finalized = true
  IF NEW.weight_finalized IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.weight_finalized IS TRUE THEN
    RETURN NEW;
  END IF;

  v_date := COALESCE(NEW.created_at, v_now)::date;

  -- One iteration per vendor on the order
  FOR v_vendor IN
    SELECT DISTINCT vendor_id FROM public.order_items
    WHERE order_id = NEW.id AND vendor_id IS NOT NULL
  LOOP
    v_note := 'daily:' || v_vendor::text || ':' || to_char(v_date, 'YYYY-MM-DD');

    -- Find existing daily PO for this vendor+date (tagged notes first, else any active)
    SELECT id INTO v_po_id FROM public.purchase_orders
     WHERE vendor_id = v_vendor
       AND order_date::date = v_date
       AND status <> 'cancelled'
       AND notes ILIKE '%' || v_note || '%'
     ORDER BY created_at ASC
     LIMIT 1;

    IF v_po_id IS NULL THEN
      SELECT id INTO v_po_id FROM public.purchase_orders
       WHERE vendor_id = v_vendor
         AND order_date::date = v_date
         AND status <> 'cancelled'
       ORDER BY created_at ASC
       LIMIT 1;
    END IF;

    IF v_po_id IS NULL THEN
      v_po_number := public.generate_po_number();
      INSERT INTO public.purchase_orders
        (po_number, vendor_id, status, order_date, subtotal, tax_amount, total_amount, notes)
      VALUES (v_po_number, v_vendor, 'assigned', v_date, 0, 0, 0, v_note)
      RETURNING id INTO v_po_id;
    END IF;

    -- Upsert each order_item line for this vendor
    FOR v_item IN
      SELECT oi.id, oi.product_id, oi.product_name, oi.actual_weight, oi.quantity, oi.vendor_cost
      FROM public.order_items oi
      WHERE oi.order_id = NEW.id AND oi.vendor_id = v_vendor
    LOOP
      v_qty := COALESCE(v_item.actual_weight, v_item.quantity, 1);

      SELECT vp.cost_price INTO v_unit_cost
      FROM public.vendor_products vp
      WHERE vp.vendor_id = v_vendor AND vp.product_id = v_item.product_id
      LIMIT 1;

      v_unit_cost := COALESCE(v_unit_cost, v_item.vendor_cost, 0);
      v_total := v_qty * v_unit_cost;

      SELECT id INTO v_existing_item FROM public.purchase_order_items
       WHERE purchase_order_id = v_po_id
         AND order_id = NEW.id
         AND product_name = v_item.product_name
       LIMIT 1;

      IF v_existing_item IS NOT NULL THEN
        UPDATE public.purchase_order_items
        SET quantity = v_qty,
            unit_cost = v_unit_cost,
            total_cost = v_total,
            actual_received_weight = v_qty,
            received_quantity = GREATEST(1, ROUND(v_qty)::int),
            received_at = v_now
        WHERE id = v_existing_item;
      ELSE
        INSERT INTO public.purchase_order_items
          (purchase_order_id, product_id, product_name, quantity, unit_cost, total_cost,
           actual_received_weight, received_quantity, received_at, order_id, order_item_id)
        VALUES
          (v_po_id, v_item.product_id, v_item.product_name, v_qty, v_unit_cost, v_total,
           v_qty, GREATEST(1, ROUND(v_qty)::int), v_now, NEW.id, v_item.id);
      END IF;
    END LOOP;

    -- Refresh PO subtotal/total from all its items
    UPDATE public.purchase_orders po
    SET subtotal = sums.s,
        total_amount = sums.s + COALESCE(po.tax_amount, 0),
        updated_at = v_now
    FROM (
      SELECT ROUND(COALESCE(SUM(total_cost), 0)::numeric, 2) AS s
      FROM public.purchase_order_items WHERE purchase_order_id = v_po_id
    ) sums
    WHERE po.id = v_po_id;

    -- Advance status to 'received' if still pre-received
    SELECT status INTO v_status FROM public.purchase_orders WHERE id = v_po_id;
    IF v_status IN ('draft','assigned','sent','confirmed','partially_received') THEN
      UPDATE public.purchase_orders
      SET status = 'received', received_date = v_now
      WHERE id = v_po_id;
    END IF;
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the order update if PO sync fails
  RAISE WARNING 'sync_vendor_pos_on_finalize failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vendor_pos_on_finalize ON public.orders;
CREATE TRIGGER trg_sync_vendor_pos_on_finalize
AFTER INSERT OR UPDATE OF weight_finalized ON public.orders
FOR EACH ROW
WHEN (NEW.weight_finalized IS TRUE)
EXECUTE FUNCTION public.sync_vendor_pos_on_finalize();
