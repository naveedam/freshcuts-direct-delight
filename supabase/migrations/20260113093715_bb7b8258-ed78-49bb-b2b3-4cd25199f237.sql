-- Fix function search path for generate_po_number
CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  current_year TEXT;
  next_seq INTEGER;
BEGIN
  current_year := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 'PO-' || current_year || '-(\d+)') AS INTEGER)), 0) + 1
  INTO next_seq
  FROM public.purchase_orders
  WHERE po_number LIKE 'PO-' || current_year || '-%';
  
  new_number := 'PO-' || current_year || '-' || LPAD(next_seq::TEXT, 5, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql SET search_path = public;