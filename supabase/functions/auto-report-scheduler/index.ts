import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  console.log('Auto Report Scheduler function called');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body to get merchant ID
    const body = await req.json();
    const { merchantId } = body;

    if (!merchantId) {
      throw new Error('Merchant ID is required');
    }

    console.log(`Generating report for merchant: ${merchantId}`);

    // Get merchant settings
    const { data: setting, error: settingsError } = await supabaseClient
      .from('settings')
      .select(`
        *,
        merchants!inner (
          id,
          shop_name,
          timezone
        )
      `)
      .eq('merchant_id', merchantId)
      .single();

    if (settingsError) {
      console.error('Error fetching settings:', settingsError);
      throw new Error(`Failed to fetch settings: ${settingsError.message}`);
    }

    if (!setting) {
      throw new Error(`No settings found for merchant: ${merchantId}`);
    }

    const merchantName = setting.merchants.shop_name;
    const merchantTimezone = setting.merchants.timezone;
    const reportTime = setting.report_time_cycle;
    const lastCompletedTime = setting.last_completed_report_cycle_time;

    console.log(`Processing report for merchant: ${merchantName} in timezone: ${merchantTimezone}`);

    // Calculate the business day period that just ended
    const now = new Date();
    const businessDayEnd = new Date(now);
    const businessDayStart = new Date(now);
    businessDayStart.setDate(businessDayStart.getDate() - 1);
    
    // Set the exact times based on report_time_cycle
    const [hours, minutes, seconds] = reportTime.split(':').map(Number);
    businessDayEnd.setHours(hours, minutes, seconds, 999); // End at HH:MM:SS.999
    businessDayStart.setHours(hours, minutes, seconds, 0); // Start at HH:MM:SS.000
    
    const startDateTime = businessDayStart.toISOString();
    const endDateTime = businessDayEnd.toISOString();
    const businessDayEndTime = businessDayEnd.toISOString();

    // Check if we already generated a report for this business period
    if (lastCompletedTime && new Date(lastCompletedTime) >= businessDayEnd) {
      console.log(`Report already generated for business period ending at ${businessDayEndTime} for merchant ${merchantName}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Report already generated for this period',
          merchantId,
          merchantName,
          businessPeriod: `${startDateTime} to ${endDateTime}`
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

    console.log(`Generating report for merchant: ${merchantName} - Period: ${startDateTime} to ${endDateTime}`);

    try {
      // First, fetch fresh sales data from Clover for the period
      console.log(`Fetching fresh sales data for period: ${startDateTime} to ${endDateTime}`);
      
      const salesResponse = await supabaseClient.functions.invoke('clover-sales', {
        body: {
          merchantId,
          startDate: startDateTime,
          endDate: endDateTime
        }
      });

      if (salesResponse.error) {
        console.error(`Error fetching sales data for ${merchantName}:`, salesResponse.error);
        // Continue with report generation even if sales fetch fails
        console.log('Continuing with report generation using existing data...');
      } else {
        console.log(`Sales data fetched successfully for ${merchantName}`);
      }

      // Generate PDF report for the business day period that just ended
      const reportResponse = await supabaseClient.functions.invoke('generate-pdf-report', {
        body: {
          merchantId,
          startDateTime,
          endDateTime,
          reportType: 'daily_sales',
          businessDayEnd: businessDayEndTime
        }
      });

      if (reportResponse.error) {
        console.error(`Error generating report for ${merchantName}:`, reportResponse.error);
        throw new Error(reportResponse.error.message);
      } else {
        console.log(`Report generated successfully for ${merchantName}`);
        
        // Update last_completed_report_cycle_time to the business day end time
        const { error: updateError } = await supabaseClient
          .from('settings')
          .update({
            last_completed_report_cycle_time: businessDayEndTime
          })
          .eq('merchant_id', merchantId);

        if (updateError) {
          console.error('Error updating last_completed_report_cycle_time:', updateError);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Report generated successfully',
            merchantId,
            merchantName,
            businessPeriod: `${startDateTime} to ${endDateTime}`,
            reportData: reportResponse.data
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
    } catch (error: any) {
      console.error(`Error processing report for ${merchantName}:`, error);
      throw error;
    }

  } catch (error: any) {
    console.error('Error in auto-report-scheduler function:', error);
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

// This function is no longer needed as we now handle single merchant per execution

serve(handler);