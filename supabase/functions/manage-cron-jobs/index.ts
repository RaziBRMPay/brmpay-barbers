import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timezone mapping for US timezones
const TIMEZONE_OFFSETS = {
  'US/Eastern': -5,    // EST (UTC-5)
  'US/Central': -6,    // CST (UTC-6)
  'US/Mountain': -7,   // MST (UTC-7)
  'US/Pacific': -8,    // PST (UTC-8)
  'US/Alaska': -9,     // AKST (UTC-9)
  'US/Hawaii': -10,    // HST (UTC-10)
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
    const timezoneOffset = TIMEZONE_OFFSETS[timezone as keyof typeof TIMEZONE_OFFSETS] || -5;
    
    // Create date for today at the report time in local timezone
    const now = new Date();
    const localNow = new Date(now.getTime() + (timezoneOffset * 60 * 60 * 1000));
    
    const nextRun = new Date();
    // Set the time in local timezone by adjusting for the offset
    nextRun.setUTCHours(hours - timezoneOffset, minutes, 0, 0);
    
    // If time has passed today in local timezone, schedule for tomorrow
    const localReportTime = new Date();
    localReportTime.setUTCHours(hours - timezoneOffset, minutes, 0, 0);
    
    if (localReportTime <= now) {
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: {
          jobName,
          cronExpression,
          isConfigured: true,
          nextRunTime: nextRun.toISOString(),
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
  
  // Get timezone offset (this is a simplified approach)
  const offset = TIMEZONE_OFFSETS[timezone as keyof typeof TIMEZONE_OFFSETS] || -5;
  
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