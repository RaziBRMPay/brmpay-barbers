-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Check if pg_net extension is also available (needed for HTTP requests in cron jobs)
CREATE EXTENSION IF NOT EXISTS pg_net;