-- Clean up the old global cron job that runs every minute
SELECT cron.unschedule('auto-report-generation');