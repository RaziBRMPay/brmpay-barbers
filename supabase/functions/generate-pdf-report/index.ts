import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import PDFDocument from "https://esm.sh/pdfkit@0.17.1";
import { toZonedTime } from "https://esm.sh/date-fns-tz@3.2.0";
import { format } from "https://esm.sh/date-fns@3.6.0";

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
  reportDate?: string;
  reportType?: string;
  businessDayEnd?: string;
  salesData?: any[];
}

// Helper function to convert UTC date to merchant timezone date
const getLocalReportDate = (utcDateTime: string, timezone: string = 'America/New_York'): string => {
  const utcDate = new Date(utcDateTime);
  const zonedDate = toZonedTime(utcDate, timezone);
  return format(zonedDate, 'yyyy-MM-dd');
};

// Modern color palette for professional PDFs
const colors = {
  primary: '#3b82f6',
  primaryDark: '#2563eb',
  primaryLight: '#93c5fd',
  secondary: '#6366f1',
  accent: '#a855f7',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#38bdf8',
  neutral: '#6b7280',
  neutralLight: '#f3f4f6',
  neutralDark: '#1f2937',
  white: '#ffffff',
  black: '#0f172a',
  gold: '#f59e0b',
  emerald: '#10b981',
  rose: '#f43f5e',
};

