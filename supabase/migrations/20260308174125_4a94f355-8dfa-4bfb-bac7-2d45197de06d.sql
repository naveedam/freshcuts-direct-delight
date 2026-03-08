
-- 1. Fix business_settings: GSTIN, phone, email should not be exposed to anonymous users
DROP POLICY IF EXISTS "Authenticated users can view business settings" ON public.business_settings;
CREATE POLICY "Authenticated users can view business settings"
  ON public.business_settings FOR SELECT
  TO authenticated
  USING (true);

-- 2. Fix financial_years: restrict to authenticated users only
DROP POLICY IF EXISTS "Anyone can view financial years" ON public.financial_years;
CREATE POLICY "Authenticated users can view financial years"
  ON public.financial_years FOR SELECT
  TO authenticated
  USING (true);

-- 3. Add admin read access to profiles (needed for order management)
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Add admin update access to profiles (for customer management)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Fix gst_config: tax config should only be visible to authenticated users
DROP POLICY IF EXISTS "Anyone can view GST config" ON public.gst_config;
CREATE POLICY "Authenticated users can view GST config"
  ON public.gst_config FOR SELECT
  TO authenticated
  USING (true);

-- 6. Add delete policy for order_items for admins (currently missing)
CREATE POLICY "Admins can delete order items"
  ON public.order_items FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 7. Add delete policy for orders for admins (currently missing)
CREATE POLICY "Admins can delete orders"
  ON public.orders FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
