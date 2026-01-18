-- Add RLS policy for admins to update order items
CREATE POLICY "Admins can update order items"
ON public.order_items
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add column to track if weight was adjusted
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS actual_weight NUMERIC;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS weight_adjusted_at TIMESTAMP WITH TIME ZONE;

-- Add column to orders to track if weight has been finalized
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS weight_finalized BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS weight_finalized_at TIMESTAMP WITH TIME ZONE;