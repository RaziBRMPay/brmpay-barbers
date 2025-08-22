-- Enable required extensions for cron scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create cron job to run auto-report-scheduler every minute
-- This will check for merchants whose report time matches current time
SELECT cron.schedule(
  'auto-daily-reports',
  '* * * * *', -- Run every minute to check for report times
  $$
  SELECT
    net.http_post(
        url:='https://qownsvcdfguwpdmepsvg.supabase.co/functions/v1/auto-report-scheduler',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvd25zdmNkZmd1d3BkbWVwc3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMzkyNTgsImV4cCI6MjA3MDYxNTI1OH0.Fjr3faABJ5znAVM_KBr_BkdQP9q4QKmdJIf6DozDW2g"}'::jsonb,
        body:=concat('{"timestamp": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);