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
  try {
    console.log(`Creating three-step cron jobs for merchant: ${merchantId}`);
    
    // Get pipeline settings (fetch and report delays)
    const { data: settings, error: settingsError } = await supabaseClient
      .from('settings')
      .select('fetch_delay_minutes, report_delay_minutes')
      .eq('merchant_id', merchantId)
      .single();
    
    if (settingsError) {
      console.error('Failed to fetch settings, using defaults:', settingsError);
    }
    
    const fetchDelay = settings?.fetch_delay_minutes || 1;
    const reportDelay = settings?.report_delay_minutes || 2;
    
    // Generate cron expressions for all three steps
    const scheduleCronExpression = convertToCronExpression(reportTime, timezone);
    const fetchCronExpression = convertToCronExpressionWithDelay(reportTime, timezone, fetchDelay);
    const generateCronExpression = convertToCronExpressionWithDelay(reportTime, timezone, reportDelay);
    
    console.log(`Generated cron expressions:`);
    console.log(`Schedule: ${scheduleCronExpression}`);
    console.log(`Fetch: ${fetchCronExpression}`);
    console.log(`Generate: ${generateCronExpression}`);
    
    // Create three cron jobs for the pipeline
    const jobs = [
      {
        name: `schedule-data-fetch-${merchantId}`,
        expression: scheduleCronExpression,
        function: 'schedule-data-fetch'
      },
      {
        name: `fetch-sales-data-${merchantId}`,
        expression: fetchCronExpression,
        function: 'fetch-sales-data'
      },
      {
        name: `generate-report-${merchantId}`,
        expression: generateCronExpression,
        function: 'generate-scheduled-report'
      }
    ];
    
    for (const job of jobs) {
      const { error } = await supabaseClient.rpc('create_cron_job_pipeline', {
        job_name: job.name,
        cron_expression: job.expression,
        merchant_id: merchantId,
        function_name: job.function
      });
      
      if (error) {
        throw new Error(`Failed to create ${job.function} cron job: ${error.message}`);
      }
      
      console.log(`Created ${job.function} cron job: ${job.name} with expression: ${job.expression}`);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Three-step cron jobs created successfully for merchant ${merchantId}`,
        jobs: jobs.map(j => ({ name: j.name, expression: j.expression, function: j.function }))
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
    console.error(`Error creating cron jobs for merchant ${merchantId}:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}

async function updateCronJob(supabaseClient: any, merchantId: string, reportTime: string, timezone: string): Promise<Response> {
  try {
    console.log(`Updating three-step cron jobs for merchant: ${merchantId}`);
    
    // Delete the old cron jobs first
    await deleteCronJob(supabaseClient, merchantId);
    
    // Create new ones with updated settings
    return await createCronJob(supabaseClient, merchantId, reportTime, timezone);
  } catch (error: any) {
    console.error(`Error updating cron jobs for merchant ${merchantId}:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}

async function deleteCronJob(supabaseClient: any, merchantId: string): Promise<Response> {
  try {
    console.log(`Deleting three-step cron jobs for merchant: ${merchantId}`);
    
    const jobNames = [
      `schedule-data-fetch-${merchantId}`,
      `fetch-sales-data-${merchantId}`,
      `generate-report-${merchantId}`,
      `auto-report-${merchantId}` // Also delete old format job if it exists
    ];
    
    for (const jobName of jobNames) {
      const { error } = await supabaseClient.rpc('delete_cron_job', {
        job_name: jobName
      });
      
      if (error) {
        console.warn(`Failed to delete cron job ${jobName}: ${error.message}`);
      } else {
        console.log(`Deleted cron job: ${jobName}`);
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `All cron jobs deleted successfully for merchant ${merchantId}`,
        deletedJobs: jobNames
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
    console.error(`Error deleting cron jobs for merchant ${merchantId}:`, error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}

async function getCronJobStatus(supabaseClient: any, merchantId: string): Promise<Response> {
  console.log(`Getting status for three-step cron jobs for merchant: ${merchantId}`);
  
  try {
    // Get merchant settings to determine current configuration
    const { data: settings, error: settingsError } = await supabaseClient
      .from('settings')
      .select(`
        report_time_cycle,
        last_completed_report_cycle_time,
        fetch_delay_minutes,
        report_delay_minutes,
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
    
    // Generate all three cron expressions
    const fetchDelay = settings.fetch_delay_minutes || 1;
    const reportDelay = settings.report_delay_minutes || 2;
    
    const scheduleCronExpression = convertToCronExpression(reportTime, timezone);
    const fetchCronExpression = convertToCronExpressionWithDelay(reportTime, timezone, fetchDelay);
    const generateCronExpression = convertToCronExpressionWithDelay(reportTime, timezone, reportDelay);
    
    // Calculate next run time in the merchant's local timezone
    const [hours, minutes] = reportTime.split(':').map(Number);
    const now = new Date();
    
    // Get the current timezone offset for DST handling
    const timezoneOffset = getTimezoneOffset(timezone, now);
    
    // Create a display time that represents the local time in merchant's timezone
    const nextRunTime = new Date();
    nextRunTime.setHours(hours, minutes, 0, 0);
    
    // If the local time has passed today, move to tomorrow
    if (nextRunTime <= now) {
      nextRunTime.setDate(nextRunTime.getDate() + 1);
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: {
          jobName: `schedule-data-fetch-${merchantId}`,
          cronExpression: scheduleCronExpression,
          isConfigured: true,
          nextRunTime: nextRunTime.toISOString(),
          lastCompletedRun: settings.last_completed_report_cycle_time,
          reportTime: reportTime,
          timezone: timezone,
          shopName: settings.merchants.shop_name,
          pipeline: {
            schedule: {
              jobName: `schedule-data-fetch-${merchantId}`,
              cronExpression: scheduleCronExpression
            },
            fetch: {
              jobName: `fetch-sales-data-${merchantId}`,
              cronExpression: fetchCronExpression
            },
            generate: {
              jobName: `generate-report-${merchantId}`,
              cronExpression: generateCronExpression
            }
          }
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
          jobName: `schedule-data-fetch-${merchantId}`,
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
  console.log('Setting up three-step cron jobs for all merchants');
  
  // Get all merchants with their settings
  const { data: settings, error: settingsError } = await supabaseClient
    .from('settings')
    .select(`
      merchant_id,
      report_time_cycle,
      fetch_delay_minutes,
      report_delay_minutes,
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
      
      console.log(`Setting up three-step cron jobs for ${shopName} (${merchantId})`);
      
      // Delete all old jobs first (both old and new formats)
      const oldJobNames = [
        `auto-report-${merchantId}`,
        `schedule-data-fetch-${merchantId}`,
        `fetch-sales-data-${merchantId}`,
        `generate-report-${merchantId}`
      ];
      
      for (const jobName of oldJobNames) {
        await supabaseClient.rpc('delete_cron_job', {
          job_name: jobName
        });
      }
      
      // Now create the new three-step pipeline using the createCronJob function
      const createResponse = await createCronJob(supabaseClient, merchantId, reportTime, timezone);
      
      if (createResponse.status === 200) {
        console.log(`Successfully created three-step cron jobs for ${shopName}`);
        results.push({
          merchantId,
          shopName,
          success: true,
          message: `Three-step cron jobs created successfully`
        });
      } else {
        const errorData = await createResponse.json();
        console.error(`Error creating cron jobs for ${shopName}:`, errorData);
        results.push({
          merchantId,
          shopName,
          success: false,
          error: errorData.error || 'Unknown error'
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
  
  console.log(`Converting ${reportTime} in ${timezone} to UTC`);
  console.log(`Local hours: ${hours}, Timezone offset: ${offset}`);
  
  // Convert local time to UTC
  // For negative offsets (US timezones), we need to add the absolute value
  // Example: 9 PM Eastern (UTC-4) = 21 + 4 = 25 -> 1 AM UTC next day
  let utcHours = hours + Math.abs(offset);
  
  console.log(`UTC hours before rollover: ${utcHours}`);
  
  // Handle day rollover
  if (utcHours >= 24) {
    utcHours -= 24;
  } else if (utcHours < 0) {
    utcHours += 24;
  }
  
  console.log(`Final UTC hours: ${utcHours}`);
  
  // Return cron expression (minute hour * * *)
  // Run daily at the specified UTC time
  const cronExpr = `${minutes} ${utcHours} * * *`;
  console.log(`Generated cron expression: ${cronExpr}`);
  
  return cronExpr;
}

function convertToCronExpressionWithDelay(reportTime: string, timezone: string, delayMinutes: number): string {
  console.log(`Converting ${reportTime} in ${timezone} to UTC with ${delayMinutes} minute delay`);
  
  // Parse the time (format: HH:MM:SS)
  const [hours, minutes] = reportTime.split(':').map(Number);
  
  // Add delay minutes
  let totalMinutes = minutes + delayMinutes;
  let adjustedHours = hours;
  
  // Handle minute rollover
  if (totalMinutes >= 60) {
    adjustedHours += Math.floor(totalMinutes / 60);
    totalMinutes = totalMinutes % 60;
  }
  
  // Get timezone offset
  const offset = getTimezoneOffset(timezone);
  console.log(`Local hours: ${adjustedHours}, Minutes: ${totalMinutes}, Timezone offset: ${offset}`);
  
  // Convert to UTC
  let utcHours = adjustedHours + Math.abs(offset);
  console.log(`UTC hours before rollover: ${utcHours}`);
  
  // Handle day rollover
  if (utcHours >= 24) {
    utcHours -= 24;
  } else if (utcHours < 0) {
    utcHours += 24;
  }
  
  console.log(`Final UTC hours: ${utcHours}, Minutes: ${totalMinutes}`);
  
  // Create cron expression (minute hour * * *)
  const cronExpression = `${totalMinutes} ${utcHours} * * *`;
  console.log(`Generated delayed cron expression: ${cronExpression}`);
  
  return cronExpression;
}

serve(handler);