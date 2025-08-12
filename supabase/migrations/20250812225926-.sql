-- Create enum for user roles
CREATE TYPE user_role AS ENUM ('admin', 'sub_admin', 'merchant');

-- Create enum for US timezones
CREATE TYPE us_timezone AS ENUM (
  'US/Eastern',
  'US/Central', 
  'US/Mountain',
  'US/Pacific',
  'US/Alaska',
  'US/Hawaii'
);

-- Create profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'merchant',
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create merchants table
CREATE TABLE public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shop_name TEXT NOT NULL,
  timezone us_timezone NOT NULL DEFAULT 'US/Eastern',
  clover_merchant_id TEXT,
  clover_api_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create settings table
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 70.00 CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  report_time_cycle TIME NOT NULL DEFAULT '21:00:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id)
);

-- Create sub_admin_stores join table
CREATE TABLE public.sub_admin_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sub_admin_id, merchant_id)
);

-- Create employee_sales_data table
CREATE TABLE public.employee_sales_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  sales_date DATE NOT NULL,
  total_sales DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  commission_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(merchant_id, employee_id, sales_date)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_admin_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_sales_data ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create RLS policies for merchants
CREATE POLICY "Merchants can view their own data" ON public.merchants
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can view all merchants" ON public.merchants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Sub-admins can view assigned merchants" ON public.merchants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sub_admin_stores sas
      JOIN public.profiles p ON p.id = sas.sub_admin_id
      WHERE p.id = auth.uid() AND sas.merchant_id = merchants.id
    )
  );

-- Create RLS policies for settings
CREATE POLICY "Merchants can manage their settings" ON public.settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = settings.merchant_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all settings" ON public.settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Create RLS policies for sub_admin_stores
CREATE POLICY "Admins can manage sub-admin assignments" ON public.sub_admin_stores
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Sub-admins can view their assignments" ON public.sub_admin_stores
  FOR SELECT USING (sub_admin_id = auth.uid());

-- Create RLS policies for employee_sales_data
CREATE POLICY "Merchants can view their sales data" ON public.employee_sales_data
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = employee_sales_data.merchant_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all sales data" ON public.employee_sales_data
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Sub-admins can view assigned store sales data" ON public.employee_sales_data
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sub_admin_stores sas
      JOIN public.profiles p ON p.id = sas.sub_admin_id
      WHERE p.id = auth.uid() AND sas.merchant_id = employee_sales_data.merchant_id
    )
  );

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'merchant');
  RETURN NEW;
END;
$$;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at timestamps
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_merchants_updated_at
    BEFORE UPDATE ON public.merchants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON public.settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employee_sales_data_updated_at
    BEFORE UPDATE ON public.employee_sales_data
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();