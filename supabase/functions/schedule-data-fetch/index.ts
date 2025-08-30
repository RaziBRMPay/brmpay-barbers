import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timezone offset mapping with DST awareness
const getTimezoneOffset = (timezone: string, date = new Date()): number => {
  const isDST = (date: Date): boolean => {
    const year = date.getFullYear();
    const marchSecondSunday = new Date(year, 2, 14 - new Date(year, 2, 1).getDay());
    const novFirstSunday = new Date(year, 10, 7 - new Date(year, 10, 1).getDay());
    return date >= marchSecondSunday && date < novFirstSunday;
  };

  const offsets = {
    'US/Eastern': isDST(date) ? 4 : 5,
    'US/Central': isDST(date) ? 5 : 6,
    'US/Mountain': isDST(date) ? 6 : 7,
    'US/Pacific': isDST(date) ? 7 : 8,
    'US/Alaska': isDST(date) ? 8 : 9,
    'US/Hawaii': 10 // Hawaii doesn't observe DST
  };

  return offsets[timezone as keyof typeof offsets] || 4; // Default to Eastern
};

// Calculate report cycle periods for a merchant
const calculateReportPeriods = (reportTime: string, timezone: string, currentDate = new Date()) => {
  const [hours, minutes] = reportTime.split(':').map(Number);
  
  // Create today's report time in merchant's local timezone
  const todayReportTime = new Date(currentDate);
  todayReportTime.setHours(hours, minutes, 0, 0);
  
  // Determine which report cycle we're calculating for
  // If current time is after today's report time, the current cycle is today's report time
  // If current time is before today's report time, the current cycle is yesterday's report time
  const currentReportCycle = currentDate >= todayReportTime 
    ? todayReportTime 
    : new Date(todayReportTime.getTime() - 24 * 60 * 60 * 1000);
  
  // Previous report cycle is always 24 hours before current cycle
  const previousReportCycle = new Date(currentReportCycle.getTime() - 24 * 60 * 60 * 1000);
  
  // Convert to UTC (subtract offset because US timezones are UTC-X)
  const timezoneOffset = getTimezoneOffset(timezone, currentDate);
  
  // Convert local time to UTC by adding the offset hours
  const previousReportCycleUTC = new Date(previousReportCycle.getTime() + (timezoneOffset * 60 * 60 * 1000));
  const currentReportCycleUTC = new Date(currentReportCycle.getTime() + (timezoneOffset * 60 * 60 * 1000));
  
  // Debug logging for verification
  console.log(`Report period calculation for ${timezone}:`, {
    reportTime,
    localPrevious: previousReportCycle.toISOString(),
    localCurrent: currentReportCycle.toISOString(),
    utcPrevious: previousReportCycleUTC.toISOString(),
    utcCurrent: currentReportCycleUTC.toISOString(),
    offsetHours: timezoneOffset
  });
  
  return {
    start: previousReportCycleUTC.toISOString(),
    end: currentReportCycleUTC.toISOString()
  };
};

const handler = async (req: Request): Promise<Response> => {
  console.log('Schedule Data Fetch function called');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { merchantId } = await req.json();
    if (!merchantId) {
      throw new Error('Merchant ID is required');
    }

    console.log(`Scheduling data fetch for merchant: ${merchantId}`);

    // Get current date for pipeline tracking
    const currentDate = new Date().toISOString().split('T')[0];

    // Get merchant settings and timezone
    const { data: settings, error: settingsError } = await supabaseClient
      .from('settings')
      .select('*, merchants!inner(timezone)')
      .eq('merchant_id', merchantId)
      .single();

    if (settingsError) {
      throw new Error(`Failed to fetch merchant settings: ${settingsError.message}`);
    }

    // Calculate dynamic report periods based on merchant's report time cycle and timezone
    const merchantTimezone = settings.merchants.timezone;
    const reportTime = settings.report_time_cycle;
    const reportPeriods = calculateReportPeriods(reportTime, merchantTimezone);
    
    console.log(`Calculated report periods for merchant ${merchantId}:`, {
      timezone: merchantTimezone,
      reportTime,
      periods: reportPeriods
    });

    // Create pipeline status record for the schedule step
    const { error: pipelineError } = await supabaseClient
      .from('report_pipeline_status')
      .upsert({
        merchant_id: merchantId,
        pipeline_date: currentDate,
        step_name: 'schedule',
        status: 'completed',
        completed_at: new Date().toISOString(),
        data_period_start: reportPeriods.start,
        data_period_end: reportPeriods.end
      });

    if (pipelineError) {
      throw new Error(`Failed to create pipeline status: ${pipelineError.message}`);
    }

    // Create pending fetch record for the next step
    const { error: fetchPipelineError } = await supabaseClient
      .from('report_pipeline_status')
      .upsert({
        merchant_id: merchantId,
        pipeline_date: currentDate,
        step_name: 'fetch',
        status: 'pending',
        data_period_start: reportPeriods.start,
        data_period_end: reportPeriods.end
      });

    if (fetchPipelineError) {
      throw new Error(`Failed to create fetch pipeline status: ${fetchPipelineError.message}`);
    }

    console.log(`Successfully scheduled data fetch for merchant: ${merchantId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Data fetch scheduled for merchant ${merchantId}`,
        merchantId,
        pipelineDate: currentDate
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in schedule-data-fetch function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
};

serve(handler);