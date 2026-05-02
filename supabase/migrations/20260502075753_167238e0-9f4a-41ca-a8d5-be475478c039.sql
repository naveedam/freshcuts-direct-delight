ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_cancelled_at timestamp with time zone;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;