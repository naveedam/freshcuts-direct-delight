-- Fix purchase_order_items.quantity to support decimal weights (kg)
-- This allows ordered quantities like 10.5 kg instead of just integers

-- Change quantity column from integer to numeric for decimal support
ALTER TABLE public.purchase_order_items
ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

-- Add comment for clarity
COMMENT ON COLUMN public.purchase_order_items.quantity IS 'Ordered quantity in kg (supports decimals)';
COMMENT ON COLUMN public.purchase_order_items.actual_received_weight IS 'Actual weight received in kg (supports decimals like 9.45)';
COMMENT ON COLUMN public.purchase_order_items.received_quantity IS 'Legacy field - number of receive events (deprecated in favor of actual_received_weight)';