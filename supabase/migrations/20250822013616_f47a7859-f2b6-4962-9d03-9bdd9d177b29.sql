-- Update the cron job frequency to run every minute for more precise timing
SELECT cron.unschedule('auto-report-generation');

SELECT cron.schedule(
    'auto-report-generation',
    '* * * * *', -- Every minute for precise timing
    $$
    SELECT
      net.http_post(
          url:='https://qownsvcdfguwpdmepsvg.supabase.co/functions/v1/auto-report-scheduler',
          headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvd25zdmNkZmd1d3BkbWVwc3ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMzkyNTgsImV4cCI6MjA3MDYxNTI1OH0.Fjr3faABJ5znAVM_KBr_BkdQP9q4QKmdJIf6DozDW2g"}'::jsonb,
          body:='{"trigger": "cron"}'::jsonb
      ) as request_id;
    $$
);