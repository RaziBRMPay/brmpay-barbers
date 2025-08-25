import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { Resend } from 'npm:resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailReportRequest {
  merchantId: string;
  salesData: Array<{
    employee_name: string;
    total_sales: number;
    commission_amount: number;
    shop_commission: number;
  }>;
  dateRange: {
    from: string;
    to: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Email Commission Report Function Started - v4.0 FRESH DEPLOYMENT');
    
    // COMPREHENSIVE ENVIRONMENT DEBUGGING
    console.log('=== ENVIRONMENT DEBUGGING START ===');
    
    // Get all environment variables
    const allEnvVars = Deno.env.toObject();
    console.log('Total environment variables:', Object.keys(allEnvVars).length);
    console.log('All env keys:', Object.keys(allEnvVars));
    
    // Filter relevant keys
    const relevantKeys = Object.keys(allEnvVars).filter(key => 
      key.includes('RESEND') || key.includes('SUPABASE')
    );
    console.log('Relevant keys:', relevantKeys);
    
    // Show relevant key-value pairs (first 10 chars of values for security)
    const relevantEnvs = {};
    relevantKeys.forEach(key => {
      const value = allEnvVars[key];
      relevantEnvs[key] = value ? `${value.substring(0, 10)}...` : 'NULL/EMPTY';
    });
    console.log('Relevant env vars:', relevantEnvs);
    
    // Try multiple ways to access RESEND_API_KEY
    const resendApiKey1 = Deno.env.get('RESEND_API_KEY');
    const resendApiKey2 = allEnvVars['RESEND_API_KEY'];
    const resendApiKey3 = allEnvVars.RESEND_API_KEY;
    
    console.log('RESEND_API_KEY access attempts:', {
      'Deno.env.get()': resendApiKey1 ? `present (${resendApiKey1.substring(0, 8)}...)` : 'MISSING',
      'allEnvVars[]': resendApiKey2 ? `present (${resendApiKey2.substring(0, 8)}...)` : 'MISSING',
      'allEnvVars.': resendApiKey3 ? `present (${resendApiKey3.substring(0, 8)}...)` : 'MISSING'
    });
    
    // Use the first working key
    const resendApiKey = resendApiKey1 || resendApiKey2 || resendApiKey3;
    
    // Get other environment variables with fallbacks
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || allEnvVars['SUPABASE_URL'];
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || allEnvVars['SUPABASE_SERVICE_ROLE_KEY'];

    console.log('Final environment check:', {
      resendApiKey: resendApiKey ? `present (${resendApiKey.substring(0, 8)}...)` : 'STILL MISSING',
      supabaseUrl: supabaseUrl ? 'present' : 'MISSING',
      supabaseKey: supabaseKey ? 'present' : 'MISSING'
    });
    
    console.log('=== ENVIRONMENT DEBUGGING END ===');

    if (!resendApiKey) {
      console.error('CRITICAL: RESEND_API_KEY is still missing after all attempts');
      console.error('Available environment variables:', Object.keys(allEnvVars));
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'RESEND_API_KEY not accessible - check secret configuration',
          debug: {
            totalEnvVars: Object.keys(allEnvVars).length,
            relevantKeys: relevantKeys,
            hasResendKey: relevantKeys.includes('RESEND_API_KEY')
          }
        }),
        { 
          status: 500, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        }
      );
    }

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase environment variables missing');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Supabase configuration missing' 
        }),
        { 
          status: 500, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        }
      );
    }

    // Initialize clients
    const resend = new Resend(resendApiKey);
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const requestBody = await req.text();
    console.log('Raw request body:', requestBody);
    
    const { merchantId, salesData, dateRange }: EmailReportRequest = JSON.parse(requestBody);
    
    console.log('Processing request:', {
      merchantId,
      salesDataCount: salesData?.length || 0,
      dateRange
    });

    // Fetch merchant data
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('shop_name, user_id')
      .eq('id', merchantId)
      .single();

    if (merchantError) {
      console.error('Error fetching merchant:', merchantError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Merchant not found' 
        }),
        { 
          status: 404, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        }
      );
    }

    // Fetch user profile for email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', merchant.user_id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'User profile not found' 
        }),
        { 
          status: 404, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        }
      );
    }

    // Calculate totals
    const totalSales = salesData.reduce((sum, emp) => sum + emp.total_sales, 0);
    const totalCommissions = salesData.reduce((sum, emp) => sum + emp.commission_amount, 0);
    const totalShopCommission = salesData.reduce((sum, emp) => sum + emp.shop_commission, 0);

    // Create employee table HTML
    const employeeRows = salesData.map(emp => `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px; text-align: left;">${emp.employee_name}</td>
        <td style="padding: 12px; text-align: right;">$${emp.total_sales.toFixed(2)}</td>
        <td style="padding: 12px; text-align: right;">$${emp.commission_amount.toFixed(2)}</td>
        <td style="padding: 12px; text-align: right;">$${emp.shop_commission.toFixed(2)}</td>
      </tr>
    `).join('');

    // Generate email HTML
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Commission Report</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: white; margin: 0;">Commission Report</h1>
            <p style="color: #e2e8f0; margin: 10px 0 0 0;">${merchant.shop_name}</p>
          </div>

          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="margin-top: 0;">Report Period</h2>
            <p><strong>From:</strong> ${dateRange.from}</p>
            <p><strong>To:</strong> ${dateRange.to}</p>
          </div>

          <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="margin-top: 0; color: #0369a1;">Summary</h2>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
              <div>
                <p style="margin: 0; color: #64748b; font-size: 14px;">Total Sales</p>
                <p style="margin: 0; font-size: 24px; font-weight: bold; color: #059669;">$${totalSales.toFixed(2)}</p>
              </div>
              <div>
                <p style="margin: 0; color: #64748b; font-size: 14px;">Employee Commissions</p>
                <p style="margin: 0; font-size: 24px; font-weight: bold; color: #dc2626;">$${totalCommissions.toFixed(2)}</p>
              </div>
              <div>
                <p style="margin: 0; color: #64748b; font-size: 14px;">Shop Commission</p>
                <p style="margin: 0; font-size: 24px; font-weight: bold; color: #7c3aed;">$${totalShopCommission.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <h2>Employee Performance</h2>
          <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <thead>
              <tr style="background: #f1f5f9;">
                <th style="padding: 12px; text-align: left; font-weight: 600;">Employee</th>
                <th style="padding: 12px; text-align: right; font-weight: 600;">Total Sales</th>
                <th style="padding: 12px; text-align: right; font-weight: 600;">Commission</th>
                <th style="padding: 12px; text-align: right; font-weight: 600;">Shop Commission</th>
              </tr>
            </thead>
            <tbody>
              ${employeeRows}
            </tbody>
          </table>

          <div style="margin-top: 30px; padding: 20px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; color: #92400e;"><strong>Generated on:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
        </body>
      </html>
    `;

    // Send email
    console.log('Sending email to:', profile.email);
    
    const emailResponse = await resend.emails.send({
      from: 'Commission Reports <onboarding@resend.dev>',
      to: [profile.email],
      subject: `Commission Report - ${merchant.shop_name} (${dateRange.from} to ${dateRange.to})`,
      html: emailHtml,
    });

    console.log('Email sent successfully:', emailResponse);

    return new Response(
      JSON.stringify({
        success: true,
        sentTo: profile.email,
        emailId: emailResponse.data?.id
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error('Error in email-commission-report function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      }
    );
  }
};

serve(handler);