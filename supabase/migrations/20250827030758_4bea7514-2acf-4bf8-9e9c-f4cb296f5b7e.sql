-- Update the create_cron_job function to support the new three-step pipeline
CREATE OR REPLACE FUNCTION public.create_cron_job_pipeline(
  job_name text, 
  cron_expression text, 
  merchant_id uuid, 
  function_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Delete existing job if it exists to avoid duplicates
  PERFORM cron.unschedule(job_name);
  
  -- Create the new cron job with the appropriate function
  PERFORM cron.schedule(
    job_name,
    cron_expression,
    FORMAT(
      'SELECT net.http_post(
        url := ''https://qownsvcdfguwpdmepsvg.supabase.co/functions/v1/%s'',
        headers := ''{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvd25zdmNkZmd1d3BkbWVwc3ZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTAzOTI1OCwiZXhwIjoyMDcwNjE1MjU4fQ.5Z3eOzY4r_d4cBHvkA8Bz6DzQ5QIpUlQBzWG8C9R4gE"}''::jsonb,
        body := ''{"merchantId": "%s"}''::jsonb
      );',
      function_name,
      merchant_id
    )
  );
  
  RAISE NOTICE 'Created cron job % with expression % for merchant % calling function %', job_name, cron_expression, merchant_id, function_name;
END;
$function$;

-- Update the settings trigger to create three-step pipeline jobs
CREATE OR REPLACE FUNCTION public.handle_settings_cron_job_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  merchant_timezone TEXT;
  shop_name TEXT;
  fetch_delay INTEGER;
  report_delay INTEGER;
BEGIN
  -- Get merchant timezone and shop name
  SELECT m.timezone, m.shop_name 
  INTO merchant_timezone, shop_name
  FROM merchants m 
  WHERE m.id = COALESCE(NEW.merchant_id, OLD.merchant_id);
  
  IF TG_OP = 'DELETE' THEN
    -- Delete all three cron jobs when settings are deleted
    PERFORM public.delete_cron_job('schedule-data-fetch-' || OLD.merchant_id::text);
    PERFORM public.delete_cron_job('fetch-sales-data-' || OLD.merchant_id::text);
    PERFORM public.delete_cron_job('generate-report-' || OLD.merchant_id::text);
    -- Also delete old format job if it exists
    PERFORM public.delete_cron_job('auto-report-' || OLD.merchant_id::text);
    RAISE NOTICE 'Deleted all cron jobs for merchant % (%)', OLD.merchant_id, shop_name;
    RETURN OLD;
  END IF;
  
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Only update if report time changed or it's an insert
    IF TG_OP = 'UPDATE' AND OLD.report_time_cycle = NEW.report_time_cycle THEN
      -- No change in report time, skip update
      RETURN NEW;
    END IF;
    
    -- Get delay settings
    fetch_delay := COALESCE(NEW.fetch_delay_minutes, 1);
    report_delay := COALESCE(NEW.report_delay_minutes, 2);
    
    -- Calculate UTC time from local time and timezone
    DECLARE
      local_hour INTEGER;
      local_minute INTEGER;
      utc_hour INTEGER;
      timezone_offset INTEGER;
      schedule_cron_expr TEXT;
      fetch_cron_expr TEXT;
      generate_cron_expr TEXT;
      fetch_minute INTEGER;
      generate_minute INTEGER;
      fetch_hour INTEGER;
      generate_hour INTEGER;
    BEGIN
      -- Parse the time
      local_hour := EXTRACT(HOUR FROM NEW.report_time_cycle::time);
      local_minute := EXTRACT(MINUTE FROM NEW.report_time_cycle::time);
      
      -- Simple timezone offset mapping (you might want to enhance this for DST)
      timezone_offset := CASE merchant_timezone
        WHEN 'US/Eastern' THEN 4   -- Assuming EDT (UTC-4)
        WHEN 'US/Central' THEN 5   -- CDT is UTC-5
        WHEN 'US/Mountain' THEN 6  -- MDT is UTC-6
        WHEN 'US/Pacific' THEN 7   -- PDT is UTC-7
        WHEN 'US/Alaska' THEN 8    -- AKDT is UTC-8
        WHEN 'US/Hawaii' THEN 10   -- HST is UTC-10 (no DST)
        ELSE 4 -- Default to Eastern Daylight Time
      END;
      
      -- Convert to UTC for schedule step
      utc_hour := local_hour + timezone_offset;
      
      -- Handle day rollover
      IF utc_hour >= 24 THEN
        utc_hour := utc_hour - 24;
      ELSIF utc_hour < 0 THEN
        utc_hour := utc_hour + 24;
      END IF;
      
      -- Create schedule cron expression
      schedule_cron_expr := local_minute || ' ' || utc_hour || ' * * *';
      
      -- Calculate fetch step time (schedule time + fetch_delay minutes)
      fetch_minute := local_minute + fetch_delay;
      fetch_hour := utc_hour;
      
      IF fetch_minute >= 60 THEN
        fetch_hour := fetch_hour + (fetch_minute / 60);
        fetch_minute := fetch_minute % 60;
      END IF;
      
      IF fetch_hour >= 24 THEN
        fetch_hour := fetch_hour - 24;
      END IF;
      
      fetch_cron_expr := fetch_minute || ' ' || fetch_hour || ' * * *';
      
      -- Calculate generate step time (schedule time + report_delay minutes)
      generate_minute := local_minute + report_delay;
      generate_hour := utc_hour;
      
      IF generate_minute >= 60 THEN
        generate_hour := generate_hour + (generate_minute / 60);
        generate_minute := generate_minute % 60;
      END IF;
      
      IF generate_hour >= 24 THEN
        generate_hour := generate_hour - 24;
      END IF;
      
      generate_cron_expr := generate_minute || ' ' || generate_hour || ' * * *';
      
      -- Delete old jobs first
      PERFORM public.delete_cron_job('schedule-data-fetch-' || NEW.merchant_id::text);
      PERFORM public.delete_cron_job('fetch-sales-data-' || NEW.merchant_id::text);
      PERFORM public.delete_cron_job('generate-report-' || NEW.merchant_id::text);
      PERFORM public.delete_cron_job('auto-report-' || NEW.merchant_id::text); -- Remove old format
      
      -- Create the three new cron jobs
      PERFORM public.create_cron_job_pipeline(
        'schedule-data-fetch-' || NEW.merchant_id::text,
        schedule_cron_expr,
        NEW.merchant_id,
        'schedule-data-fetch'
      );
      
      PERFORM public.create_cron_job_pipeline(
        'fetch-sales-data-' || NEW.merchant_id::text,
        fetch_cron_expr,
        NEW.merchant_id,
        'fetch-sales-data'
      );
      
      PERFORM public.create_cron_job_pipeline(
        'generate-report-' || NEW.merchant_id::text,
        generate_cron_expr,
        NEW.merchant_id,
        'generate-scheduled-report'
      );
      
      RAISE NOTICE 'Created three-step cron jobs for merchant % (%)', NEW.merchant_id, shop_name;
      RAISE NOTICE 'Schedule: %, Fetch: %, Generate: %', schedule_cron_expr, fetch_cron_expr, generate_cron_expr;
    END;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$function$;