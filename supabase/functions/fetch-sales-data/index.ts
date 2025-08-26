import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  console.log('Fetch Sales Data function called');

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

    console.log(`Fetching sales data for merchant: ${merchantId}`);

    const currentDate = new Date().toISOString().split('T')[0];

    // Check if there's a pending fetch record
    const { data: pipelineStatus, error: pipelineError } = await supabaseClient
      .from('report_pipeline_status')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('pipeline_date', currentDate)
      .eq('step_name', 'fetch')
      .eq('status', 'pending')
      .single();

    if (pipelineError || !pipelineStatus) {
      throw new Error(`No pending fetch found for merchant ${merchantId} on ${currentDate}`);
    }

    // Update status to in_progress
    await supabaseClient
      .from('report_pipeline_status')
      .update({ 
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .eq('id', pipelineStatus.id);

    try {
      // Call the clover-sales function to fetch fresh sales data
      console.log(`Calling clover-sales function for merchant: ${merchantId}`);
      const { data: salesData, error: salesError } = await supabaseClient.functions.invoke('clover-sales', {
        body: {
          merchantId,
          startDate: pipelineStatus.data_period_start,
          endDate: pipelineStatus.data_period_end
        }
      });

      if (salesError) {
        throw new Error(`Sales data fetch failed: ${salesError.message}`);
      }

      console.log(`Successfully fetched sales data for merchant: ${merchantId}`);

      // Update pipeline status to completed
      await supabaseClient
        .from('report_pipeline_status')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', pipelineStatus.id);

      // Create pending generate record for the next step
      const { error: generatePipelineError } = await supabaseClient
        .from('report_pipeline_status')
        .upsert({
          merchant_id: merchantId,
          pipeline_date: currentDate,
          step_name: 'generate',
          status: 'pending',
          data_period_start: pipelineStatus.data_period_start,
          data_period_end: pipelineStatus.data_period_end
        });

      if (generatePipelineError) {
        throw new Error(`Failed to create generate pipeline status: ${generatePipelineError.message}`);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Sales data fetched successfully for merchant ${merchantId}`,
          merchantId,
          salesData: salesData?.salesData || [],
          dataFetched: true
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );

    } catch (fetchError) {
      console.error(`Error fetching sales data for merchant ${merchantId}:`, fetchError);
      
      // Update pipeline status to failed
      await supabaseClient
        .from('report_pipeline_status')
        .update({ 
          status: 'failed',
          error_message: fetchError.message,
          retry_count: pipelineStatus.retry_count + 1
        })
        .eq('id', pipelineStatus.id);

      throw fetchError;
    }

  } catch (error) {
    console.error('Error in fetch-sales-data function:', error);
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