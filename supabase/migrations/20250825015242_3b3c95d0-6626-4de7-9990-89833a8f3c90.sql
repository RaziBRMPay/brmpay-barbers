-- Setup cron jobs for all existing merchants
DO $$
DECLARE
  setting_record RECORD;
  cron_expr TEXT;
  local_hour INTEGER;
  local_minute INTEGER;
  utc_hour INTEGER;
  timezone_offset INTEGER;
  job_name TEXT;
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
      job_name := 'auto-report-' || setting_record.merchant_id::text;
      
      -- Create the cron job
      PERFORM cron.schedule(
        job_name,
        cron_expr,
        FORMAT(
          'SELECT net.http_post(
            url := ''https://qownsvcdfguwpdmepsvg.supabase.co/functions/v1/auto-report-scheduler'',
            headers := ''{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvd25zdmNkZmd1d3BkbWVwc3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMzkyNTgsImV4cCI6MjA3MDYxNTI1OH0.Fjr3faABJ5znAVM_KBr_BkdQP9q4QKmdJIf6DozDW2g"}''::jsonb,
            body := ''{"merchantId": "%s"}''::jsonb
          );',
          setting_record.merchant_id
        )
      );
      
      RAISE NOTICE 'Created cron job % with expression % for merchant % (%)', job_name, cron_expr, setting_record.merchant_id, setting_record.shop_name;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Error creating cron job for merchant % (%): %', setting_record.merchant_id, setting_record.shop_name, SQLERRM;
    END;
  END LOOP;
END;
$$;