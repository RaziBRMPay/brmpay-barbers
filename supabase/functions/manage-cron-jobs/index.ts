import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Function to check if a date is during Daylight Saving Time
const isDST = (date: Date): boolean => {
  const year = date.getFullYear();
  // DST starts on the second Sunday in March
  const dstStart = new Date(year, 2, 1); // March 1st
  dstStart.setDate(dstStart.getDate() + (7 - dstStart.getDay()) + 7); // Second Sunday
  
  // DST ends on the first Sunday in November
  const dstEnd = new Date(year, 10, 1); // November 1st
  dstEnd.setDate(dstEnd.getDate() + (7 - dstEnd.getDay())); // First Sunday
  
  return date >= dstStart && date < dstEnd;
};

// Function to get timezone offset accounting for DST
const getTimezoneOffset = (timezone: string, date: Date = new Date()): number => {
  const baseOffsets = {
    'US/Eastern': isDST(date) ? -4 : -5,   // EDT/EST
    'US/Central': isDST(date) ? -5 : -6,   // CDT/CST
    'US/Mountain': isDST(date) ? -6 : -7,  // MDT/MST
    'US/Pacific': isDST(date) ? -7 : -8,   // PDT/PST
    'US/Alaska': isDST(date) ? -8 : -9,    // AKDT/AKST
    'US/Hawaii': -10,   // HST (no DST)
  };
  
  return baseOffsets[timezone as keyof typeof baseOffsets] || -5;
};

