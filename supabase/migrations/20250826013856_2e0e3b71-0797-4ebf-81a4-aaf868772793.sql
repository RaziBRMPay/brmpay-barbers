-- Create report pipeline status table to track the three-step process
CREATE TABLE public.report_pipeline_status (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id uuid NOT NULL,
    pipeline_date date NOT NULL,
    step_name text NOT NULL CHECK (step_name IN ('schedule', 'fetch', 'generate')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    error_message text,
    retry_count integer DEFAULT 0,
    data_period_start timestamp with time zone,
    data_period_end timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(merchant_id, pipeline_date, step_name)
);

-- Enable RLS
ALTER TABLE public.report_pipeline_status ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Enhanced merchant access for pipeline status" 
ON public.report_pipeline_status 
FOR ALL 
USING (validate_merchant_access(merchant_id));

CREATE POLICY "Admins can manage all pipeline status" 
ON public.report_pipeline_status 
FOR ALL 
USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'::user_role
));

-- Add pipeline configuration to settings table for dynamic timing
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS fetch_delay_minutes integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS report_delay_minutes integer DEFAULT 2;

-- Add trigger for updated_at
CREATE TRIGGER update_report_pipeline_status_updated_at
    BEFORE UPDATE ON public.report_pipeline_status
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();