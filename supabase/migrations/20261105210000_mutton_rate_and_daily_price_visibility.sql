-- Mutton Rate (works like Chicken Rate), selling multipliers for chicken and mutton,
-- and hiding daily-priced products that have never had a price entered.
-- Safe to re-run.

-- 1. Chicken: optional selling multiplier per cut. Website price = latest live rate × selling multiplier.
ALTER TABLE public.chicken_cut_multipliers
  ADD COLUMN IF NOT EXISTS selling_multiplier NUMERIC CHECK (selling_multiplier IS NULL OR selling_multiplier > 0);

-- 2. Mutton tables (same shape as chicken; the supplier is chosen on the page, not per row)
CREATE TABLE IF NOT EXISTS public.live_mutton_rates (
  rate_date DATE NOT NULL PRIMARY KEY,
  rate NUMERIC NOT NULL CHECK (rate > 0),
  source TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mutton_cuts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  product_id UUID UNIQUE REFERENCES public.products(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mutton_cut_multipliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cut_id UUID NOT NULL REFERENCES public.mutton_cuts(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  multiplier NUMERIC CHECK (multiplier IS NULL OR multiplier > 0),
  selling_multiplier NUMERIC CHECK (selling_multiplier IS NULL OR selling_multiplier > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cut_id, effective_date),
  CHECK (multiplier IS NOT NULL OR selling_multiplier IS NOT NULL)
);

-- Which supplier's buying price follows a commodity's live rate (chicken stays on M N Broilers in code).
CREATE TABLE IF NOT EXISTS public.daily_rate_settings (
  commodity TEXT NOT NULL PRIMARY KEY,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.live_mutton_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutton_cuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutton_cut_multipliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_rate_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage live mutton rates" ON public.live_mutton_rates;
CREATE POLICY "Admins can manage live mutton rates" ON public.live_mutton_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage mutton cuts" ON public.mutton_cuts;
CREATE POLICY "Admins can manage mutton cuts" ON public.mutton_cuts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage mutton cut multipliers" ON public.mutton_cut_multipliers;
CREATE POLICY "Admins can manage mutton cut multipliers" ON public.mutton_cut_multipliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage daily rate settings" ON public.daily_rate_settings;
CREATE POLICY "Admins can manage daily rate settings" ON public.daily_rate_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Daily-priced products with no price entered yet are kept off the storefront.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS awaiting_daily_price BOOLEAN NOT NULL DEFAULT false;

-- New seafood and mutton products start hidden until a price is entered on their rate page.
-- Existing products keep their current catalog price and stay visible.
CREATE OR REPLACE FUNCTION public.flag_new_daily_priced_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.category, '')) IN ('seafood & fish', 'seafood', 'lamb & mutton', 'lamb', 'mutton')
     OR NEW.category_id IN (SELECT id FROM categories WHERE slug IN ('seafood', 'lamb')) THEN
    NEW.awaiting_daily_price := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS flag_new_daily_priced_product ON public.products;
CREATE TRIGGER flag_new_daily_priced_product
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.flag_new_daily_priced_product();

-- 4. WhatsApp orders: also refuse products still waiting for their first daily price.
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
      AND coalesce(in_stock, true) = true
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
  END LOOP;

  UPDATE orders SET total_amount = v_total WHERE id = v_order_id;

  RETURN jsonb_build_object('id', v_order_id, 'reference', upper(left(v_order_id::text, 8)));
END;
$$;

REVOKE ALL ON FUNCTION public.create_whatsapp_order(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_whatsapp_order(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, JSONB) TO anon, authenticated;
