-- Step 6: storefront. Prices show at all hours; four independent switches decide what a
-- customer can do; orders outside business hours are pre-orders with a delivery date.
-- Safe to re-run.

-- 1. Business hours for the storefront (business_settings itself stays admin-only).
CREATE OR REPLACE FUNCTION public.get_business_hours()
RETURNS TABLE (opening_time TIME, closing_time TIME)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(opening_time, '06:00'), coalesce(closing_time, '18:00')
  FROM business_settings ORDER BY created_at LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_business_hours() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_hours() TO anon, authenticated;

-- 2. Customers can only order what is orderable: active, published, priced, switched to
--    "Available for ordering", and in stock or open for pre-orders. Admins entering orders
--    (New Order, Edit Order) are not restricted.
CREATE OR REPLACE FUNCTION public.check_item_orderable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p RECORD;
BEGIN
  -- Only requests from the website (anonymous or logged-in customers) are checked; admins, and
  -- server-side code using the service key or the SQL editor, are not.
  IF NEW.product_id IS NULL
     OR coalesce(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role', '') NOT IN ('anon', 'authenticated')
     OR (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin')) THEN
    RETURN NEW;
  END IF;
  SELECT name, is_active, is_published, is_orderable, in_stock, preorder_enabled, awaiting_daily_price
  INTO p FROM products WHERE id = NEW.product_id;
  IF NOT FOUND OR NOT coalesce(p.is_active, true) OR NOT coalesce(p.is_published, false)
     OR NOT coalesce(p.is_orderable, true) OR coalesce(p.awaiting_daily_price, false)
     OR NOT (coalesce(p.in_stock, true) OR coalesce(p.preorder_enabled, false)) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: % is not available to order right now', coalesce(p.name, 'A product')
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_item_orderable ON public.order_items;
CREATE TRIGGER check_item_orderable BEFORE INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.check_item_orderable();

-- 3. WhatsApp orders: same availability rule, out-of-stock items only as pre-orders, and the
--    chosen delivery date stored on the order.
CREATE OR REPLACE FUNCTION public.create_whatsapp_order(
  p_customer_name TEXT,
  p_phone TEXT,
  p_location TEXT,
  p_delivery_date DATE,
  p_delivery_slot TEXT,
  p_notes TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT := btrim(coalesce(p_customer_name, ''));
  v_phone TEXT := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_location TEXT := btrim(coalesce(p_location, ''));
  v_slot TEXT := btrim(coalesce(p_delivery_slot, ''));
  v_notes TEXT := left(btrim(coalesce(p_notes, '')), 500);
  v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_order_id UUID;
  v_total NUMERIC := 0;
  v_item JSONB;
  v_qty NUMERIC;
  v_product RECORD;
  v_seen UUID[] := '{}';
  v_preorder BOOLEAN := false;
BEGIN
  IF length(v_name) < 2 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'Please enter your name' USING ERRCODE = '22023';
  END IF;
  IF length(v_phone) = 12 AND left(v_phone, 2) = '91' THEN
    v_phone := right(v_phone, 10);
  END IF;
  IF v_phone !~ '^[6-9][0-9]{9}$' THEN
    RAISE EXCEPTION 'Please enter a valid 10-digit mobile number' USING ERRCODE = '22023';
  END IF;
  IF length(v_location) < 1 OR length(v_location) > 200 THEN
    RAISE EXCEPTION 'Please enter your location' USING ERRCODE = '22023';
  END IF;
  IF p_delivery_date IS NULL OR p_delivery_date < v_today OR p_delivery_date > v_today + 30 THEN
    RAISE EXCEPTION 'Please pick a delivery date within the next 30 days' USING ERRCODE = '22023';
  END IF;
  IF length(v_slot) < 1 OR length(v_slot) > 50 THEN
    RAISE EXCEPTION 'Please pick a delivery slot' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 30 THEN
    RAISE EXCEPTION 'Please add between 1 and 30 products' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM orders
      WHERE order_source = 'whatsapp-website' AND phone = v_phone
        AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many orders from this number. Please message us on WhatsApp directly.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO orders (user_id, status, order_source, total_amount, shipping_address, phone, notes, delivery_date)
  VALUES (
    auth.uid(), 'pending', 'whatsapp-website', 0, v_location, v_phone,
    'WhatsApp Order - ' || v_name || E'\n' ||
    'Delivery: ' || to_char(p_delivery_date, 'DD Mon YYYY') || ' - ' || v_slot ||
    CASE WHEN v_notes <> '' THEN E'\n' || v_notes ELSE '' END,
    p_delivery_date
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    BEGIN
      v_qty := (v_item->>'quantity')::NUMERIC;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Invalid quantity' USING ERRCODE = '22023';
    END;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > 50 THEN
      RAISE EXCEPTION 'Quantities must be between 0 and 50' USING ERRCODE = '22023';
    END IF;

    SELECT id, name, price, hsn_code, gst_type, gst_rate, in_stock INTO v_product
    FROM products
    WHERE id = (v_item->>'product_id')::UUID
      AND is_published = true
      AND coalesce(is_active, true)
      AND coalesce(is_orderable, true)
      AND (coalesce(in_stock, true) OR coalesce(preorder_enabled, false))
      AND awaiting_daily_price = false;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'One of the products is no longer available. Please refresh and try again.' USING ERRCODE = '22023';
    END IF;
    IF v_product.id = ANY (v_seen) THEN
      RAISE EXCEPTION 'A product is listed twice' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || v_product.id;

    INSERT INTO order_items (
      order_id, product_id, product_name, quantity, unit_price, total_price,
      hsn_code, gst_type, gst_rate
    ) VALUES (
      v_order_id, v_product.id, v_product.name, v_qty, v_product.price, round(v_product.price * v_qty, 2),
      v_product.hsn_code, coalesce(v_product.gst_type, 'Exempt'), coalesce(v_product.gst_rate, 0)
    );
    v_total := v_total + round(v_product.price * v_qty, 2);
    IF NOT coalesce(v_product.in_stock, true) THEN v_preorder := true; END IF;
  END LOOP;

  UPDATE orders SET total_amount = v_total, is_preorder = v_preorder WHERE id = v_order_id;

  RETURN jsonb_build_object('id', v_order_id, 'reference', upper(left(v_order_id::text, 8)));
END;
$$;

REVOKE ALL ON FUNCTION public.create_whatsapp_order(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_whatsapp_order(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, JSONB) TO anon, authenticated;