const createModernPDF = (reportData: any): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 50,
        info: {
          Title: `Sales Report - ${reportData.merchantName}`,
          Author: 'Sales Commission System',
          Subject: 'Daily Sales Performance Report',
          Creator: 'PDFKit'
        }
      });

      const chunks: Uint8Array[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) {
          pdfBuffer.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      // Page dimensions
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 50;
      
      // Professional header with gradient background
      doc.rect(0, 0, pageWidth, 120)
         .fill(colors.primary);

      doc.rect(0, 100, pageWidth, 20)
         .fill(colors.primaryDark);

      // Company logo placeholder (circle)
      doc.circle(margin + 30, 50, 25)
         .fill(colors.white);

      // Header text
      doc.fill(colors.white)
         .fontSize(28)
         .font('Helvetica-Bold')
         .text('SALES PERFORMANCE REPORT', margin + 80, 30);

      doc.fontSize(16)
         .font('Helvetica')
         .text(reportData.merchantName.toUpperCase(), margin + 80, 60);

      doc.fontSize(12)
         .text(`${reportData.reportType.replace('_', ' ').toUpperCase()} • ${reportData.periodDescription}`, margin + 80, 85);

      // Executive Summary Section
      let yPos = 150;
      
      doc.rect(margin, yPos, pageWidth - 2 * margin, 80)
         .fill(colors.neutralLight);

      doc.rect(margin, yPos, 5, 80)
         .fill(colors.secondary);

      doc.fill(colors.neutralDark)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('📈 EXECUTIVE SUMMARY', margin + 20, yPos + 15);

      const topPerformer = reportData.employees[0]?.employee_name || 'N/A';
      const avgSales = reportData.employees.length > 0 ? (reportData.totalSales / reportData.employees.length).toFixed(0) : '0';
      const commissionRate = reportData.totalSales > 0 ? ((reportData.totalCommission / reportData.totalSales) * 100).toFixed(1) : '0';

      doc.fill(colors.neutral)
         .fontSize(11)
         .font('Helvetica')
         .text(`Top Performer: ${topPerformer}`, margin + 20, yPos + 40)
         .text(`Average Sales per Employee: $${avgSales}`, margin + 20, yPos + 55)
         .text(`Commission Rate: ${commissionRate}%`, margin + 20, yPos + 70);

      yPos += 100;

      // Key Performance Indicators
      doc.fill(colors.neutralDark)
         .fontSize(16)
         .font('Helvetica-Bold')
         .text('💡 KEY PERFORMANCE INDICATORS', margin, yPos);

      yPos += 30;

      // KPI Cards Layout
      const cardWidth = (pageWidth - 2 * margin - 20) / 2;
      const cardHeight = 70;

      const kpiData = [
        {
          label: 'Total Revenue',
          value: `$${reportData.totalSales.toLocaleString()}`,
          subtitle: `${reportData.employees.length} employees`,
          color: colors.success,
          x: 0, y: 0
        },
        {
          label: 'Total Commission',
          value: `$${reportData.totalCommission.toLocaleString()}`,
          subtitle: `${commissionRate}% commission rate`,
          color: colors.info,
          x: 1, y: 0
        },
        {
          label: 'Shop Revenue',
          value: `$${reportData.shopCommission.toLocaleString()}`,
          subtitle: `${(100 - parseFloat(commissionRate)).toFixed(1)}% retained`,
          color: colors.accent,
          x: 0, y: 1
        },
        {
          label: 'Avg per Employee',
          value: `$${avgSales}`,
          subtitle: 'Performance metric',
          color: colors.warning,
          x: 1, y: 1
        }
      ];

      kpiData.forEach(kpi => {
        const cardX = margin + (kpi.x * (cardWidth + 20));
        const cardY = yPos + (kpi.y * (cardHeight + 15));

        // Card background
        doc.rect(cardX, cardY, cardWidth, cardHeight)
           .fill(colors.white)
           .stroke(colors.neutralLight);

        // Accent bar
        doc.rect(cardX, cardY, cardWidth, 4)
           .fill(kpi.color);

        // Icon circle
        doc.circle(cardX + 25, cardY + 25, 12)
           .fill(kpi.color);

        // Text content
        doc.fill(colors.neutral)
           .fontSize(10)
           .font('Helvetica')
           .text(kpi.label.toUpperCase(), cardX + 45, cardY + 15);

        doc.fill(kpi.color)
           .fontSize(18)
           .font('Helvetica-Bold')
           .text(kpi.value, cardX + 45, cardY + 30);

        doc.fill(colors.neutral)
           .fontSize(9)
           .font('Helvetica')
           .text(kpi.subtitle, cardX + 45, cardY + 50);
      });

      yPos += 160;

      // Employee Performance Table
      if (reportData.employees.length > 0) {
        doc.fill(colors.neutralDark)
           .fontSize(16)
           .font('Helvetica-Bold')
           .text('🏆 EMPLOYEE PERFORMANCE', margin, yPos);

        yPos += 25;

        // Table header
        const tableX = margin;
        const rowHeight = 25;
        const colWidths = [120, 60, 80, 80, 80, 40];
        const headers = ['Employee', 'ID', 'Sales ($)', 'Commission ($)', 'Shop Rev. ($)', 'Rank'];

        // Header background
        doc.rect(tableX, yPos, colWidths.reduce((a, b) => a + b, 0), rowHeight)
           .fill(colors.primaryDark);

        // Header text
        let xPos = tableX;
        headers.forEach((header, i) => {
          doc.fill(colors.white)
             .fontSize(11)
             .font('Helvetica-Bold')
             .text(header, xPos + 5, yPos + 8);
          xPos += colWidths[i];
        });

        yPos += rowHeight;

        // Table rows
        reportData.employees.forEach((employee: any, index: number) => {
          const isTopPerformer = index < 3;
          const rowColor = isTopPerformer ? colors.neutralLight : colors.white;
          
          doc.rect(tableX, yPos, colWidths.reduce((a, b) => a + b, 0), rowHeight)
             .fill(rowColor)
             .stroke(colors.neutralLight);

          xPos = tableX;
          const rowData = [
            employee.employee_name || 'N/A',
            employee.employee_id || 'N/A',
            `$${(employee.total_sales || 0).toLocaleString()}`,
            `$${(employee.commission_amount || 0).toLocaleString()}`,
            `$${((employee.total_sales || 0) - (employee.commission_amount || 0)).toLocaleString()}`,
            `#${index + 1}`
          ];

          rowData.forEach((data, i) => {
            const textColor = isTopPerformer && i === 5 ? colors.gold : colors.neutralDark;
            doc.fill(textColor)
               .fontSize(10)
               .font(isTopPerformer ? 'Helvetica-Bold' : 'Helvetica')
               .text(data, xPos + 5, yPos + 8);
            xPos += colWidths[i];
          });

          yPos += rowHeight;

          // Add new page if needed
          if (yPos > pageHeight - 100) {
            doc.addPage();
            yPos = margin;
          }
        });
      }

      // Footer
      const footerY = pageHeight - 50;
      doc.rect(0, footerY, pageWidth, 50)
         .fill(colors.neutralLight);

      doc.fill(colors.neutral)
         .fontSize(9)
         .font('Helvetica')
         .text(`Generated on ${new Date(reportData.generatedAt).toLocaleString()}`, margin, footerY + 15)
         .text('Sales Commission Management System', margin, footerY + 30);

      doc.fill(colors.primary)
         .text('Confidential Report', pageWidth - margin - 100, footerY + 15)
         .text(`Page 1 of 1`, pageWidth - margin - 100, footerY + 30);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const handler = async (req: Request): Promise<Response> => {
  console.log('PDF Report Generation function called');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
      businessDayEnd,
      salesData: providedSalesData
    } = requestBody as ReportRequest;

    console.log(`Generating report for merchant ${merchantId} for date range ${startDateTime} to ${endDateTime}`);

    // Fetch merchant information first
    const { data: merchantData, error: merchantError } = await supabaseClient
      .from('merchants')
      .select('shop_name, timezone')
      .eq('id', merchantId)
      .single();

    if (merchantError) {
      console.error('Error fetching merchant data:', merchantError);
      throw new Error(`Failed to fetch merchant data: ${merchantError.message}`);
    }

    let salesData: any[] = [];
    let periodDescription: string;
    let actualReportDate: string;
    
    // Use provided sales data if available (from scheduled reports)
    if (providedSalesData && providedSalesData.length > 0) {
      console.log(`Using provided sales data for merchant ${merchantId} (${providedSalesData.length} records)`);
      salesData = providedSalesData;
      
      if (startDateTime && endDateTime) {
        const merchantTimezone = merchantData?.timezone || 'America/New_York';
        const startDate = new Date(startDateTime);
        const endDate = new Date(endDateTime);
        periodDescription = `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()} - ${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString()}`;
        actualReportDate = businessDayEnd ? getLocalReportDate(businessDayEnd, merchantTimezone) : getLocalReportDate(endDateTime, merchantTimezone);
      } else if (reportDate) {
        periodDescription = new Date(reportDate).toLocaleDateString();
        actualReportDate = reportDate;
      } else {
        const merchantTimezone = merchantData?.timezone || 'America/New_York';
        const now = new Date().toISOString();
        actualReportDate = getLocalReportDate(now, merchantTimezone);
        periodDescription = new Date(actualReportDate).toLocaleDateString();
      }
    } else {
      // Query database for sales data
      console.log(`Querying database for sales data for merchant ${merchantId}`);
      
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
      
      if (startDateTime && endDateTime) {
        console.log(`Using datetime range: ${startDateTime} to ${endDateTime}`);
        salesQuery = salesQuery
          .gte('created_at', startDateTime)
          .lt('created_at', endDateTime);
          
        const merchantTimezone = merchantData?.timezone || 'America/New_York';
        const startDate = new Date(startDateTime);
        const endDate = new Date(endDateTime);
        periodDescription = `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()} - ${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString()}`;
        actualReportDate = businessDayEnd ? getLocalReportDate(businessDayEnd, merchantTimezone) : getLocalReportDate(endDateTime, merchantTimezone);
      } else if (reportDate) {
        console.log(`Using date filter: ${reportDate}`);
        salesQuery = salesQuery.eq('sales_date', reportDate);
        periodDescription = new Date(reportDate).toLocaleDateString();
        actualReportDate = reportDate;
      } else {
        throw new Error('Either startDateTime/endDateTime or reportDate must be provided');
      }

      const { data: queriedSalesData, error: salesError } = await salesQuery.order('total_sales', { ascending: false });

      if (salesError) {
        console.error('Error fetching sales data:', salesError);
        throw new Error(`Failed to fetch sales data: ${salesError.message}`);
      }
      
      salesData = queriedSalesData || [];
      console.log(`Found ${salesData.length} sales records`);
    }

    // Calculate totals
    const totalSales = salesData?.reduce((sum, emp) => sum + (emp.total_sales || 0), 0) || 0;
    const totalCommission = salesData?.reduce((sum, emp) => sum + (emp.commission_amount || 0), 0) || 0;
    const shopCommission = totalSales - totalCommission;

    console.log(`Report totals - Sales: $${totalSales}, Commission: $${totalCommission}, Shop: $${shopCommission}`);

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

    // Generate PDF using PDFKit
    const shopName = (merchantData?.shop_name && merchantData.shop_name.trim()) || 'Default_Shop';
    const sanitizedShopName = shopName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${sanitizedShopName}-${actualReportDate}-${reportType}.pdf`;
    const filePath = `${merchantId}/${fileName}`;
    
    console.log(`Generating PDF for ${reportData.merchantName} - ${actualReportDate}`);
    
    const pdfBuffer = await createModernPDF(reportData);
    
    console.log('PDF content created, uploading to storage...');

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('reports')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    console.log('File uploaded successfully:', uploadData);

    // Get public URL
    const { data: urlData } = supabaseClient.storage
      .from('reports')
      .getPublicUrl(filePath);

    const fileUrl = urlData.publicUrl;

    // Save report record
    const reportRecord = {
      merchant_id: merchantId,
      report_date: actualReportDate,
      report_type: reportType,
      file_name: fileName,
      file_url: fileUrl,
      report_data: {
        ...reportData,
        periodDescription,
        startDateTime,
        endDateTime
      }
    };

    const { error: insertError } = await supabaseClient
      .from('reports')
      .upsert(reportRecord, {
        onConflict: 'merchant_id,report_date,report_type'
      });

    if (insertError) {
      console.error('Database insert error:', insertError);
      // Don't throw here, PDF was generated successfully
    }

    console.log(`PDF generated and uploaded successfully: ${fileUrl}`);
    console.log('PDF report generated successfully');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'PDF report generated successfully',
        fileUrl: fileUrl,
        fileName: fileName,
        reportData: reportData
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error generating PDF:', error);
    console.error('PDF Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        details: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
};

serve(handler);