import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  console.log('Generate Scheduled Report function called');

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

    console.log(`Generating scheduled report for merchant: ${merchantId}`);

    const currentDate = new Date().toISOString().split('T')[0];

    // Check if there's a pending generate record and fetch completed
    const { data: pipelineStatuses, error: pipelineError } = await supabaseClient
      .from('report_pipeline_status')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('pipeline_date', currentDate)
      .in('step_name', ['fetch', 'generate']);

    if (pipelineError) {
      throw new Error(`Failed to fetch pipeline status: ${pipelineError.message}`);
    }

    const fetchStatus = pipelineStatuses.find(p => p.step_name === 'fetch');
    const generateStatus = pipelineStatuses.find(p => p.step_name === 'generate');

    if (!fetchStatus || fetchStatus.status !== 'completed') {
      throw new Error(`Sales data fetch not completed for merchant ${merchantId} on ${currentDate}`);
    }

    if (!generateStatus || generateStatus.status !== 'pending') {
      throw new Error(`No pending report generation found for merchant ${merchantId} on ${currentDate}`);
    }

    // Update generate status to in_progress
    await supabaseClient
      .from('report_pipeline_status')
      .update({ 
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .eq('id', generateStatus.id);

    try {
      // Get merchant data for report generation
      const { data: merchant, error: merchantError } = await supabaseClient
        .from('merchants')
        .select('*')
        .eq('id', merchantId)
        .single();

      if (merchantError) {
        throw new Error(`Failed to fetch merchant data: ${merchantError.message}`);
      }

      // Get the fresh sales data that was just fetched
      const { data: salesData, error: salesError } = await supabaseClient
        .from('employee_sales_data')
        .select('*')
        .eq('merchant_id', merchantId)
        .gte('sales_date', fetchStatus.data_period_start.split('T')[0])
        .lte('sales_date', fetchStatus.data_period_end.split('T')[0])
        .order('sales_date', { ascending: false });

      if (salesError) {
        throw new Error(`Failed to fetch sales data: ${salesError.message}`);
      }

      console.log(`Calling generate-pdf-report function for merchant: ${merchantId}`);
      
      // Call the generate-pdf-report function with fresh data
      const { data: reportData, error: reportError } = await supabaseClient.functions.invoke('generate-pdf-report', {
        body: {
          merchantId,
          salesData: salesData || [],
          reportDate: currentDate,
          merchantName: merchant.shop_name,
          isScheduled: true
        }
      });

      if (reportError) {
        throw new Error(`Report generation failed: ${reportError.message}`);
      }

      console.log(`Successfully generated report for merchant: ${merchantId}`);

      // Update pipeline status to completed
      await supabaseClient
        .from('report_pipeline_status')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', generateStatus.id);

      // Update the merchant's last completed report cycle time
      const { error: settingsUpdateError } = await supabaseClient
        .from('settings')
        .update({ 
          last_completed_report_cycle_time: new Date().toISOString()
        })
        .eq('merchant_id', merchantId);

      if (settingsUpdateError) {
        console.error('Failed to update last completed report cycle time:', settingsUpdateError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Report generated successfully for merchant ${merchantId}`,
          merchantId,
          reportData,
          pipelineCompleted: true
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );

    } catch (generateError) {
      console.error(`Error generating report for merchant ${merchantId}:`, generateError);
      
      // Update pipeline status to failed
      await supabaseClient
        .from('report_pipeline_status')
        .update({ 
          status: 'failed',
          error_message: generateError.message,
          retry_count: generateStatus.retry_count + 1
        })
        .eq('id', generateStatus.id);

      throw generateError;
    }

  } catch (error) {
    console.error('Error in generate-scheduled-report function:', error);
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