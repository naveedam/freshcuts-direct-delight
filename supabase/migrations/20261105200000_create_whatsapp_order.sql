-- Order on WhatsApp: create the order through a checked server-side function.
--
-- Customers (logged in or not) can't insert into orders directly: the RLS policy
-- only allows an order tied to the caller's own login. This function runs with the
-- owner's rights, validates the input, takes prices from the products table (never
-- from the browser), and writes the order and its items in one transaction.

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
BEGIN
  -- Customer details
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

  -- Items
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 30 THEN
    RAISE EXCEPTION 'Please add between 1 and 30 products' USING ERRCODE = '22023';
  END IF;

  -- Basic spam guard: at most 5 WhatsApp orders per phone number per hour.
  IF (SELECT count(*) FROM orders
      WHERE order_source = 'whatsapp-website' AND phone = v_phone
        AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'Too many orders from this number. Please message us on WhatsApp directly.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO orders (user_id, status, order_source, total_amount, shipping_address, phone, notes)
  VALUES (
    auth.uid(), 'pending', 'whatsapp-website', 0, v_location, v_phone,
    'WhatsApp Order - ' || v_name || E'\n' ||
    'Delivery: ' || to_char(p_delivery_date, 'DD Mon YYYY') || ' - ' || v_slot ||
    CASE WHEN v_notes <> '' THEN E'\n' || v_notes ELSE '' END
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

    SELECT id, name, price, hsn_code, gst_type, gst_rate INTO v_product
    FROM products
    WHERE id = (v_item->>'product_id')::UUID
      AND is_published = true
      AND coalesce(in_stock, true) = true;
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
  END LOOP;

  UPDATE orders SET total_amount = v_total WHERE id = v_order_id;

  RETURN jsonb_build_object('id', v_order_id, 'reference', upper(left(v_order_id::text, 8)));
END;
$$;

REVOKE ALL ON FUNCTION public.create_whatsapp_order(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_whatsapp_order(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, JSONB) TO anon, authenticated;
