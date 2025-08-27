-- Create the new three-step cron jobs directly
SELECT 
  cron.schedule(
    'schedule-data-fetch-a67ece2b-472e-4377-aff8-d41742d8d465',
    '0 1 * * *',
    'SELECT net.http_post(
      url := ''https://qownsvcdfguwpdmepsvg.supabase.co/functions/v1/schedule-data-fetch'',
      headers := ''{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvd25zdmNkZmd1d3BkbWVwc3ZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTAzOTI1OCwiZXhwIjoyMDcwNjE1MjU4fQ.5Z3eOzY4r_d4cBHvkA8Bz6DzQ5QIpUlQBzWG8C9R4gE"}''::jsonb,
      body := ''{"merchantId": "a67ece2b-472e-4377-aff8-d41742d8d465"}''::jsonb
    );'
  ),
  cron.schedule(
    'fetch-sales-data-a67ece2b-472e-4377-aff8-d41742d8d465',
    '1 1 * * *',
    'SELECT net.http_post(
      url := ''https://qownsvcdfguwpdmepsvg.supabase.co/functions/v1/fetch-sales-data'',
      headers := ''{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvd25zdmNkZmd1d3BkbWVwc3ZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTAzOTI1OCwiZXhwIjoyMDcwNjE1MjU4fQ.5Z3eOzY4r_d4cBHvkA8Bz6DzQ5QIpUlQBzWG8C9R4gE"}''::jsonb,
      body := ''{"merchantId": "a67ece2b-472e-4377-aff8-d41742d8d465"}''::jsonb
    );'
  ),
  cron.schedule(
    'generate-report-a67ece2b-472e-4377-aff8-d41742d8d465',
    '2 1 * * *',
    'SELECT net.http_post(
      url := ''https://qownsvcdfguwpdmepsvg.supabase.co/functions/v1/generate-scheduled-report'',
      headers := ''{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvd25zdmNkZmd1d3BkbWVwc3ZnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTAzOTI1OCwiZXhwIjoyMDcwNjE1MjU4fQ.5Z3eOzY4r_d4cBHvkA8Bz6DzQ5QIpUlQBzWG8C9R4gE"}''::jsonb,
      body := ''{"merchantId": "a67ece2b-472e-4377-aff8-d41742d8d465"}''::jsonb
    );'
  );