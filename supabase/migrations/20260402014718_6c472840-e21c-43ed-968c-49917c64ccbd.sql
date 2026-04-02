
-- Create invoices storage bucket for publicly shareable invoice files
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload invoices
CREATE POLICY "Admins can upload invoices"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices' AND
  public.has_role(auth.uid(), 'admin')
);

-- Allow anyone to read invoices (public share links)
CREATE POLICY "Anyone can view invoices"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'invoices');

-- Allow admins to delete invoices
CREATE POLICY "Admins can delete invoices"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices' AND
  public.has_role(auth.uid(), 'admin')
);
