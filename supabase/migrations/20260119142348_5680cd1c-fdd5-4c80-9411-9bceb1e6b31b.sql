-- Fix business_settings table exposure: restrict to authenticated users only
-- Drop the overly permissive public access policy
DROP POLICY IF EXISTS "Anyone can view business settings" ON public.business_settings;

-- Create a new policy that only allows authenticated users to view business settings
CREATE POLICY "Authenticated users can view business settings"
ON public.business_settings
FOR SELECT
TO authenticated
USING (true);