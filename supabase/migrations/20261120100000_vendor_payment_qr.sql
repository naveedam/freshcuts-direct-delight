-- Vendor payment QR codes: a QR image (and optional UPI ID) per vendor, so you can scan and pay.
-- The images are kept in a private bucket that only admins can see. Safe to run more than once.

ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS payment_qr_path TEXT;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS upi_id TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('vendor-payment-qr', 'vendor-payment-qr', false, 5242880,
        ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Admins can view vendor QR codes" ON storage.objects;
CREATE POLICY "Admins can view vendor QR codes" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vendor-payment-qr' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can upload vendor QR codes" ON storage.objects;
CREATE POLICY "Admins can upload vendor QR codes" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-payment-qr' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update vendor QR codes" ON storage.objects;
CREATE POLICY "Admins can update vendor QR codes" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vendor-payment-qr' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete vendor QR codes" ON storage.objects;
CREATE POLICY "Admins can delete vendor QR codes" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vendor-payment-qr' AND public.has_role(auth.uid(), 'admin'));

-- Check: both columns and the bucket exist.
SELECT (SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vendors' AND column_name IN ('payment_qr_path', 'upi_id')) AS new_columns,
       (SELECT public FROM storage.buckets WHERE id = 'vendor-payment-qr') AS bucket_is_public;
