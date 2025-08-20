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
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toISOString().split('T')[0];

    console.log(`Checking for merchants with report time around ${currentTime}`);

    // Find merchants whose report_time_cycle matches current time (within 5 minutes)
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

      // Check if current time is within 5 minutes of report time
      if (isTimeToGenerateReport(currentTime, reportTime)) {
        console.log(`Generating report for merchant: ${merchantName} (${merchantId})`);

        try {
          // Generate PDF report for yesterday's data
          const reportResponse = await supabaseClient.functions.invoke('generate-pdf-report', {
            body: {
              merchantId,
              reportDate: yesterdayDate,
              reportType: 'daily_sales'
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
            
            // Update last_completed_report_cycle_time
            await supabaseClient
              .from('settings')
              .update({
                last_completed_report_cycle_time: now.toISOString()
              })
              .eq('merchant_id', merchantId);

            results.push({
              merchantId,
              merchantName,
              success: true,
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
  const [currentH, currentM, currentS] = currentTime.split(':').map(Number);
  const [reportH, reportM, reportS] = reportTime.split(':').map(Number);

  const currentMinutes = currentH * 60 + currentM;
  const reportMinutes = reportH * 60 + reportM;

  // Check if current time is within 5 minutes of report time
  const diff = Math.abs(currentMinutes - reportMinutes);
  return diff <= 5;
}

serve(handler);