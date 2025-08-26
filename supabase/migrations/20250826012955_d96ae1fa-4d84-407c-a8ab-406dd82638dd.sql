-- Fix the cron job function to use proper service role key
CREATE OR REPLACE FUNCTION public.create_cron_job(job_name text, cron_expression text, merchant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        headers := ''{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvd25zdmNkZmd1d3BkbWVwc3ZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTAzOTI1OCwiZXhwIjoyMDcwNjE1MjU4fQ.5Z3eOzY4r_d4cBHvkA8Bz6DzQ5QIpUlQBzWG8C9R4gE"}''::jsonb,
        body := ''{"merchantId": "%s"}''::jsonb
      );',
      merchant_id
    )
  );
  
  RAISE NOTICE 'Created cron job % with expression % for merchant %', job_name, cron_expression, merchant_id;
END;
$function$;