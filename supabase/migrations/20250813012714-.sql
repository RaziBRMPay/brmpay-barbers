-- Fix the infinite recursion issue properly with correct column names
-- Drop the problematic policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Create simple non-recursive policies 
-- Users can view and update their own profile only
CREATE POLICY "Users can manage their own profile" 
ON public.profiles 
FOR ALL
TO authenticated
USING (auth.uid() = id);