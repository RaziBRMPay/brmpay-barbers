-- Fix security issues by setting search_path for all functions

-- Update the create_cron_job function to set search_path
CREATE OR REPLACE FUNCTION public.create_cron_job(
  job_name TEXT,
  cron_expression TEXT,
  merchant_id UUID
) RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete existing job if it exists to avoid duplicates
  PERFORM cron.unschedule(job_name);
  
  -- Create the new cron job
  PERFORM cron.schedule(
    job_name,
    cron_expression,
    FORMAT(
      'SELECT net.http_post(
        url := ''https://qownsvcdfguwpdmepsvg.supabase.co/functions/v1/auto-report-scheduler'',
        headers := ''{"Content-Type": "application/json", "Authorization": "Bearer %s"}''::jsonb,
        body := ''{"merchantId": "%s"}''::jsonb
      );',
      current_setting('app.jwt_secret', true),
      merchant_id
    )
  );
  
  RAISE NOTICE 'Created cron job % with expression % for merchant %', job_name, cron_expression, merchant_id;
END;
$$;

-- Update the delete_cron_job function to set search_path
CREATE OR REPLACE FUNCTION public.delete_cron_job(
  job_name TEXT
) RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Unschedule the cron job (doesn't error if job doesn't exist)
  PERFORM cron.unschedule(job_name);
  
  RAISE NOTICE 'Deleted cron job %', job_name;
END;
$$;

-- Update the handle_settings_cron_job_update function to set search_path
CREATE OR REPLACE FUNCTION public.handle_settings_cron_job_update()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  merchant_timezone TEXT;
  shop_name TEXT;
BEGIN
  -- Get merchant timezone and shop name
  SELECT m.timezone, m.shop_name 
  INTO merchant_timezone, shop_name
  FROM merchants m 
  WHERE m.id = COALESCE(NEW.merchant_id, OLD.merchant_id);
  
  IF TG_OP = 'DELETE' THEN
    -- Delete the cron job when settings are deleted
    PERFORM public.delete_cron_job('auto-report-' || OLD.merchant_id::text);
    RAISE NOTICE 'Deleted cron job for merchant % (%)', OLD.merchant_id, shop_name;
    RETURN OLD;
  END IF;
  
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Create/update the cron job when settings are inserted or updated
    IF TG_OP = 'UPDATE' AND OLD.report_time_cycle = NEW.report_time_cycle THEN
      -- No change in report time, skip update
      RETURN NEW;
    END IF;
    
    -- Calculate UTC time from local time and timezone
    -- This is a simplified conversion - in production you might want more sophisticated timezone handling
    DECLARE
      local_hour INTEGER;
      local_minute INTEGER;
      utc_hour INTEGER;
      timezone_offset INTEGER;
      cron_expr TEXT;
    BEGIN
      -- Parse the time
      local_hour := EXTRACT(HOUR FROM NEW.report_time_cycle::time);
      local_minute := EXTRACT(MINUTE FROM NEW.report_time_cycle::time);
      
      -- Simple timezone offset mapping (you might want to enhance this)
      timezone_offset := CASE merchant_timezone
        WHEN 'US/Eastern' THEN 5   -- EST is UTC-5, so add 5 to get UTC
        WHEN 'US/Central' THEN 6   -- CST is UTC-6
        WHEN 'US/Mountain' THEN 7  -- MST is UTC-7
        WHEN 'US/Pacific' THEN 8   -- PST is UTC-8
        WHEN 'US/Alaska' THEN 9    -- AKST is UTC-9
        WHEN 'US/Hawaii' THEN 10   -- HST is UTC-10
        ELSE 5 -- Default to Eastern
      END;
      
      -- Convert to UTC
      utc_hour := local_hour + timezone_offset;
      
      -- Handle day rollover
      IF utc_hour >= 24 THEN
        utc_hour := utc_hour - 24;
      ELSIF utc_hour < 0 THEN
        utc_hour := utc_hour + 24;
      END IF;
      
      -- Create cron expression (minute hour * * *)
      cron_expr := local_minute || ' ' || utc_hour || ' * * *';
      
      -- Create the cron job
      PERFORM public.create_cron_job(
        'auto-report-' || NEW.merchant_id::text,
        cron_expr,
        NEW.merchant_id
      );
      
      RAISE NOTICE 'Created/updated cron job for merchant % (%): % (UTC)', NEW.merchant_id, shop_name, cron_expr;
    END;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Update the setup_all_merchant_cron_jobs function to set search_path
CREATE OR REPLACE FUNCTION public.setup_all_merchant_cron_jobs()
RETURNS TABLE(merchant_id UUID, shop_name TEXT, success BOOLEAN, message TEXT) 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  setting_record RECORD;
  cron_expr TEXT;
  local_hour INTEGER;
  local_minute INTEGER;
  utc_hour INTEGER;
  timezone_offset INTEGER;
BEGIN
  FOR setting_record IN 
    SELECT s.merchant_id, s.report_time_cycle, m.timezone, m.shop_name
    FROM settings s
    JOIN merchants m ON m.id = s.merchant_id
  LOOP
    BEGIN
      -- Parse the time
      local_hour := EXTRACT(HOUR FROM setting_record.report_time_cycle::time);
      local_minute := EXTRACT(MINUTE FROM setting_record.report_time_cycle::time);
      
      -- Simple timezone offset mapping
      timezone_offset := CASE setting_record.timezone
        WHEN 'US/Eastern' THEN 5
        WHEN 'US/Central' THEN 6
        WHEN 'US/Mountain' THEN 7
        WHEN 'US/Pacific' THEN 8
        WHEN 'US/Alaska' THEN 9
        WHEN 'US/Hawaii' THEN 10
        ELSE 5
      END;
      
      -- Convert to UTC
      utc_hour := local_hour + timezone_offset;
      
      -- Handle day rollover
      IF utc_hour >= 24 THEN
        utc_hour := utc_hour - 24;
      ELSIF utc_hour < 0 THEN
        utc_hour := utc_hour + 24;
      END IF;
      
      -- Create cron expression
      cron_expr := local_minute || ' ' || utc_hour || ' * * *';
      
      -- Create the cron job
      PERFORM public.create_cron_job(
        'auto-report-' || setting_record.merchant_id::text,
        cron_expr,
        setting_record.merchant_id
      );
      
      -- Return success
      merchant_id := setting_record.merchant_id;
      shop_name := setting_record.shop_name;
      success := true;
      message := 'Cron job created successfully with expression: ' || cron_expr;
      RETURN NEXT;
      
    EXCEPTION WHEN OTHERS THEN
      -- Return failure
      merchant_id := setting_record.merchant_id;
      shop_name := setting_record.shop_name;
      success := false;
      message := 'Error: ' || SQLERRM;
      RETURN NEXT;
    END;
  END LOOP;
  
  RETURN;
END;
$$;

-- Update existing functions to set search_path as well

-- Update validate_merchant_access function
CREATE OR REPLACE FUNCTION public.validate_merchant_access(target_merchant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
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

-- Update log_security_event function
CREATE OR REPLACE FUNCTION public.log_security_event(p_merchant_id uuid, p_action text, p_resource_type text, p_resource_id text DEFAULT NULL::text, p_success boolean DEFAULT true, p_error_message text DEFAULT NULL::text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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

-- Update handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'merchant');
  RETURN NEW;
END;
$$;

-- Update update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;