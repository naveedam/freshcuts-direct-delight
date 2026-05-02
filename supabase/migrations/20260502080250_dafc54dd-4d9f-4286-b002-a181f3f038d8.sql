-- Create credit_notes table
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  invoice_number text,
  credit_note_number text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  reason text,
  status text NOT NULL DEFAULT 'issued',
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS credit_notes_credit_note_number_key
  ON public.credit_notes (credit_note_number);

CREATE INDEX IF NOT EXISTS credit_notes_order_id_idx
  ON public.credit_notes (order_id);

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage credit notes"
  ON public.credit_notes
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view credit notes for their orders"
  ON public.credit_notes
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = credit_notes.order_id
      AND orders.user_id = auth.uid()
  ));

CREATE TRIGGER update_credit_notes_updated_at
  BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add credit note linkage + cancellation reason on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS credit_note_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_cancelled_reason text,
  ADD COLUMN IF NOT EXISTS invoice_cancelled_by uuid;

-- Sequence-style numbering function for credit notes (CN-YYYY-NNNNN)
CREATE OR REPLACE FUNCTION public.generate_credit_note_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_part text;
  seq_num integer;
  cn_num text;
BEGIN
  year_part := to_char(now(), 'YYYY');

  SELECT COALESCE(MAX(CAST(SUBSTRING(credit_note_number FROM 9) AS integer)), 0) + 1
  INTO seq_num
  FROM public.credit_notes
  WHERE credit_note_number LIKE 'CN-' || year_part || '-%';

  cn_num := 'CN-' || year_part || '-' || LPAD(seq_num::text, 5, '0');
  RETURN cn_num;
END;
$$;