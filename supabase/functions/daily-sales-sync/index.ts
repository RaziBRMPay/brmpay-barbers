import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const handler = async (req: Request): Promise<Response> => {
  console.log('Daily Sales Sync function called');

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

    // Parse request body to get specific merchant ID (optional)
    const body = await req.json().catch(() => ({}));
    const { merchantId } = body;

    let merchantsToSync = [];

    if (merchantId) {
      // Sync specific merchant
      const { data: merchant, error: merchantError } = await supabaseClient
        .from('merchants')
        .select('id, shop_name, timezone')
        .eq('id', merchantId)
        .single();

      if (merchantError) {
        throw new Error(`Failed to fetch merchant: ${merchantError.message}`);
      }

      merchantsToSync = [merchant];
    } else {
      // Sync all merchants
      const { data: merchants, error: merchantsError } = await supabaseClient
        .from('merchants')
        .select('id, shop_name, timezone');

      if (merchantsError) {
        throw new Error(`Failed to fetch merchants: ${merchantsError.message}`);
      }

      merchantsToSync = merchants || [];
    }

    const results = [];
    
    for (const merchant of merchantsToSync) {
      try {
        console.log(`Syncing sales data for ${merchant.shop_name} (${merchant.id})`);
        
        // Calculate yesterday's sales period
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        
        // Set to business day boundaries (e.g., 6 AM to 6 AM)
        const startDate = new Date(yesterday);
        startDate.setHours(6, 0, 0, 0);
        
        const endDate = new Date(now);
        endDate.setHours(6, 0, 0, 0);
        
        const startDateTime = startDate.toISOString();
        const endDateTime = endDate.toISOString();
        
        console.log(`Fetching sales data for ${merchant.shop_name} from ${startDateTime} to ${endDateTime}`);
        
        // Fetch sales data from Clover
        const salesResponse = await supabaseClient.functions.invoke('clover-sales', {
          body: {
            merchantId: merchant.id,
            startDate: startDateTime,
            endDate: endDateTime
          }
        });

        if (salesResponse.error) {
          console.error(`Error fetching sales data for ${merchant.shop_name}:`, salesResponse.error);
          results.push({
            merchantId: merchant.id,
            shopName: merchant.shop_name,
            success: false,
            error: salesResponse.error.message
          });
        } else {
          console.log(`Successfully synced sales data for ${merchant.shop_name}`);
          results.push({
            merchantId: merchant.id,
            shopName: merchant.shop_name,
            success: true,
            salesData: salesResponse.data
          });
        }
      } catch (error: any) {
        console.error(`Error syncing merchant ${merchant.id}:`, error);
        results.push({
          merchantId: merchant.id,
          shopName: merchant.shop_name,
          success: false,
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log(`Daily sales sync completed. ${successCount} successful, ${failureCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sales sync completed. ${successCount} successful, ${failureCount} failed`,
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
    console.error('Error in daily-sales-sync function:', error);
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

serve(handler);