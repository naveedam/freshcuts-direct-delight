ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_processed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS yield_multiplier numeric NOT NULL DEFAULT 1.0;