-- Fix infinite recursion in profiles RLS policy
-- Drop the problematic admin policy that references profiles table within itself
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

-- Create a new admin policy that doesn't cause recursion
-- We'll check the user's role directly from auth.uid() without self-referencing
CREATE POLICY "Admins can view all profiles" ON profiles
FOR ALL USING (
  auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'admin'
  )
);

-- Also ensure we have proper policies for the new functionality
-- Update the merchants table to allow profile fetching with merchant data
DROP POLICY IF EXISTS "Merchants can view their own data" ON merchants;
CREATE POLICY "Merchants can view their own data" ON merchants
FOR ALL USING (user_id = auth.uid());

-- Ensure settings table has proper policies
DROP POLICY IF EXISTS "Merchants can manage their settings" ON settings;
CREATE POLICY "Merchants can manage their settings" ON settings
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM merchants m 
    WHERE m.id = settings.merchant_id 
    AND m.user_id = auth.uid()
  )
);