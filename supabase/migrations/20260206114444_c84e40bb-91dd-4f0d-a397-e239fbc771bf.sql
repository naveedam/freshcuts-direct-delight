-- Add order_source column to orders table for tracking where orders come from
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS order_source text DEFAULT 'website';

-- Add comment for clarity
COMMENT ON COLUMN public.orders.order_source IS 'Source of order: website, whatsapp-website, admin-manual, etc.';