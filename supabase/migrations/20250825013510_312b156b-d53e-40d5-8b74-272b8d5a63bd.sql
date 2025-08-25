-- Create database functions to manage cron jobs for automatic report scheduling

-- Function to create a cron job for a merchant
CREATE OR REPLACE FUNCTION public.create_cron_job(
  job_name TEXT,
  cron_expression TEXT,
  merchant_id UUID
) RETURNS VOID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete a cron job
CREATE OR REPLACE FUNCTION public.delete_cron_job(
  job_name TEXT
) RETURNS VOID AS $$
BEGIN
  -- Unschedule the cron job (doesn't error if job doesn't exist)
  PERFORM cron.unschedule(job_name);
  
  RAISE NOTICE 'Deleted cron job %', job_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle settings changes and update cron jobs
CREATE OR REPLACE FUNCTION public.handle_settings_cron_job_update()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically manage cron jobs when settings change
DROP TRIGGER IF EXISTS settings_cron_job_trigger ON settings;
CREATE TRIGGER settings_cron_job_trigger
  AFTER INSERT OR UPDATE OR DELETE ON settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_settings_cron_job_update();

-- Function to setup all existing merchant cron jobs (for migration)
CREATE OR REPLACE FUNCTION public.setup_all_merchant_cron_jobs()
RETURNS TABLE(merchant_id UUID, shop_name TEXT, success BOOLEAN, message TEXT) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;