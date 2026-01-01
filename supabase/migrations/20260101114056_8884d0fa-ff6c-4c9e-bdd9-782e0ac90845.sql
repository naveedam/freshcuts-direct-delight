-- Add new columns to orders table for order management
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS converted_to_sale boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS sale_converted_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS invoice_number text,
ADD COLUMN IF NOT EXISTS shipping_label_generated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS customer_email text;

-- Create sales table to track converted orders
CREATE TABLE public.sales (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  sale_date timestamp with time zone NOT NULL DEFAULT now(),
  payment_status text NOT NULL DEFAULT 'confirmed',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on sales table
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

-- RLS policies for sales table
CREATE POLICY "Admins can manage sales"
ON public.sales
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view their own sales"
ON public.sales
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM orders 
  WHERE orders.id = sales.order_id 
  AND orders.user_id = auth.uid()
));

-- Create business_settings table for invoice/label configuration
CREATE TABLE public.business_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name text NOT NULL DEFAULT 'My Business',
  address text,
  city text,
  postal_code text,
  phone text,
  email text,
  gstin text,
  logo_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on business_settings
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage business settings
CREATE POLICY "Admins can manage business settings"
ON public.business_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can view business settings (for invoices)
CREATE POLICY "Anyone can view business settings"
ON public.business_settings
FOR SELECT
USING (true);

-- Insert default business settings
INSERT INTO public.business_settings (business_name) VALUES ('My Business');

-- Create function to generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  year_part text;
  seq_num integer;
  invoice_num text;
BEGIN
  year_part := to_char(now(), 'YYYY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 10) AS integer)), 0) + 1
  INTO seq_num
  FROM public.orders
  WHERE invoice_number LIKE 'INV-' || year_part || '-%';
  
  invoice_num := 'INV-' || year_part || '-' || LPAD(seq_num::text, 5, '0');
  
  RETURN invoice_num;
END;
$$;

-- Add trigger to update updated_at on business_settings
CREATE TRIGGER update_business_settings_updated_at
BEFORE UPDATE ON public.business_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();