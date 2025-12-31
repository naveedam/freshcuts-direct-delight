-- Add new columns to profiles table for enhanced address
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS flat_number TEXT,
ADD COLUMN IF NOT EXISTS apartment_name TEXT,
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);