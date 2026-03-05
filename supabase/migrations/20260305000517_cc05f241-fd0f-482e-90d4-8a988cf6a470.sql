
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS discount_type text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0;
