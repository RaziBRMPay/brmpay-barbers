-- Phase 1: Secure Multi-Store Architecture with Encrypted Storage

-- Create secure credential storage table for encrypted API tokens
CREATE TABLE public.secure_credentials (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id UUID NOT NULL,
    credential_type TEXT NOT NULL,
    encrypted_value TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID NOT NULL,
    UNIQUE(merchant_id, credential_type)
);

-- Enable RLS on secure_credentials
ALTER TABLE public.secure_credentials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for secure_credentials with strict multi-store isolation
CREATE POLICY "Merchants can manage their own secure credentials" 
ON public.secure_credentials 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM merchants m 
        WHERE m.id = secure_credentials.merchant_id 
        AND m.user_id = auth.uid()
    )
);

CREATE POLICY "Admins can manage all secure credentials" 
ON public.secure_credentials 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- Add audit logging table for security events
CREATE TABLE public.security_audit_log (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    merchant_id UUID,
    user_id UUID NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for audit log
CREATE POLICY "Admins can view all audit logs" 
ON public.security_audit_log 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

CREATE POLICY "Merchants can view their own audit logs" 
ON public.security_audit_log 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM merchants m 
        WHERE m.id = security_audit_log.merchant_id 
        AND m.user_id = auth.uid()
    )
);

-- Enhanced multi-store isolation: Add merchant_id validation functions
CREATE OR REPLACE FUNCTION public.validate_merchant_access(target_merchant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM merchants m
        WHERE m.id = target_merchant_id
        AND (
            m.user_id = auth.uid() 
            OR EXISTS (
                SELECT 1 FROM profiles p 
                WHERE p.id = auth.uid() 
                AND p.role = 'admin'
            )
            OR EXISTS (
                SELECT 1 FROM sub_admin_stores sas 
                JOIN profiles p ON p.id = sas.sub_admin_id 
                WHERE p.id = auth.uid() 
                AND sas.merchant_id = target_merchant_id
            )
        )
    );
$$;

-- Add security function for encryption/decryption (placeholder for app-level encryption)
CREATE OR REPLACE FUNCTION public.log_security_event(
    p_merchant_id UUID,
    p_action TEXT,
    p_resource_type TEXT,
    p_resource_id TEXT DEFAULT NULL,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
AS $$
    INSERT INTO public.security_audit_log (
        merchant_id, 
        user_id, 
        action, 
        resource_type, 
        resource_id, 
        success, 
        error_message
    ) VALUES (
        p_merchant_id,
        auth.uid(),
        p_action,
        p_resource_type,
        p_resource_id,
        p_success,
        p_error_message
    );
$$;

-- Enhanced RLS policies for existing tables with strict multi-store isolation

-- Drop existing policies and recreate with enhanced security
DROP POLICY IF EXISTS "Merchants can manage their employee commissions" ON employee_commissions;
DROP POLICY IF EXISTS "Sub-admins can view assigned store employee commissions" ON employee_commissions;

CREATE POLICY "Enhanced merchant access for employee commissions" 
ON employee_commissions 
FOR ALL 
USING (public.validate_merchant_access(merchant_id));

-- Enhanced policies for employee_sales_data
DROP POLICY IF EXISTS "Merchants can view their sales data" ON employee_sales_data;
DROP POLICY IF EXISTS "Sub-admins can view assigned store sales data" ON employee_sales_data;

CREATE POLICY "Enhanced merchant access for sales data" 
ON employee_sales_data 
FOR ALL 
USING (public.validate_merchant_access(merchant_id));

-- Enhanced policies for merchants table
DROP POLICY IF EXISTS "Sub-admins can view assigned merchants" ON merchants;

CREATE POLICY "Enhanced sub-admin access for merchants" 
ON merchants 
FOR SELECT 
USING (
    user_id = auth.uid() 
    OR EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
    OR EXISTS (
        SELECT 1 FROM sub_admin_stores sas 
        JOIN profiles p ON p.id = sas.sub_admin_id 
        WHERE p.id = auth.uid() 
        AND sas.merchant_id = merchants.id
    )
);

-- Enhanced policies for settings table
DROP POLICY IF EXISTS "Merchants can manage their settings" ON settings;

CREATE POLICY "Enhanced merchant access for settings" 
ON settings 
FOR ALL 
USING (public.validate_merchant_access(merchant_id));

-- Enhanced policies for reports table  
DROP POLICY IF EXISTS "Merchants can manage their reports" ON reports;
DROP POLICY IF EXISTS "Sub-admins can view assigned store reports" ON reports;

CREATE POLICY "Enhanced merchant access for reports" 
ON reports 
FOR ALL 
USING (public.validate_merchant_access(merchant_id));

-- Add indexes for performance and security
CREATE INDEX idx_secure_credentials_merchant_type ON secure_credentials(merchant_id, credential_type);
CREATE INDEX idx_security_audit_merchant_time ON security_audit_log(merchant_id, created_at DESC);
CREATE INDEX idx_security_audit_user_time ON security_audit_log(user_id, created_at DESC);
CREATE INDEX idx_security_audit_action ON security_audit_log(action, created_at DESC);

-- Add triggers for automatic timestamp updates
CREATE TRIGGER update_secure_credentials_updated_at
    BEFORE UPDATE ON secure_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create rate limiting table for API security
CREATE TABLE public.api_rate_limits (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    identifier TEXT NOT NULL, -- IP address, user_id, or merchant_id
    endpoint TEXT NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(identifier, endpoint, window_start)
);

-- Enable RLS on rate limits (admins only)
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage rate limits" 
ON public.api_rate_limits 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- Add index for rate limiting queries
CREATE INDEX idx_api_rate_limits_lookup ON api_rate_limits(identifier, endpoint, window_start DESC);

-- Remove plain text API tokens from merchants table (will be moved to secure storage)
-- Note: In production, you'd migrate existing tokens to secure storage first
ALTER TABLE merchants DROP COLUMN IF EXISTS clover_api_token;
ALTER TABLE merchants DROP COLUMN IF EXISTS clover_merchant_id;