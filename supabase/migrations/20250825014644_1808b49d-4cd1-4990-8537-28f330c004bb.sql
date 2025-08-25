-- Fix the setup function to handle non-existent cron jobs gracefully
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
      
      -- Create the cron job directly (the create function handles deletion safely)
      PERFORM cron.schedule(
        'auto-report-' || setting_record.merchant_id::text,
        cron_expr,
        FORMAT(
          'SELECT net.http_post(
            url := ''https://qownsvcdfguwpdmepsvg.supabase.co/functions/v1/auto-report-scheduler'',
            headers := ''{"Content-Type": "application/json", "Authorization": "Bearer %s"}''::jsonb,
            body := ''{"merchantId": "%s"}''::jsonb
          );',
          current_setting('app.jwt_secret', true),
          setting_record.merchant_id
        )
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