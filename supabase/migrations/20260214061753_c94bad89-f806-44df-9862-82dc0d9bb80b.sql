
-- Add pricing_model column to products
ALTER TABLE public.products 
ADD COLUMN pricing_model text NOT NULL DEFAULT 'weight_based' 
CHECK (pricing_model IN ('weight_based', 'unit_based'));

-- Backfill: set packaged/gourmet categories to unit_based
UPDATE public.products 
SET pricing_model = 'unit_based' 
WHERE LOWER(category) IN (
  'gourmet-international-foods',
  'packaged-ready-to-eat', 
  'sauces-jams-condiments',
  'pantry-essentials'
) OR LOWER(unit) IN ('unit', 'pack', 'bottle', 'jar', 'can', 'box', 'piece', 'pcs');
