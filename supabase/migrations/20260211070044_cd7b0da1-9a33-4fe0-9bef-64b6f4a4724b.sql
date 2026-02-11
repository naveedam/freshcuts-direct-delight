
-- Add new columns to products table for bulk upload support
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS mrp numeric;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT true;

-- Create unique index on SKU (partial - only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_unique ON public.products (sku) WHERE sku IS NOT NULL;

-- Create bulk import logs table
CREATE TABLE public.bulk_import_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id uuid NOT NULL,
  file_name text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_report jsonb DEFAULT '[]'::jsonb,
  column_mapping jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'processing',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.bulk_import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage bulk import logs"
  ON public.bulk_import_logs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));
