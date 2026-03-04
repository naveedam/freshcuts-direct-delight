ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS building_name text NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS flat_number text NULL;