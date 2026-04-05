
-- Create documents table for flat-based document organization
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  flat_number TEXT,
  building_name TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL DEFAULT 'invoice',
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  invoice_number TEXT,
  customer_name TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage documents"
  ON public.documents FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can view their own order documents
CREATE POLICY "Users can view their own documents"
  ON public.documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = documents.order_id AND orders.user_id = auth.uid()
    )
  );

-- Index for flat-based lookups
CREATE INDEX idx_documents_flat_number ON public.documents (flat_number);
CREATE INDEX idx_documents_order_id ON public.documents (order_id);
CREATE INDEX idx_documents_type ON public.documents (document_type);
