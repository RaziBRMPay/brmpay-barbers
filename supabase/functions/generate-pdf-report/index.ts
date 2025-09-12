import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
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

const createModernPDF = async (reportData: any): Promise<Uint8Array> => {
  try {
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Embed fonts
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Add a page
    const page = pdfDoc.addPage([595, 842]); // A4 size
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const margin = 50;
    
    // Colors (convert hex to RGB)
    const primaryColor = rgb(0.23, 0.51, 0.96); // #3b82f6
    const primaryDarkColor = rgb(0.15, 0.39, 0.92); // #2563eb
    const neutralColor = rgb(0.42, 0.45, 0.50); // #6b7280
    const neutralLightColor = rgb(0.95, 0.96, 0.96); // #f3f4f6
    const whiteColor = rgb(1, 1, 1);
    const successColor = rgb(0.13, 0.77, 0.37); // #22c55e
    const infoColor = rgb(0.22, 0.74, 0.97); // #38bdf8
    const accentColor = rgb(0.66, 0.33, 0.97); // #a855f7
    const warningColor = rgb(0.96, 0.62, 0.07); // #f59e0b
    
    // Header background
    page.drawRectangle({
      x: 0,
      y: pageHeight - 120,
      width: pageWidth,
      height: 120,
      color: primaryColor,
    });
    
    // Header accent bar
    page.drawRectangle({
      x: 0,
      y: pageHeight - 120,
      width: pageWidth,
      height: 20,
      color: primaryDarkColor,
    });
    
    // Company logo placeholder (circle)
    page.drawCircle({
      x: margin + 30,
      y: pageHeight - 70,
      size: 25,
      color: whiteColor,
    });
    
    // Header text
    page.drawText('SALES PERFORMANCE REPORT', {
      x: margin + 80,
      y: pageHeight - 50,
      size: 24,
      font: boldFont,
      color: whiteColor,
    });
    
    page.drawText(reportData.merchantName.toUpperCase(), {
      x: margin + 80,
      y: pageHeight - 75,
      size: 14,
      font: regularFont,
      color: whiteColor,
    });
    
    page.drawText(`${reportData.reportType.replace('_', ' ').toUpperCase()} • ${reportData.periodDescription}`, {
      x: margin + 80,
      y: pageHeight - 95,
      size: 10,
      font: regularFont,
      color: whiteColor,
    });
    
    // Executive Summary Section
    let yPos = pageHeight - 180;
    
    page.drawRectangle({
      x: margin,
      y: yPos - 80,
      width: pageWidth - 2 * margin,
      height: 80,
      color: neutralLightColor,
    });
    
    page.drawText('EXECUTIVE SUMMARY', {
      x: margin + 20,
      y: yPos - 25,
      size: 14,
      font: boldFont,
      color: rgb(0.12, 0.16, 0.22),
    });
    
    const topPerformer = reportData.employees[0]?.employee_name || 'N/A';
    const avgSales = reportData.employees.length > 0 ? (reportData.totalSales / reportData.employees.length).toFixed(0) : '0';
    const commissionRate = reportData.totalSales > 0 ? ((reportData.totalCommission / reportData.totalSales) * 100).toFixed(1) : '0';
    
    page.drawText(`Top Performer: ${topPerformer}`, {
      x: margin + 20,
      y: yPos - 45,
      size: 10,
      font: regularFont,
      color: neutralColor,
    });
    
    page.drawText(`Average Sales per Employee: $${avgSales}`, {
      x: margin + 20,
      y: yPos - 58,
      size: 10,
      font: regularFont,
      color: neutralColor,
    });
    
    page.drawText(`Commission Rate: ${commissionRate}%`, {
      x: margin + 20,
      y: yPos - 71,
      size: 10,
      font: regularFont,
      color: neutralColor,
    });
    
    yPos -= 120;
    
    // Key Performance Indicators
    page.drawText('KEY PERFORMANCE INDICATORS', {
      x: margin,
      y: yPos,
      size: 14,
      font: boldFont,
      color: rgb(0.12, 0.16, 0.22),
    });
    
    yPos -= 40;
    
    // KPI Cards
    const cardWidth = (pageWidth - 2 * margin - 20) / 2;
    const cardHeight = 70;
    
    const kpiData = [
      {
        label: 'Total Revenue',
        value: `$${reportData.totalSales.toLocaleString()}`,
        subtitle: `${reportData.employees.length} employees`,
        color: successColor,
        x: 0, y: 0
      },
      {
        label: 'Total Commission',
        value: `$${reportData.totalCommission.toLocaleString()}`,
        subtitle: `${commissionRate}% commission rate`,
        color: infoColor,
        x: 1, y: 0
      },
      {
        label: 'Shop Revenue',
        value: `$${reportData.shopCommission.toLocaleString()}`,
        subtitle: `${(100 - parseFloat(commissionRate)).toFixed(1)}% retained`,
        color: accentColor,
        x: 0, y: 1
      },
      {
        label: 'Avg per Employee',
        value: `$${avgSales}`,
        subtitle: 'Performance metric',
        color: warningColor,
        x: 1, y: 1
      }
    ];
    
    kpiData.forEach(kpi => {
      const cardX = margin + (kpi.x * (cardWidth + 20));
      const cardY = yPos - (kpi.y * (cardHeight + 15));
      
      // Card background
      page.drawRectangle({
        x: cardX,
        y: cardY - cardHeight,
        width: cardWidth,
        height: cardHeight,
        color: whiteColor,
        borderColor: neutralLightColor,
        borderWidth: 1,
      });
      
      // Accent bar
      page.drawRectangle({
        x: cardX,
        y: cardY - 4,
        width: cardWidth,
        height: 4,
        color: kpi.color,
      });
      
      // Text content
      page.drawText(kpi.label.toUpperCase(), {
        x: cardX + 10,
        y: cardY - 20,
        size: 9,
        font: regularFont,
        color: neutralColor,
      });
      
      page.drawText(kpi.value, {
        x: cardX + 10,
        y: cardY - 35,
        size: 16,
        font: boldFont,
        color: kpi.color,
      });
      
      page.drawText(kpi.subtitle, {
        x: cardX + 10,
        y: cardY - 50,
        size: 8,
        font: regularFont,
        color: neutralColor,
      });
    });
    
    yPos -= 180;
    
    // Employee Performance Table
    if (reportData.employees.length > 0) {
      page.drawText('EMPLOYEE PERFORMANCE', {
        x: margin,
        y: yPos,
        size: 14,
        font: boldFont,
        color: rgb(0.12, 0.16, 0.22),
      });
      
      yPos -= 30;
      
      // Table header
      const tableX = margin;
      const rowHeight = 20;
      const colWidths = [100, 50, 70, 80, 80, 40];
      const headers = ['Employee', 'ID', 'Sales ($)', 'Commission ($)', 'Shop Rev. ($)', 'Rank'];
      
      // Header background
      page.drawRectangle({
        x: tableX,
        y: yPos - rowHeight,
        width: colWidths.reduce((a, b) => a + b, 0),
        height: rowHeight,
        color: primaryDarkColor,
      });
      
      // Header text
      let xPos = tableX;
      headers.forEach((header, i) => {
        page.drawText(header, {
          x: xPos + 5,
          y: yPos - 15,
          size: 9,
          font: boldFont,
          color: whiteColor,
        });
        xPos += colWidths[i];
      });
      
      yPos -= rowHeight;
      
        // Table rows (limit to first 15 employees to fit on page, filter out zero sales for cleaner display)
        const employeesToShow = reportData.employees
          .filter((emp: any) => (emp.total_sales || 0) > 0) // Only show employees with sales
          .slice(0, 15);
          
        employeesToShow.forEach((employee: any, index: number) => {
          const isTopPerformer = index < 3;
          const rowColor = isTopPerformer ? neutralLightColor : whiteColor;
          
          // Calculate shop revenue (what the shop keeps)
          const shopRevenue = (employee.total_sales || 0) - (employee.commission_amount || 0);
          
          page.drawRectangle({
            x: tableX,
            y: yPos - rowHeight,
            width: colWidths.reduce((a, b) => a + b, 0),
            height: rowHeight,
            color: rowColor,
            borderColor: neutralLightColor,
            borderWidth: 0.5,
          });
          
          xPos = tableX;
          const rowData = [
            (employee.employee_name || 'N/A').substring(0, 12), // Employee name
            (employee.employee_id || 'N/A').substring(0, 8),    // Employee ID
            `$${Math.round(employee.total_sales || 0).toLocaleString()}`,     // Total Sales
            `$${Math.round(employee.commission_amount || 0).toLocaleString()}`, // Employee Commission
            `$${Math.round(shopRevenue).toLocaleString()}`,      // Shop Revenue (what shop keeps)
            `#${index + 1}`  // Rank
          ];
          
          rowData.forEach((data, i) => {
            const textColor = isTopPerformer && i === 5 ? warningColor : rgb(0.12, 0.16, 0.22);
            page.drawText(data, {
              x: xPos + 5,
              y: yPos - 15,
              size: 8,
              font: isTopPerformer ? boldFont : regularFont,
              color: textColor,
            });
            xPos += colWidths[i];
          });
          
          yPos -= rowHeight;
        });
    }
    
    // Footer
    const footerY = 50;
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: footerY,
      color: neutralLightColor,
    });
    
    page.drawText(`Generated on ${new Date(reportData.generatedAt).toLocaleString()}`, {
      x: margin,
      y: 30,
      size: 8,
      font: regularFont,
      color: neutralColor,
    });
    
    page.drawText('Sales Commission Management System', {
      x: margin,
      y: 15,
      size: 8,
      font: regularFont,
      color: neutralColor,
    });
    
    page.drawText('Confidential Report', {
      x: pageWidth - margin - 100,
      y: 30,
      size: 8,
      font: regularFont,
      color: primaryColor,
    });
    
    page.drawText('Page 1 of 1', {
      x: pageWidth - margin - 60,
      y: 15,
      size: 8,
      font: regularFont,
      color: primaryColor,
    });
    
    // Serialize the PDF document to bytes
    const pdfBytes = await pdfDoc.save();
    return new Uint8Array(pdfBytes);
    
  } catch (error) {
    console.error('PDF Error details:', JSON.stringify(error, null, 2));
    throw error;
  }
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
        // Query by sales_date for better accuracy with daily reports
        const merchantTimezone = merchantData?.timezone || 'America/New_York';
        const startDate = getLocalReportDate(startDateTime, merchantTimezone);
        const endDate = getLocalReportDate(endDateTime, merchantTimezone);
        
        console.log(`Converted to local dates: ${startDate} to ${endDate}`);
        
        salesQuery = salesQuery
          .gte('sales_date', startDate)
          .lte('sales_date', endDate);
          
        const startDateObj = new Date(startDateTime);
        const endDateObj = new Date(endDateTime);
        periodDescription = `${startDateObj.toLocaleDateString()} ${startDateObj.toLocaleTimeString()} - ${endDateObj.toLocaleDateString()} ${endDateObj.toLocaleTimeString()}`;
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

    // Sort employees by total_sales in descending order and add debugging
    const sortedEmployees = (salesData || []).sort((a, b) => (b.total_sales || 0) - (a.total_sales || 0));
    
    console.log('Employee data for PDF:');
    sortedEmployees.slice(0, 5).forEach((emp, idx) => {
      console.log(`${idx + 1}. ${emp.employee_name}: Sales=$${emp.total_sales}, Commission=$${emp.commission_amount}, Shop=$${(emp.total_sales || 0) - (emp.commission_amount || 0)}`);
    });

    const reportData = {
      merchantName: merchantData?.shop_name || 'Unknown Shop',
      reportDate: actualReportDate,
      periodDescription,
      reportType,
      totalSales,
      totalCommission,
      shopCommission,
      employees: sortedEmployees,
      generatedAt: new Date().toISOString(),
      startDateTime,
      endDateTime
    };

    // Generate PDF using pdf-lib
    const shopName = (merchantData?.shop_name && merchantData.shop_name.trim()) || 'Default_Shop';
    const sanitizedShopName = shopName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${sanitizedShopName}-${actualReportDate}-${reportType}.pdf`;
    const filePath = `${merchantId}/${fileName}`;
    
    console.log(`Generating PDF for ${reportData.merchantName} - ${actualReportDate}`);
    
    let pdfBuffer: Uint8Array;
    try {
      pdfBuffer = await createModernPDF(reportData);
    } catch (pdfError) {
      console.error('PDF generation failed, creating fallback text report:', pdfError);
      // Fallback: create a simple text-based PDF if main generation fails
      const fallbackPdf = await PDFDocument.create();
      const page = fallbackPdf.addPage();
      const font = await fallbackPdf.embedFont(StandardFonts.Helvetica);
      
      page.drawText(`Sales Report - ${reportData.merchantName}`, {
        x: 50,
        y: 750,
        size: 20,
        font,
      });
      
      page.drawText(`Date: ${actualReportDate}`, {
        x: 50,
        y: 720,
        size: 12,
        font,
      });
      
      page.drawText(`Total Sales: $${reportData.totalSales.toLocaleString()}`, {
        x: 50,
        y: 690,
        size: 12,
        font,
      });
      
      page.drawText(`Total Commission: $${reportData.totalCommission.toLocaleString()}`, {
        x: 50,
        y: 660,
        size: 12,
        font,
      });
      
      page.drawText(`Employees: ${reportData.employees.length}`, {
        x: 50,
        y: 630,
        size: 12,
        font,
      });
      
      const fallbackBytes = await fallbackPdf.save();
      pdfBuffer = new Uint8Array(fallbackBytes);
    }
    
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