const handler = async (req: Request): Promise<Response> => {
  console.log('Manage Cron Jobs function called');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { action, merchantId, reportTime, timezone } = body;

    console.log(`Processing cron job action: ${action} for merchant: ${merchantId}`);

    switch (action) {
      case 'create':
        return await createCronJob(supabaseClient, merchantId, reportTime, timezone);
      case 'update':
        return await updateCronJob(supabaseClient, merchantId, reportTime, timezone);
      case 'delete':
        return await deleteCronJob(supabaseClient, merchantId);
      case 'setup_all':
        return await setupAllMerchantCronJobs(supabaseClient);
      case 'status':
        return await getCronJobStatus(supabaseClient, merchantId);
      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error: any) {
    console.error('Error in manage-cron-jobs function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
};

async function createCronJob(supabaseClient: any, merchantId: string, reportTime: string, timezone: string): Promise<Response> {
  const cronExpression = convertToCronExpression(reportTime, timezone);
  const jobName = `auto-report-${merchantId}`;
  
  console.log(`Creating cron job ${jobName} with expression: ${cronExpression}`);
  
  const { error } = await supabaseClient.rpc('create_cron_job', {
    job_name: jobName,
    cron_expression: cronExpression,
    merchant_id: merchantId
  });

  if (error) {
    console.error('Error creating cron job:', error);
    throw new Error(`Failed to create cron job: ${error.message}`);
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Cron job created for merchant ${merchantId}`,
      jobName,
      cronExpression
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

async function updateCronJob(supabaseClient: any, merchantId: string, reportTime: string, timezone: string): Promise<Response> {
  // Delete the old cron job first
  await deleteCronJob(supabaseClient, merchantId);
  
  // Create a new one with updated settings
  return await createCronJob(supabaseClient, merchantId, reportTime, timezone);
}

async function deleteCronJob(supabaseClient: any, merchantId: string): Promise<Response> {
  const jobName = `auto-report-${merchantId}`;
  
  console.log(`Deleting cron job: ${jobName}`);
  
  const { error } = await supabaseClient.rpc('delete_cron_job', {
    job_name: jobName
  });

  if (error) {
    console.error('Error deleting cron job:', error);
    // Don't throw error if job doesn't exist
    if (!error.message.includes('does not exist')) {
      throw new Error(`Failed to delete cron job: ${error.message}`);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Cron job deleted for merchant ${merchantId}`,
      jobName
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

async function getCronJobStatus(supabaseClient: any, merchantId: string): Promise<Response> {
  const jobName = `auto-report-${merchantId}`;
  
  console.log(`Getting status for cron job: ${jobName}`);
  
  try {
    // Get merchant settings to determine current configuration
    const { data: settings, error: settingsError } = await supabaseClient
      .from('settings')
      .select(`
        report_time_cycle,
        last_completed_report_cycle_time,
        merchants!inner (
          timezone,
          shop_name
        )
      `)
      .eq('merchant_id', merchantId)
      .single();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      throw new Error(`Failed to fetch settings: ${settingsError.message}`);
    }

    const timezone = settings.merchants.timezone;
    const reportTime = settings.report_time_cycle;
    const cronExpression = convertToCronExpression(reportTime, timezone);
    
    // Calculate next run time in the merchant's local timezone
    const [hours, minutes] = reportTime.split(':').map(Number);
    const now = new Date();
    
    // Get the current timezone offset for DST handling
    const timezoneOffset = getTimezoneOffset(timezone, now);
    
    // Create a date representing the report time in the merchant's timezone
    // We need to create a UTC time that, when converted to the merchant's timezone, shows the correct local time
    const nextRun = new Date();
    
    // Set the UTC time such that when converted to the merchant's timezone, it shows the desired local time
    // If we want 9 PM Eastern (UTC-4), we need to set UTC to 1 AM next day (9 PM + 4 hours)
    nextRun.setUTCHours(hours - timezoneOffset, minutes, 0, 0);
    
    // If the local time has passed today, move to tomorrow
    const localTime = new Date();
    localTime.setHours(hours, minutes, 0, 0);
    
    if (localTime <= now) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }
    
    // For display purposes, we want to show the local time (not UTC time)
    // Create a display time that represents the local time
    const displayTime = new Date();
    displayTime.setHours(hours, minutes, 0, 0);
    if (displayTime <= now) {
      displayTime.setDate(displayTime.getDate() + 1);
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: {
          jobName,
          cronExpression,
          isConfigured: true,
          nextRunTime: displayTime.toISOString(),
          lastCompletedRun: settings.last_completed_report_cycle_time,
          reportTime: reportTime,
          timezone: timezone,
          shopName: settings.merchants.shop_name
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        status: {
          jobName,
          isConfigured: false,
          error: error.message
        }
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
}

async function setupAllMerchantCronJobs(supabaseClient: any): Promise<Response> {
  console.log('Setting up cron jobs for all merchants');
  
  // Get all merchants with their settings
  const { data: settings, error: settingsError } = await supabaseClient
    .from('settings')
    .select(`
      merchant_id,
      report_time_cycle,
      merchants!inner (
        id,
        shop_name,
        timezone
      )
    `);

  if (settingsError) {
    console.error('Error fetching settings:', settingsError);
    throw new Error(`Failed to fetch settings: ${settingsError.message}`);
  }

  const results = [];
  
  for (const setting of settings || []) {
    try {
      const merchantId = setting.merchant_id;
      const reportTime = setting.report_time_cycle;
      const timezone = setting.merchants.timezone;
      const shopName = setting.merchants.shop_name;
      
      console.log(`Setting up cron job for ${shopName} (${merchantId})`);
      
      const cronExpression = convertToCronExpression(reportTime, timezone);
      const jobName = `auto-report-${merchantId}`;
      
      // Delete existing job if it exists (to avoid duplicates)
      await supabaseClient.rpc('delete_cron_job', {
        job_name: jobName
      });
      
      // Create new cron job
      const { error } = await supabaseClient.rpc('create_cron_job', {
        job_name: jobName,
        cron_expression: cronExpression,
        merchant_id: merchantId
      });

      if (error) {
        console.error(`Error creating cron job for ${shopName}:`, error);
        results.push({
          merchantId,
          shopName,
          success: false,
          error: error.message
        });
      } else {
        console.log(`Successfully created cron job for ${shopName}`);
        results.push({
          merchantId,
          shopName,
          success: true,
          jobName,
          cronExpression
        });
      }
    } catch (error: any) {
      console.error(`Error processing merchant ${setting.merchant_id}:`, error);
      results.push({
        merchantId: setting.merchant_id,
        success: false,
        error: error.message
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  return new Response(
    JSON.stringify({
      success: true,
      message: `Setup completed. ${successCount} successful, ${failureCount} failed`,
      results
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    }
  );
}

function convertToCronExpression(reportTime: string, timezone: string): string {
  // Parse the local time (HH:MM:SS format)
  const [hours, minutes] = reportTime.split(':').map(Number);
  
  // Get timezone offset accounting for DST
  const offset = getTimezoneOffset(timezone);
  
  // Convert local time to UTC
  let utcHours = hours - offset;
  
  // Handle day rollover
  if (utcHours >= 24) {
    utcHours -= 24;
  } else if (utcHours < 0) {
    utcHours += 24;
  }
  
  // Return cron expression (minute hour * * *)
  // Run daily at the specified UTC time
  return `${minutes} ${utcHours} * * *`;
}

serve(handler);