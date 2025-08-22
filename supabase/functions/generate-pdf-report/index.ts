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

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
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

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Daily Sales Report - ${data.merchantName}</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          line-height: 1.6;
          color: #333;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          min-height: 100vh;
          padding: 20px;
        }
        
        .report-container {
          max-width: 1200px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        
        .header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          text-align: center; 
          padding: 40px 20px;
          position: relative;
        }
        
        .header::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="white" opacity="0.1"/><circle cx="75" cy="75" r="1" fill="white" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
        }
        
        .header h1 { 
          font-size: 2.5em; 
          font-weight: 700;
          margin-bottom: 10px;
          position: relative;
          z-index: 1;
        }
        
        .header h2 { 
          font-size: 1.5em; 
          font-weight: 300;
          opacity: 0.9;
          position: relative;
          z-index: 1;
        }
        
        .report-meta {
          background: #f8f9fa;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #e9ecef;
        }
        
        .meta-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #6c757d;
          font-size: 14px;
        }
        
        .meta-icon {
          width: 16px;
          height: 16px;
          opacity: 0.7;
        }
        
        .summary { 
          background: linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%);
          padding: 30px;
          margin: 0;
          position: relative;
        }
        
        .summary h3 {
          font-size: 1.8em;
          margin-bottom: 20px;
          color: #2c3e50;
        }
        
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }
        
        .summary-card {
          background: white;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
          text-align: center;
        }
        
        .summary-card h4 {
          color: #6c757d;
          font-size: 0.9em;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        
        .summary-card .value {
          font-size: 2em;
          font-weight: bold;
          color: #2c3e50;
        }
        
        .summary-card.total-sales .value { color: #28a745; }
        .summary-card.commission-paid .value { color: #17a2b8; }
        .summary-card.shop-commission .value { color: #6f42c1; }
        .summary-card.employee-count .value { color: #fd7e14; }
        
        .employee-section { 
          padding: 40px 30px;
        }
        
        .employee-section h3 {
          font-size: 1.8em;
          margin-bottom: 25px;
          color: #2c3e50;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .table-container {
          overflow-x: auto;
          border-radius: 10px;
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        table { 
          width: 100%; 
          border-collapse: collapse;
          background: white;
        }
        
        th { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 15px 12px;
          text-align: left;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 0.85em;
          letter-spacing: 0.5px;
        }
        
        td { 
          padding: 12px;
          border-bottom: 1px solid #e9ecef;
        }
        
        tr:hover {
          background-color: #f8f9fa;
        }
        
        tr:last-child td {
          border-bottom: none;
        }
        
        .currency { 
          text-align: right;
          font-weight: 600;
          font-family: 'Courier New', monospace;
        }
        
        .employee-name {
          font-weight: 600;
          color: #2c3e50;
        }
        
        .employee-id {
          color: #6c757d;
          font-size: 0.9em;
        }
        
        .performance-indicator {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 0.8em;
          font-weight: 500;
          margin-left: 8px;
        }
        
        .high-performer {
          background: #d4edda;
          color: #155724;
        }
        
        .footer {
          background: #f8f9fa;
          padding: 20px;
          text-align: center;
          color: #6c757d;
          font-size: 0.9em;
          border-top: 1px solid #e9ecef;
        }
        
        @media (max-width: 768px) {
          .report-meta {
            flex-direction: column;
            gap: 10px;
          }
          
          .summary-grid {
            grid-template-columns: 1fr;
          }
          
          .employee-section {
            padding: 20px 15px;
          }
          
          th, td {
            padding: 8px 6px;
            font-size: 0.9em;
          }
        }
      </style>
    </head>
    <body>
      <div class="report-container">
        <div class="header">
          <h1>${data.merchantName}</h1>
          <h2>Daily Sales Report</h2>
        </div>
        
        <div class="report-meta">
          <div class="meta-item">
            <svg class="meta-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd" />
            </svg>
            <span>Report Period: ${formatDateTime(data.reportDate)}</span>
          </div>
          <div class="meta-item">
            <svg class="meta-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
            </svg>
            <span>Generated: ${formatDateTime(data.generatedAt)}</span>
          </div>
        </div>
        
        <div class="summary">
          <h3>📊 Performance Summary</h3>
          <div class="summary-grid">
            <div class="summary-card total-sales">
              <h4>Total Sales</h4>
              <div class="value">${formatCurrency(data.totalSales)}</div>
            </div>
            <div class="summary-card commission-paid">
              <h4>Commission Paid</h4>
              <div class="value">${formatCurrency(data.totalCommission)}</div>
            </div>
            <div class="summary-card shop-commission">
              <h4>Shop Commission</h4>
              <div class="value">${formatCurrency(data.shopCommission)}</div>
            </div>
            <div class="summary-card employee-count">
              <h4>Active Employees</h4>
              <div class="value">${data.employees.length}</div>
            </div>
          </div>
        </div>
        
        <div class="employee-section">
          <h3>
            👥 Employee Performance Breakdown
          </h3>
          <div class="table-container">
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
                ${data.employees.map((emp: any, index: number) => {
                  const isTopPerformer = index < 3 && data.employees.length > 3;
                  return `
                    <tr>
                      <td class="employee-name">
                        ${emp.employee_name}
                        ${isTopPerformer ? '<span class="performance-indicator high-performer">Top Performer</span>' : ''}
                      </td>
                      <td class="employee-id">${emp.employee_id}</td>
                      <td class="currency">${formatCurrency(emp.total_sales)}</td>
                      <td class="currency">${formatCurrency(emp.commission_amount)}</td>
                      <td class="currency">${formatCurrency(emp.total_sales - emp.commission_amount)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
        
        <div class="footer">
          <p>This report was automatically generated on ${formatDateTime(data.generatedAt)}</p>
          <p>For questions about this report, please contact your system administrator.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

serve(handler);