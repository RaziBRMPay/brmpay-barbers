import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

interface ReportRequest {
  merchantId: string;
  reportDate: string;
  reportType?: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log('PDF Report Generation function called');

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

    const { merchantId, reportDate, reportType = 'daily_sales' }: ReportRequest = await req.json();

    console.log(`Generating PDF report for merchant: ${merchantId}, date: ${reportDate}`);

    // Fetch sales data for the report date
    const { data: salesData, error: salesError } = await supabaseClient
      .from('employee_sales_data')
      .select(`
        employee_id,
        employee_name,
        total_sales,
        commission_amount,
        sales_date
      `)
      .eq('merchant_id', merchantId)
      .eq('sales_date', reportDate)
      .order('total_sales', { ascending: false });

    if (salesError) {
      console.error('Error fetching sales data:', salesError);
      throw new Error(`Failed to fetch sales data: ${salesError.message}`);
    }

    // Fetch merchant information
    const { data: merchantData, error: merchantError } = await supabaseClient
      .from('merchants')
      .select('shop_name, timezone')
      .eq('id', merchantId)
      .single();

    if (merchantError) {
      console.error('Error fetching merchant data:', merchantError);
      throw new Error(`Failed to fetch merchant data: ${merchantError.message}`);
    }

    // Calculate totals
    const totalSales = salesData?.reduce((sum, emp) => sum + emp.total_sales, 0) || 0;
    const totalCommission = salesData?.reduce((sum, emp) => sum + emp.commission_amount, 0) || 0;
    const shopCommission = totalSales - totalCommission;

    // Generate simple HTML report (in a real implementation, you'd use a PDF library)
    const reportData = {
      merchantName: merchantData?.shop_name || 'Unknown Shop',
      reportDate,
      reportType,
      totalSales,
      totalCommission,
      shopCommission,
      employees: salesData || [],
      generatedAt: new Date().toISOString()
    };

    // Create a simple HTML report content
    const htmlContent = generateHTMLReport(reportData);
    
    // In a real implementation, you would:
    // 1. Convert HTML to PDF using a library like Puppeteer or jsPDF
    // 2. Upload the PDF to Supabase Storage
    // 3. Store the file URL in the reports table
    
    // For now, we'll just store the report data in the database
    const fileName = `${merchantData?.shop_name}-${reportDate}-${reportType}.pdf`;
    
    const { data: reportRecord, error: reportError } = await supabaseClient
      .from('reports')
      .upsert({
        merchant_id: merchantId,
        report_date: reportDate,
        report_type: reportType,
        file_name: fileName,
        file_url: null, // Would be set after PDF upload
        report_data: reportData
      }, {
        onConflict: 'merchant_id,report_date,report_type'
      })
      .select()
      .single();

    if (reportError) {
      console.error('Error saving report:', reportError);
      throw new Error(`Failed to save report: ${reportError.message}`);
    }

    console.log('PDF report generated successfully');

    return new Response(
      JSON.stringify({
        success: true,
        reportId: reportRecord.id,
        fileName,
        totalSales,
        totalCommission,
        shopCommission,
        employeeCount: salesData?.length || 0
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
    console.error('Error in generate-pdf-report function:', error);
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

function generateHTMLReport(data: any): string {
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Daily Sales Report - ${data.merchantName}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary { background: #f5f5f5; padding: 15px; margin: 20px 0; }
        .employee-list { margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .currency { text-align: right; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${data.merchantName}</h1>
        <h2>Daily Sales Report</h2>
        <p>Report Date: ${new Date(data.reportDate).toLocaleDateString()}</p>
        <p>Generated: ${new Date(data.generatedAt).toLocaleString()}</p>
      </div>
      
      <div class="summary">
        <h3>Summary</h3>
        <p><strong>Total Sales:</strong> ${formatCurrency(data.totalSales)}</p>
        <p><strong>Total Commission Paid:</strong> ${formatCurrency(data.totalCommission)}</p>
        <p><strong>Shop Commission:</strong> ${formatCurrency(data.shopCommission)}</p>
        <p><strong>Number of Employees:</strong> ${data.employees.length}</p>
      </div>
      
      <div class="employee-list">
        <h3>Employee Performance</h3>
        <table>
          <thead>
            <tr>
              <th>Employee Name</th>
              <th>Employee ID</th>
              <th>Total Sales</th>
              <th>Commission Earned</th>
              <th>Shop Commission</th>
            </tr>
          </thead>
          <tbody>
            ${data.employees.map((emp: any) => `
              <tr>
                <td>${emp.employee_name}</td>
                <td>${emp.employee_id}</td>
                <td class="currency">${formatCurrency(emp.total_sales)}</td>
                <td class="currency">${formatCurrency(emp.commission_amount)}</td>
                <td class="currency">${formatCurrency(emp.total_sales - emp.commission_amount)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

serve(handler);