-- Add RLS policy for admins to create orders
CREATE POLICY "Admins can create orders"
ON public.orders
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add RLS policy for admins to insert order items
CREATE POLICY "Admins can create order items"
ON public.order_items
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));