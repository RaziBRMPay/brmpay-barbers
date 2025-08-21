import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// Simple decryption for demo - replace with proper encryption library
const simpleDecrypt = (encrypted: string): string => {
  try {
    return atob(encrypted);
  } catch {
    return '';
  }
};

const validateInput = (input: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!input.merchantId || typeof input.merchantId !== 'string') {
    errors.push('Valid merchant ID is required');
  }
  
  if (input.merchantId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.merchantId)) {
    errors.push('Invalid merchant ID format');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const checkRateLimit = async (supabase: any, identifier: string, endpoint: string): Promise<boolean> => {
  const windowStart = new Date();
  windowStart.setMinutes(windowStart.getMinutes() - 5); // 5-minute window
  
  try {
    // Check current request count in window
    const { data, error } = await supabase
      .from('api_rate_limits')
      .select('request_count')
      .eq('identifier', identifier)
      .eq('endpoint', endpoint)
      .gte('window_start', windowStart.toISOString())
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('Rate limit check error:', error);
      return false;
    }
    
    const currentCount = data?.request_count || 0;
    const maxRequests = 20; // Max 20 requests per 5-minute window
    
    if (currentCount >= maxRequests) {
      return false;
    }
    
    // Update or insert rate limit record
    await supabase
      .from('api_rate_limits')
      .upsert({
        identifier,
        endpoint,
        request_count: currentCount + 1,
        window_start: windowStart.toISOString()
      }, {
        onConflict: 'identifier,endpoint,window_start'
      });
    
    return true;
  } catch (error) {
    console.error('Rate limiting error:', error);
    return true; // Allow request if rate limiting fails
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwt = authHeader.split(' ')[1];
    
    // Verify JWT and get user
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting based on user ID
    const rateLimited = await checkRateLimit(supabase, user.id, 'clover-shop-info');
    if (!rateLimited) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestBody = await req.json();
    
    // Validate input
    const validation = validateInput(requestBody);
    if (!validation.isValid) {
      return new Response(JSON.stringify({ 
        error: 'Validation failed', 
        details: validation.errors 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { merchantId } = requestBody;

    // Verify user has access to this merchant
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('id, shop_name')
      .eq('id', merchantId)
      .eq('user_id', user.id)
      .single();

    if (merchantError || !merchant) {
      // Log security event
      await supabase.rpc('log_security_event', {
        p_merchant_id: merchantId,
        p_action: 'unauthorized_shop_info_access',
        p_resource_type: 'shop_info',
        p_success: false,
        p_error_message: 'User does not have access to this merchant'
      });

      return new Response(JSON.stringify({ error: 'Merchant not found or access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get secure credentials
    const { data: credentials, error: credError } = await supabase
      .from('secure_credentials')
      .select('credential_type, encrypted_value')
      .eq('merchant_id', merchantId)
      .eq('is_active', true)
      .in('credential_type', ['clover_merchant_id', 'clover_api_token']);

    if (credError) {
      console.error('Error fetching credentials:', credError);
      return new Response(JSON.stringify({ error: 'Failed to fetch credentials' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!credentials || credentials.length !== 2) {
      return new Response(JSON.stringify({ 
        error: 'Clover credentials not configured',
        shopName: merchant.shop_name // Return fallback shop name
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decrypt credentials
    const credMap: Record<string, string> = {};
    credentials.forEach(cred => {
      credMap[cred.credential_type] = simpleDecrypt(cred.encrypted_value);
    });

    const cloverMerchantId = credMap.clover_merchant_id;
    const cloverApiToken = credMap.clover_api_token;

    if (!cloverMerchantId || !cloverApiToken) {
      return new Response(JSON.stringify({ 
        error: 'Invalid Clover credentials',
        shopName: merchant.shop_name
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch merchant info from Clover API
    const cloverResponse = await fetch(
      `https://api.clover.com/v3/merchants/${cloverMerchantId}`,
      {
        headers: {
          'Authorization': `Bearer ${cloverApiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!cloverResponse.ok) {
      console.error('Clover API error:', cloverResponse.status);
      
      // Log security event for API failure
      await supabase.rpc('log_security_event', {
        p_merchant_id: merchantId,
        p_action: 'clover_api_error',
        p_resource_type: 'clover_api',
        p_success: false,
        p_error_message: `Clover API returned status ${cloverResponse.status}`
      });

      return new Response(JSON.stringify({ 
        error: 'Failed to fetch from Clover API',
        shopName: merchant.shop_name // Return fallback
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cloverData = await cloverResponse.json();
    
    // Log successful access
    await supabase.rpc('log_security_event', {
      p_merchant_id: merchantId,
      p_action: 'shop_info_accessed',
      p_resource_type: 'shop_info',
      p_success: true
    });

    return new Response(JSON.stringify({ 
      success: true,
      shopName: cloverData.name || merchant.shop_name,
      merchantInfo: {
        id: cloverData.id,
        name: cloverData.name,
        address: cloverData.address,
        phoneNumber: cloverData.phoneNumber
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in clover-shop-info function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

serve(handler);