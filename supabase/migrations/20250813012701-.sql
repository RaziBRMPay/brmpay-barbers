-- Fix the infinite recursion issue properly
-- Drop the problematic function and policies
DROP FUNCTION IF EXISTS public.is_admin(_user_id uuid);
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all merchants" ON public.merchants;
DROP POLICY IF EXISTS "Admins can view all sales data" ON public.employee_sales_data;
DROP POLICY IF EXISTS "Admins can manage all settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can manage sub-admin assignments" ON public.sub_admin_stores;

-- Create simple policies that don't cause recursion
-- Users can view and update their own profile
CREATE POLICY "Users can manage their own profile" 
ON public.profiles 
FOR ALL
TO authenticated
USING (auth.uid() = id);

-- Merchants can view and update their own data
CREATE POLICY "Merchants can manage their own data" 
ON public.merchants 
FOR ALL
TO authenticated
USING (auth.uid() = user_id);

-- Users can view their own sales data
CREATE POLICY "Users can view their own sales data" 
ON public.employee_sales_data 
FOR ALL
TO authenticated
USING (auth.uid() = merchant_id);

-- Users can manage their own settings
CREATE POLICY "Users can manage their own settings" 
ON public.settings 
FOR ALL
TO authenticated
USING (auth.uid() = user_id);

-- Users can manage their own sub-admin assignments
CREATE POLICY "Users can manage their own sub-admin assignments" 
ON public.sub_admin_stores 
FOR ALL
TO authenticated
USING (auth.uid() = sub_admin_id OR auth.uid() = (SELECT user_id FROM public.merchants WHERE id = merchant_id));