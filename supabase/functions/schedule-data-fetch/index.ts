import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Get merchant settings and last report time
    const { data: settings, error: settingsError } = await supabaseClient
      .from('settings')
      .select('*')
      .eq('merchant_id', merchantId)
      .single();

    if (settingsError) {
      throw new Error(`Failed to fetch merchant settings: ${settingsError.message}`);
    }

    // Create pipeline status record for the schedule step
    const { error: pipelineError } = await supabaseClient
      .from('report_pipeline_status')
      .upsert({
        merchant_id: merchantId,
        pipeline_date: currentDate,
        step_name: 'schedule',
        status: 'completed',
        completed_at: new Date().toISOString(),
        data_period_start: settings.last_completed_report_cycle_time || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        data_period_end: new Date().toISOString()
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
        data_period_start: settings.last_completed_report_cycle_time || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        data_period_end: new Date().toISOString()
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