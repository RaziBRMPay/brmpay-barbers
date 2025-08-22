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

    // Get current time
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS format

    console.log(`Checking for merchants with exact report time: ${currentTime}`);

    // Find merchants whose report_time_cycle exactly matches current time
    const { data: settings, error: settingsError } = await supabaseClient
      .from('settings')
      .select(`
        *,
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

    let processedReports = 0;
    const results = [];

    for (const setting of settings || []) {
      const reportTime = setting.report_time_cycle;
      const merchantId = setting.merchant_id;
      const merchantName = setting.merchants.shop_name;
      const merchantTimezone = setting.merchants.timezone;
      const lastCompletedTime = setting.last_completed_report_cycle_time;

      // Check if current time exactly matches report time
      if (isTimeToGenerateReport(currentTime, reportTime)) {
        console.log(`Checking report generation for merchant: ${merchantName} (${merchantId})`);
        
        // Calculate the business day period that just ended
        const businessDayEnd = new Date(now);
        const businessDayStart = new Date(now);
        businessDayStart.setDate(businessDayStart.getDate() - 1);
        
        // Set the exact times based on report_time_cycle
        const [hours, minutes, seconds] = reportTime.split(':').map(Number);
        businessDayEnd.setHours(hours, minutes, seconds, 999); // End at HH:MM:SS.999
        businessDayStart.setHours(hours, minutes, seconds, 0); // Start at HH:MM:SS.000
        
        const startDateTime = businessDayStart.toISOString();
        const endDateTime = businessDayEnd.toISOString();

        // Check if we already generated a report for this business period
        const businessDayEndTime = businessDayEnd.toISOString();
        
        if (lastCompletedTime && new Date(lastCompletedTime) >= businessDayEnd) {
          console.log(`Report already generated for business period ending at ${businessDayEndTime} for merchant ${merchantName}`);
          continue;
        }

        console.log(`Generating report for merchant: ${merchantName} - Period: ${startDateTime} to ${endDateTime}`);

        try {
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
            results.push({
              merchantId,
              merchantName,
              success: false,
              error: reportResponse.error.message
            });
          } else {
            console.log(`Report generated successfully for ${merchantName}`);
            
            // Update last_completed_report_cycle_time to the business day end time
            await supabaseClient
              .from('settings')
              .update({
                last_completed_report_cycle_time: businessDayEndTime
              })
              .eq('merchant_id', merchantId);

            results.push({
              merchantId,
              merchantName,
              success: true,
              businessPeriod: `${startDateTime} to ${endDateTime}`,
              reportData: reportResponse.data
            });
            processedReports++;
          }
        } catch (error: any) {
          console.error(`Error processing report for ${merchantName}:`, error);
          results.push({
            merchantId,
            merchantName,
            success: false,
            error: error.message
          });
        }
      }
    }

    console.log(`Auto report scheduler completed. Processed ${processedReports} reports.`);

    return new Response(
      JSON.stringify({
        success: true,
        processedReports,
        timestamp: now.toISOString(),
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

function isTimeToGenerateReport(currentTime: string, reportTime: string): boolean {
  // Extract time components
  const [currentH, currentM, currentS] = currentTime.split(':').map(Number);
  const [reportH, reportM, reportS] = reportTime.split(':').map(Number);

  // Check for exact time match (HH:MM:SS)
  return currentH === reportH && currentM === reportM && currentS === reportS;
}

serve(handler);