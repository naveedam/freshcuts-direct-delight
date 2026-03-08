
-- Financial Years table
CREATE TABLE public.financial_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.financial_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage financial years"
  ON public.financial_years FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view financial years"
  ON public.financial_years FOR SELECT
  TO authenticated
  USING (true);

-- Add financial_year_id to orders
ALTER TABLE public.orders ADD COLUMN financial_year_id uuid REFERENCES public.financial_years(id);

-- Add financial_year_id to purchase_orders
ALTER TABLE public.purchase_orders ADD COLUMN financial_year_id uuid REFERENCES public.financial_years(id);

-- Add financial_year_id to sales
ALTER TABLE public.sales ADD COLUMN financial_year_id uuid REFERENCES public.financial_years(id);

-- Function to ensure only one active FY at a time
CREATE OR REPLACE FUNCTION public.ensure_single_active_fy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.financial_years SET is_active = false WHERE id != NEW.id AND is_active = true;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ensure_single_active_fy
  BEFORE INSERT OR UPDATE ON public.financial_years
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_single_active_fy();

-- Function to auto-assign financial year based on date
CREATE OR REPLACE FUNCTION public.get_financial_year_for_date(target_date timestamp with time zone)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.financial_years
  WHERE target_date::date >= start_date AND target_date::date <= end_date
  LIMIT 1;
$$;

-- Trigger to auto-assign FY on order creation
CREATE OR REPLACE FUNCTION public.auto_assign_financial_year_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.financial_year_id IS NULL THEN
    NEW.financial_year_id := public.get_financial_year_for_date(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_fy_order
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_financial_year_order();

-- Trigger to auto-assign FY on purchase order creation
CREATE OR REPLACE FUNCTION public.auto_assign_financial_year_po()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.financial_year_id IS NULL THEN
    NEW.financial_year_id := public.get_financial_year_for_date(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_fy_po
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_financial_year_po();

-- Trigger to auto-assign FY on sale creation
CREATE OR REPLACE FUNCTION public.auto_assign_financial_year_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.financial_year_id IS NULL THEN
    NEW.financial_year_id := public.get_financial_year_for_date(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_fy_sale
  BEFORE INSERT ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_financial_year_sale();
