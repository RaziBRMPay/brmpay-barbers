-- Create employee_commissions table for per-employee commission configuration
CREATE TABLE public.employee_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  commission_percentage NUMERIC NOT NULL DEFAULT 70.00,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(merchant_id, employee_id)
);

-- Enable RLS on employee_commissions
ALTER TABLE public.employee_commissions ENABLE ROW LEVEL SECURITY;

-- Create policies for employee_commissions
CREATE POLICY "Admins can manage all employee commissions" 
ON public.employee_commissions 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role
));

CREATE POLICY "Merchants can manage their employee commissions" 
ON public.employee_commissions 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM merchants m 
  WHERE m.id = employee_commissions.merchant_id AND m.user_id = auth.uid()
));

CREATE POLICY "Sub-admins can view assigned store employee commissions" 
ON public.employee_commissions 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM sub_admin_stores sas 
  JOIN profiles p ON p.id = sas.sub_admin_id 
  WHERE p.id = auth.uid() AND sas.merchant_id = employee_commissions.merchant_id
));

-- Create reports table for automated PDF reports
CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'daily_sales',
  file_url TEXT,
  file_name TEXT,
  report_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(merchant_id, report_date, report_type)
);

-- Enable RLS on reports
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Create policies for reports
CREATE POLICY "Admins can manage all reports" 
ON public.reports 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role
));

CREATE POLICY "Merchants can manage their reports" 
ON public.reports 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM merchants m 
  WHERE m.id = reports.merchant_id AND m.user_id = auth.uid()
));

CREATE POLICY "Sub-admins can view assigned store reports" 
ON public.reports 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM sub_admin_stores sas 
  JOIN profiles p ON p.id = sas.sub_admin_id 
  WHERE p.id = auth.uid() AND sas.merchant_id = reports.merchant_id
));

-- Add last_completed_report_cycle_time to settings table
ALTER TABLE public.settings 
ADD COLUMN last_completed_report_cycle_time TIMESTAMP WITH TIME ZONE;

-- Create trigger for automatic timestamp updates on employee_commissions
CREATE TRIGGER update_employee_commissions_updated_at
BEFORE UPDATE ON public.employee_commissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_employee_commissions_merchant_id ON public.employee_commissions(merchant_id);
CREATE INDEX idx_employee_commissions_employee_id ON public.employee_commissions(employee_id);
CREATE INDEX idx_reports_merchant_id ON public.reports(merchant_id);
CREATE INDEX idx_reports_date ON public.reports(report_date);
CREATE INDEX idx_employee_sales_data_merchant_date ON public.employee_sales_data(merchant_id, sales_date);