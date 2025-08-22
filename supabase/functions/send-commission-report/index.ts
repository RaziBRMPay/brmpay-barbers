import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

interface CommissionReportRequest {
  merchantId: string;
  salesData: Array<{
    employee_name: string;
    total_sales: number;
    commission_amount: number;
  }>;
  dateRange: {
    from: string;
    to: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { merchantId, salesData, dateRange }: CommissionReportRequest = await req.json();

    console.log('Sending commission report for merchant:', merchantId);

    // Get merchant details first
    console.log('Fetching merchant data...');
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('shop_name, timezone, user_id')
      .eq('id', merchantId)
      .single();

    if (merchantError || !merchant) {
      console.error('Error fetching merchant:', merchantError);
      return new Response(JSON.stringify({ error: 'Merchant not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Merchant data:', merchant);

    // Get user profile separately
    console.log('Fetching user profile for user_id:', merchant.user_id);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', merchant.user_id)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching profile:', profileError);
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Profile data:', profile);

    // Validate required data
    if (!profile.email) {
      console.error('No email found for user profile');
      return new Response(JSON.stringify({ error: 'User email not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userEmail = profile.email;
    const userName = profile.first_name 
      ? `${profile.first_name} ${profile.last_name || ''}`.trim()
      : userEmail;

    console.log('Email will be sent to:', userEmail);
    console.log('User name for greeting:', userName);

    // Calculate totals
    const totalSales = salesData.reduce((sum, emp) => sum + emp.total_sales, 0);
    const totalCommissions = salesData.reduce((sum, emp) => sum + emp.commission_amount, 0);

    // Format date range in MM/DD/YYYY HH:MM format
    const formatDateTime = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      }) + ' ' + date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    };

    const dateRangeText = dateRange.from === dateRange.to 
      ? formatDateTime(dateRange.from)
      : `${formatDateTime(dateRange.from)} - ${formatDateTime(dateRange.to)}`;

    // Generate HTML table for employee data
    const employeeRows = salesData
      .sort((a, b) => b.total_sales - a.total_sales)
      .map(emp => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 12px; text-align: left;">${emp.employee_name}</td>
          <td style="padding: 12px; text-align: right;">$${emp.total_sales.toFixed(2)}</td>
          <td style="padding: 12px; text-align: right; font-weight: 600; color: #059669;">$${emp.commission_amount.toFixed(2)}</td>
        </tr>
      `).join('');

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Commission Report - ${merchant.shop_name}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; background-color: #f9fafb;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1e40af, #059669); border-radius: 12px; padding: 30px; text-align: center; margin-bottom: 30px;">
            <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">📊 Commission Report</h1>
            <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px;">${merchant.shop_name}</p>
          </div>

          <!-- Greeting -->
          <div style="background: white; border-radius: 12px; padding: 25px; margin-bottom: 25px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 22px;">Hello ${userName}!</h2>
            <p style="margin: 0; color: #6b7280; font-size: 16px;">Here's your commission report for <strong>${dateRangeText}</strong>.</p>
          </div>

          <!-- Summary Cards -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px;">
            <div style="background: white; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Total Sales</p>
              <p style="margin: 0; color: #1f2937; font-size: 24px; font-weight: 700;">$${totalSales.toFixed(2)}</p>
            </div>
            <div style="background: white; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Total Commissions</p>
              <p style="margin: 0; color: #059669; font-size: 24px; font-weight: 700;">$${totalCommissions.toFixed(2)}</p>
            </div>
          </div>

          <!-- Employee Commission Table -->
          <div style="background: white; border-radius: 12px; padding: 25px; margin-bottom: 30px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <h3 style="color: #1f2937; margin: 0 0 20px 0; font-size: 20px;">Employee Commission Breakdown</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                  <th style="padding: 15px 12px; text-align: left; color: #374151; font-weight: 600; font-size: 14px;">Employee</th>
                  <th style="padding: 15px 12px; text-align: right; color: #374151; font-weight: 600; font-size: 14px;">Total Sales</th>
                  <th style="padding: 15px 12px; text-align: right; color: #374151; font-weight: 600; font-size: 14px;">Commission</th>
                </tr>
              </thead>
              <tbody>
                ${employeeRows}
              </tbody>
            </table>
          </div>

          <!-- Footer -->
          <div style="background: #f8fafc; border-radius: 12px; padding: 20px; text-align: center;">
            <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
              Generated on ${new Date().toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric'
              })} ${new Date().toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
              })}
            </p>
            <p style="margin: 0; color: #9ca3af; font-size: 12px;">
              Powered by Clover Barber Boost 💼✂️
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: "Clover Barber Boost <onboarding@resend.dev>",
      to: [userEmail],
      subject: `📊 Commission Report - ${merchant.shop_name} (${dateRangeText})`,
      html: emailHtml,
    });

    console.log('Email sent successfully:', emailResponse);

    return new Response(JSON.stringify({ 
      success: true,
      emailId: emailResponse.id,
      sentTo: userEmail
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in send-commission-report function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

serve(handler);