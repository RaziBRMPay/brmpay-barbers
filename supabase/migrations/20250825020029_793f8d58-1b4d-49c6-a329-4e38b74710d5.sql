-- Remove the duplicate commission_percentage column from settings table
-- This eliminates confusion between general and per-employee commission settings
ALTER TABLE public.settings DROP COLUMN IF EXISTS commission_percentage;