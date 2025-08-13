-- Fix the infinite recursion in profiles RLS policy
-- First, drop the problematic policy
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Create a security definer function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id 
    AND role = 'admin'::user_role
  )
$$;

-- Create a new admin policy using the security definer function
CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

-- Also fix the admin policy for other tables to use the same pattern
DROP POLICY IF EXISTS "Admins can view all merchants" ON public.merchants;
CREATE POLICY "Admins can view all merchants" 
ON public.merchants 
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all sales data" ON public.employee_sales_data;
CREATE POLICY "Admins can view all sales data" 
ON public.employee_sales_data 
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all settings" ON public.settings;
CREATE POLICY "Admins can manage all settings" 
ON public.settings 
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage sub-admin assignments" ON public.sub_admin_stores;
CREATE POLICY "Admins can manage sub-admin assignments" 
ON public.sub_admin_stores 
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));