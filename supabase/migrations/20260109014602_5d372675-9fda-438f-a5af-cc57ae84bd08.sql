-- Add GST-related columns to products table
ALTER TABLE public.products
ADD COLUMN hsn_code text,
ADD COLUMN gst_type text NOT NULL DEFAULT 'exempt' CHECK (gst_type IN ('exempt', 'nil', 'taxable')),
ADD COLUMN gst_rate numeric NOT NULL DEFAULT 0 CHECK (gst_rate IN (0, 5, 12, 18, 28));

-- Add GST-related columns to order_items table
ALTER TABLE public.order_items
ADD COLUMN hsn_code text,
ADD COLUMN gst_type text NOT NULL DEFAULT 'exempt',
ADD COLUMN gst_rate numeric NOT NULL DEFAULT 0,
ADD COLUMN taxable_value numeric NOT NULL DEFAULT 0,
ADD COLUMN cgst_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN sgst_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN igst_amount numeric NOT NULL DEFAULT 0;

-- Create GST configuration table for configurable tax rules
CREATE TABLE public.gst_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL,
  hsn_code text NOT NULL,
  description text,
  default_gst_type text NOT NULL DEFAULT 'exempt' CHECK (default_gst_type IN ('exempt', 'nil', 'taxable')),
  default_gst_rate numeric NOT NULL DEFAULT 0 CHECK (default_gst_rate IN (0, 5, 12, 18, 28)),
  is_configurable boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on gst_config
ALTER TABLE public.gst_config ENABLE ROW LEVEL SECURITY;

-- Policies for gst_config
CREATE POLICY "Admins can manage GST config"
ON public.gst_config
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view GST config"
ON public.gst_config
FOR SELECT
USING (true);

-- Add place of supply to orders for IGST determination
ALTER TABLE public.orders
ADD COLUMN place_of_supply text,
ADD COLUMN is_igst boolean NOT NULL DEFAULT false;

-- Add state code to business_settings
ALTER TABLE public.business_settings
ADD COLUMN state_code text,
ADD COLUMN state_name text;

-- Insert default GST configuration for food categories
INSERT INTO public.gst_config (category, hsn_code, description, default_gst_type, default_gst_rate, is_configurable, notes)
VALUES 
  ('Meat', '0201', 'Fresh/Chilled Beef', 'nil', 0, false, 'Fresh unbranded meat - NIL rated'),
  ('Meat', '0202', 'Frozen Beef', 'nil', 0, false, 'Fresh unbranded meat - NIL rated'),
  ('Meat', '0203', 'Fresh/Chilled/Frozen Pork', 'nil', 0, false, 'Fresh unbranded meat - NIL rated'),
  ('Meat', '0204', 'Fresh/Chilled/Frozen Lamb/Mutton', 'nil', 0, false, 'Fresh unbranded meat - NIL rated'),
  ('Meat', '0207', 'Fresh/Chilled/Frozen Poultry', 'nil', 0, false, 'Fresh unbranded meat - NIL rated'),
  ('Seafood', '0302', 'Fresh/Chilled Fish', 'nil', 0, false, 'Fresh unbranded seafood - NIL rated'),
  ('Seafood', '0303', 'Frozen Fish', 'nil', 0, false, 'Fresh unbranded seafood - NIL rated'),
  ('Seafood', '0306', 'Crustaceans', 'nil', 0, false, 'Fresh unbranded seafood - NIL rated'),
  ('Fruits', '0803', 'Fresh Fruits', 'nil', 0, false, 'Fresh fruits - NIL rated'),
  ('Vegetables', '0701', 'Fresh Vegetables', 'nil', 0, false, 'Fresh vegetables - NIL rated'),
  ('Dairy', '0401', 'Fresh Milk', 'nil', 0, false, 'Fresh milk - NIL rated'),
  ('Dairy', '0406', 'Paneer/Cheese', 'exempt', 0, true, 'Loose cut-to-order exempt; pre-packed taxable @ 5%');

-- Trigger for updated_at
CREATE TRIGGER update_gst_config_updated_at
BEFORE UPDATE ON public.gst_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();