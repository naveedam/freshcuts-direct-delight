
-- 1. Delivery runs table for route-based shipping
CREATE TABLE public.delivery_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  driver_name TEXT,
  vehicle TEXT,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  cost_allocation_method TEXT NOT NULL DEFAULT 'equal',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage delivery runs"
ON public.delivery_runs FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Delivery run orders (junction table)
CREATE TABLE public.delivery_run_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_run_id UUID NOT NULL REFERENCES public.delivery_runs(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  allocated_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(delivery_run_id, order_id)
);

ALTER TABLE public.delivery_run_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage delivery run orders"
ON public.delivery_run_orders FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Add billed_weight to order_items
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS billed_weight NUMERIC;

-- 4. Add order-level linking to purchase_order_items for GRN mapping
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS order_item_id UUID;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS order_id UUID;

-- Trigger for delivery_runs updated_at
CREATE TRIGGER update_delivery_runs_updated_at
  BEFORE UPDATE ON public.delivery_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
