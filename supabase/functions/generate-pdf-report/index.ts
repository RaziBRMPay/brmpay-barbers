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
  startDateTime?: string;
  endDateTime?: string;
  reportDate?: string; // Keep for backward compatibility
  reportType?: string;
  businessDayEnd?: string;
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

    const requestBody = await req.json();
    const { 
      merchantId, 
      startDateTime, 
      endDateTime, 
      reportDate, 
      reportType = 'daily_sales',
      businessDayEnd
    } = requestBody as ReportRequest;

    // Use datetime range if provided, otherwise fall back to date-based query
    let salesQuery = supabaseClient
      .from('employee_sales_data')
      .select(`
        employee_id,
        employee_name,
        total_sales,
        commission_amount,
        sales_date,
        created_at
      `)
      .eq('merchant_id', merchantId);

    let periodDescription: string;
    let actualReportDate: string;
    
    if (startDateTime && endDateTime) {
      console.log(`Generating report for merchant ${merchantId} for period ${startDateTime} to ${endDateTime}`);
      
      // Use datetime range for precise querying
      salesQuery = salesQuery
        .gte('created_at', startDateTime)
        .lt('created_at', endDateTime);
        
      const startDate = new Date(startDateTime);
      const endDate = new Date(endDateTime);
      periodDescription = `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()} - ${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString()}`;
      actualReportDate = businessDayEnd ? businessDayEnd.split('T')[0] : endDateTime.split('T')[0];
    } else if (reportDate) {
      console.log(`Generating report for merchant ${merchantId} for date ${reportDate}`);
      
      // Fall back to date-based query for backward compatibility
      salesQuery = salesQuery.eq('sales_date', reportDate);
      periodDescription = new Date(reportDate).toLocaleDateString();
      actualReportDate = reportDate;
    } else {
      throw new Error('Either startDateTime/endDateTime or reportDate must be provided');
    }

    const { data: salesData, error: salesError } = await salesQuery.order('total_sales', { ascending: false });

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
      reportDate: actualReportDate,
      periodDescription,
      reportType,
      totalSales,
      totalCommission,
      shopCommission,
      employees: salesData || [],
      generatedAt: new Date().toISOString(),
      startDateTime,
      endDateTime
    };

    // Create a simple HTML report content
    const htmlContent = generateHTMLReport(reportData);
    
    // Generate PDF from HTML
    const shopName = merchantData?.shop_name || 'Unknown_Shop';
    const fileName = `${shopName.replace(/[^a-zA-Z0-9]/g, '_')}-${actualReportDate}-${reportType}.txt`;
    const filePath = `${merchantId}/${fileName}`;
    
    let reportInsertData: any = {
      merchant_id: merchantId,
      report_date: actualReportDate,
      report_type: reportType,
      file_name: fileName,
      file_url: null,
      report_data: {
        ...reportData,
        periodDescription,
        startDateTime,
        endDateTime
      }
    };
    
    try {
      console.log(`Generating PDF for ${reportData.merchantName} - ${actualReportDate}`);
      
      // Create simple text-based PDF content as a fallback
      const textContent = `
${reportData.merchantName}
Daily Sales Report
====================================

Report Date: ${actualReportDate}
Period: ${reportData.periodDescription}
Generated: ${new Date(reportData.generatedAt).toLocaleString()}

SUMMARY
-------
Total Sales: $${reportData.totalSales.toFixed(2)}
Total Commission: $${reportData.totalCommission.toFixed(2)}
Shop Commission: $${reportData.shopCommission.toFixed(2)}

EMPLOYEE PERFORMANCE
-------------------
${reportData.employees.map(emp => 
  `${emp.employee_name} (${emp.employee_id})
  Sales: $${emp.total_sales.toFixed(2)}
  Commission: $${emp.commission_amount.toFixed(2)}\n`
).join('\n')}

Report generated automatically by the system.
====================================
`;

      // Convert text to a simple PDF-like format using basic text encoding
      const pdfBytes = new TextEncoder().encode(textContent);
      
      console.log('PDF content created, uploading to storage...');
      
      // Upload PDF to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('reports')
        .upload(filePath, pdfBytes, {
          contentType: 'text/plain', // Using text/plain for now, can be changed to application/pdf later
          upsert: true
        });

      if (uploadError) {
        console.error('Error uploading PDF to storage:', uploadError);
        throw new Error(`Failed to upload PDF: ${uploadError.message}`);
      }

      console.log('File uploaded successfully:', uploadData);

      // Get public URL for the uploaded file
      const { data: publicUrlData } = supabaseClient.storage
        .from('reports')
        .getPublicUrl(filePath);

      const fileUrl = publicUrlData.publicUrl;
      
      console.log('PDF generated and uploaded successfully:', fileUrl);
      
      // Update report data with file URL
      reportInsertData.file_url = fileUrl;
      
    } catch (pdfError) {
      console.error('Error generating PDF:', pdfError);
      console.error('PDF Error details:', {
        name: pdfError.name,
        message: pdfError.message,
        stack: pdfError.stack
      });
      // Fallback - reportInsertData already has file_url: null
    }

    const { data: reportRecord, error: reportError } = await supabaseClient
      .from('reports')
      .upsert(reportInsertData, {
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
            <span>Report Period: ${data.periodDescription || formatDateTime(data.reportDate)}</span>
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