-- ==============================================
-- 1. PURCHASE ORDER ITEMS: Add GRN (Goods Received Note) columns
-- ==============================================

-- Add actual received weight (decimal for precision)
ALTER TABLE public.purchase_order_items
ADD COLUMN IF NOT EXISTS actual_received_weight numeric;

-- Add received remarks for shortage/excess/quality notes
ALTER TABLE public.purchase_order_items
ADD COLUMN IF NOT EXISTS received_remarks text;

-- Add received date per item
ALTER TABLE public.purchase_order_items
ADD COLUMN IF NOT EXISTS received_at timestamp with time zone;

-- ==============================================
-- 2. CATEGORIES TABLE: Database-driven category management
-- ==============================================

-- Create category type enum
DO $$ BEGIN
  CREATE TYPE public.category_type AS ENUM ('fresh', 'packaged', 'gourmet');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  category_type category_type NOT NULL DEFAULT 'fresh',
  description text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- RLS policies for categories
CREATE POLICY "Anyone can view active categories"
ON public.categories
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage categories"
ON public.categories
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ==============================================
-- 3. SEED EXISTING AND NEW CATEGORIES
-- ==============================================

-- Insert existing categories (Fresh type)
INSERT INTO public.categories (name, slug, category_type, description, sort_order, is_active)
VALUES 
  ('Lamb & Mutton', 'lamb', 'fresh', 'Premium quality lamb and mutton cuts', 1, true),
  ('Poultry', 'poultry', 'fresh', 'Fresh chicken and other poultry products', 2, true),
  ('Seafood & Fish', 'seafood', 'fresh', 'Fresh seafood and fish selections', 3, true)
ON CONFLICT (slug) DO NOTHING;

-- Insert new categories as requested
INSERT INTO public.categories (name, slug, category_type, description, sort_order, is_active)
VALUES 
  ('Gourmet & International Foods', 'gourmet-international', 'gourmet', 'Imported foods, specialty items, and premium brands', 4, true),
  ('Packaged & Ready-to-Eat', 'packaged-ready-to-eat', 'packaged', 'Canned foods, ready snacks, popcorn, and packaged meals', 5, true),
  ('Sauces, Jams & Condiments', 'sauces-jams-condiments', 'packaged', 'Ketchup, BBQ sauce, mayonnaise, spreads, and jams', 6, true),
  ('Pantry Essentials', 'pantry-essentials', 'packaged', 'Dry goods, cooking aids, and shelf-stable items', 7, true)
ON CONFLICT (slug) DO NOTHING;

-- ==============================================
-- 4. ADD category_id TO PRODUCTS (optional reference)
-- ==============================================

-- Add category_id column to products for future reference
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id);