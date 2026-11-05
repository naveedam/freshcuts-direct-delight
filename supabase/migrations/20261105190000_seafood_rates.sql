-- Seafood Rate: daily selling and buying prices for Seafood & Fish products.
--
-- Prices carry forward: the price in force on a day is the latest row whose
-- effective_date is on or before that day, so a fish whose price did not change
-- needs no new row. A day counts as "published" once a row exists in
-- seafood_price_publications; until then the storefront hides seafood prices.

-- 1. Selling price per product (same whichever supplier the fish comes from)
CREATE TABLE IF NOT EXISTS public.seafood_selling_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  price NUMERIC NOT NULL CHECK (price > 0),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, effective_date)
);

CREATE INDEX IF NOT EXISTS seafood_selling_prices_date_idx
  ON public.seafood_selling_prices (effective_date);

ALTER TABLE public.seafood_selling_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read seafood selling prices" ON public.seafood_selling_prices;
CREATE POLICY "Anyone can read seafood selling prices"
ON public.seafood_selling_prices FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage seafood selling prices" ON public.seafood_selling_prices;
CREATE POLICY "Admins can manage seafood selling prices"
ON public.seafood_selling_prices FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Buying price per product per supplier (admin only: never exposed to customers)
CREATE TABLE IF NOT EXISTS public.seafood_buying_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  price NUMERIC NOT NULL CHECK (price > 0),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, vendor_id, effective_date)
);

CREATE INDEX IF NOT EXISTS seafood_buying_prices_date_idx
  ON public.seafood_buying_prices (effective_date);

ALTER TABLE public.seafood_buying_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage seafood buying prices" ON public.seafood_buying_prices;
CREATE POLICY "Admins can manage seafood buying prices"
ON public.seafood_buying_prices FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. One row per day the admin has published (including "no change" days)
CREATE TABLE IF NOT EXISTS public.seafood_price_publications (
  publish_date DATE NOT NULL PRIMARY KEY,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID,
  changed_count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.seafood_price_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read seafood price publications" ON public.seafood_price_publications;
CREATE POLICY "Anyone can read seafood price publications"
ON public.seafood_price_publications FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage seafood price publications" ON public.seafood_price_publications;
CREATE POLICY "Admins can manage seafood price publications"
ON public.seafood_price_publications FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Seed: today's catalog price and supplier costs become the starting prices,
--    so carry-forward has something to carry from day one.
INSERT INTO public.seafood_selling_prices (product_id, effective_date, price)
SELECT p.id, (now() AT TIME ZONE 'Asia/Kolkata')::date, p.price
FROM public.products p
WHERE (p.category IN ('Seafood & Fish', 'seafood')
       OR p.category_id IN (SELECT id FROM public.categories WHERE slug = 'seafood'))
  AND p.price > 0
ON CONFLICT (product_id, effective_date) DO NOTHING;

INSERT INTO public.seafood_buying_prices (product_id, vendor_id, effective_date, price)
SELECT vp.product_id, vp.vendor_id, (now() AT TIME ZONE 'Asia/Kolkata')::date, vp.cost_price
FROM public.vendor_products vp
JOIN public.products p ON p.id = vp.product_id
WHERE (p.category IN ('Seafood & Fish', 'seafood')
       OR p.category_id IN (SELECT id FROM public.categories WHERE slug = 'seafood'))
  AND vp.cost_price > 0
ON CONFLICT (product_id, vendor_id, effective_date) DO NOTHING;
