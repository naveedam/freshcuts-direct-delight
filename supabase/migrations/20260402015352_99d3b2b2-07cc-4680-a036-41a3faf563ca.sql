
-- Add vendor_id to order_items
ALTER TABLE public.order_items
ADD COLUMN vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;

-- Add payment tracking to orders
ALTER TABLE public.orders
ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid',
ADD COLUMN amount_paid numeric NOT NULL DEFAULT 0,
ADD COLUMN balance_due numeric NOT NULL DEFAULT 0;

-- Create customer payments table
CREATE TABLE public.customer_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'cash',
  payment_date timestamp with time zone NOT NULL DEFAULT now(),
  reference_number text,
  notes text,
  recorded_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage customer payments"
ON public.customer_payments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own payments"
ON public.customer_payments
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.orders
  WHERE orders.id = customer_payments.order_id
  AND orders.user_id = auth.uid()
));

-- Index for fast lookups
CREATE INDEX idx_customer_payments_order_id ON public.customer_payments(order_id);
CREATE INDEX idx_order_items_vendor_id ON public.order_items(vendor_id);
