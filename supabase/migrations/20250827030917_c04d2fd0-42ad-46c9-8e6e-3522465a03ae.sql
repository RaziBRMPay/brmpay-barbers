-- Force update all existing cron jobs to use the new three-step pipeline
-- This will trigger the updated trigger function for all existing settings
UPDATE settings 
SET report_time_cycle = report_time_cycle
WHERE merchant_id IS NOT NULL;