-- Create cron job for daily sales sync (runs every 4 hours to keep data fresh)
SELECT cron.schedule(
  'daily-sales-sync',
  '0 */4 * * *', -- Every 4 hours
  $$
  SELECT net.http_post(
    url := 'https://qownsvcdfguwpdmepsvg.supabase.co/functions/v1/daily-sales-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvd25zdmNkZmd1d3BkbWVwc3ZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTAzOTI1OCwiZXhwIjoyMDcwNjE1MjU4fQ.5Z3eOzY4r_d4cBHvkA8Bz6DzQ5QIpUlQBzWG8C9R4gE"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);