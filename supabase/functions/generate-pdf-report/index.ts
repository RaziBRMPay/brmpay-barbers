import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.55.0";
import jsPDF from "https://esm.sh/jspdf@2.5.1";
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
  reportDate?: string; // Keep for backward compatibility
  reportType?: string;
  businessDayEnd?: string;
  salesData?: any[]; // Pre-fetched sales data from scheduler
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
      businessDayEnd,
      salesData: providedSalesData
    } = requestBody as ReportRequest;

    let salesData: any[] = [];
    let periodDescription: string;
    let actualReportDate: string;
    
    // Use provided sales data if available (from scheduled reports)
    if (providedSalesData && providedSalesData.length > 0) {
      console.log(`Using provided sales data for merchant ${merchantId} (${providedSalesData.length} records)`);
      salesData = providedSalesData;
      
      // Calculate period description from provided data
      if (startDateTime && endDateTime) {
        const merchantTimezone = merchantData?.timezone || 'America/New_York';
        const startDate = new Date(startDateTime);
        const endDate = new Date(endDateTime);
        periodDescription = `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()} - ${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString()}`;
        // Use merchant timezone for report date calculation
        actualReportDate = businessDayEnd ? getLocalReportDate(businessDayEnd, merchantTimezone) : getLocalReportDate(endDateTime, merchantTimezone);
      } else if (reportDate) {
        periodDescription = new Date(reportDate).toLocaleDateString();
        actualReportDate = reportDate;
      } else {
        // Fallback for provided data without explicit dates - use current date in merchant timezone
        const merchantTimezone = merchantData?.timezone || 'America/New_York';
        const now = new Date().toISOString();
        actualReportDate = getLocalReportDate(now, merchantTimezone);
        periodDescription = new Date(actualReportDate).toLocaleDateString();
      }
    } else {
      // Query database for sales data (manual report generation or fallback)
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
        console.log(`Generating report for merchant ${merchantId} for period ${startDateTime} to ${endDateTime}`);
        
        // Use datetime range for precise querying
        salesQuery = salesQuery
          .gte('created_at', startDateTime)
          .lt('created_at', endDateTime);
          
        const merchantTimezone = merchantData?.timezone || 'America/New_York';
        const startDate = new Date(startDateTime);
        const endDate = new Date(endDateTime);
        periodDescription = `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()} - ${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString()}`;
        // Use merchant timezone for report date calculation
        actualReportDate = businessDayEnd ? getLocalReportDate(businessDayEnd, merchantTimezone) : getLocalReportDate(endDateTime, merchantTimezone);
      } else if (reportDate) {
        console.log(`Generating report for merchant ${merchantId} for date ${reportDate}`);
        
        // Fall back to date-based query for backward compatibility
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

    // Helper function to convert UTC date to merchant timezone date
    const getLocalReportDate = (utcDateTime: string, timezone: string = 'America/New_York'): string => {
      const utcDate = new Date(utcDateTime);
      const zonedDate = toZonedTime(utcDate, timezone);
      return format(zonedDate, 'yyyy-MM-dd');
    };

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
    const shopName = (merchantData?.shop_name && merchantData.shop_name.trim()) || 'Default_Shop';
    const sanitizedShopName = shopName.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${sanitizedShopName}-${actualReportDate}-${reportType}.pdf`;
    const filePath = `${merchantId}/${fileName}`;
    
    console.log(`Generating report for shop: ${shopName}, file: ${fileName}`);
    
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
      
      // Create enhanced PDF using jsPDF
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Enhanced professional color palette with gradients
      const colors = {
        primary: [59, 130, 246],       // Modern blue #3b82f6
        primaryDark: [37, 99, 235],    // Darker blue #2563eb
        primaryLight: [147, 197, 253], // Light blue #93c5fd
        secondary: [99, 102, 241],     // Indigo #6366f1
        accent: [168, 85, 247],        // Purple accent #a855f7
        success: [34, 197, 94],        // Green #22c55e
        warning: [251, 191, 36],       // Amber #fbbf24
        danger: [239, 68, 68],         // Red #ef4444
        info: [56, 189, 248],          // Sky blue #38bdf8
        neutral: [107, 114, 128],      // Gray #6b7280
        neutralLight: [243, 244, 246], // Light gray #f3f4f6
        neutralDark: [31, 41, 55],     // Dark gray #1f2937
        white: [255, 255, 255],
        black: [15, 23, 42],           // Slate black #0f172a
        gold: [245, 158, 11],          // Gold #f59e0b
        emerald: [16, 185, 129],       // Emerald #10b981
        rose: [244, 63, 94],           // Rose #f43f5e
        gradient1: [139, 92, 246],     // Violet #8b5cf6
        gradient2: [236, 72, 153],     // Pink #ec4899
      };

      // Set up page dimensions and margins
      const margin = 20;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = pageWidth - (margin * 2);
      
      let yPosition = margin;
      
      // Modern gradient header with geometric elements
      doc.setFillColor(...colors.primary);
      doc.rect(0, 0, pageWidth, 50, 'F');
      
      // Gradient overlay effect (simulated with multiple rectangles)
      doc.setFillColor(...colors.primaryDark);
      doc.rect(0, 40, pageWidth, 10, 'F');
      
      // Decorative accent elements
      doc.setFillColor(...colors.accent);
      doc.rect(0, 47, pageWidth, 3, 'F');
      
      // Add subtle geometric pattern
      doc.setFillColor(...colors.primaryLight);
      for (let i = 0; i < pageWidth; i += 20) {
        doc.circle(i, 10, 2, 'F');
      }
      
      // Premium header typography
      doc.setTextColor(...colors.white);
      doc.setFontSize(28);
      doc.setFont(undefined, 'bold');
      doc.text('📊 SALES PERFORMANCE REPORT', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(14);
      doc.setFont(undefined, 'normal');
      doc.text(`${reportData.merchantName.toUpperCase()}`, pageWidth / 2, 32, { align: 'center' });
      
      // Add report type and date subtitle
      doc.setFontSize(10);
      doc.setTextColor(...colors.primaryLight);
      doc.text(`${reportType.replace('_', ' ').toUpperCase()} • ${periodDescription}`, pageWidth / 2, 42, { align: 'center' });
      
      yPosition = 65;
      
      // Executive Summary Section
      doc.setFillColor(...colors.neutralLight);
      doc.roundedRect(margin, yPosition, contentWidth, 30, 3, 3, 'F');
      
      // Executive summary border accent
      doc.setFillColor(...colors.secondary);
      doc.rect(margin, yPosition, 4, 30, 'F');
      
      doc.setTextColor(...colors.neutralDark);
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('📈 EXECUTIVE SUMMARY', margin + 10, yPosition + 12);
      
      // Key insights text
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...colors.neutral);
      const topPerformer = reportData.employees[0]?.employee_name || 'N/A';
      const avgSales = reportData.employees.length > 0 ? (totalSales / reportData.employees.length).toFixed(0) : '0';
      doc.text(`Top Performer: ${topPerformer} • Average Sales per Employee: $${avgSales} • Commission Rate: ${((totalCommission/totalSales)*100).toFixed(1)}%`, margin + 10, yPosition + 22);
      
      yPosition += 40;
      
      // Report metadata with enhanced styling
      doc.setTextColor(...colors.neutral);
      doc.setFontSize(9);
      doc.text(`🗓️ Report Period: ${reportData.periodDescription}`, margin, yPosition);
      doc.text(`⏰ Generated: ${new Date(reportData.generatedAt).toLocaleString()}`, pageWidth - margin, yPosition, { align: 'right' });
      yPosition += 18;
      
      // Enhanced KPI Dashboard with visual indicators
      doc.setTextColor(...colors.neutralDark);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text('💡 KEY PERFORMANCE INDICATORS', margin, yPosition);
      yPosition += 15;
      
      // Create enhanced KPI cards with progress bars and icons
      const cardWidth = (contentWidth - 15) / 2;
      const cardHeight = 35;
      const cardSpacing = 5;
      
      // Calculate performance metrics
      const commissionRate = totalSales > 0 ? (totalCommission / totalSales) * 100 : 0;
      const avgSalesPerEmployee = reportData.employees.length > 0 ? totalSales / reportData.employees.length : 0;
      
      const kpiData = [
        { 
          label: 'Total Revenue', 
          value: `$${reportData.totalSales.toLocaleString()}`, 
          subtitle: `${reportData.employees.length} active employees`,
          icon: '💰',
          color: colors.success, 
          bgColor: colors.neutralLight,
          x: 0, y: 0 
        },
        { 
          label: 'Commission Distribution', 
          value: `${commissionRate.toFixed(1)}%`, 
          subtitle: `$${reportData.totalCommission.toLocaleString()} paid out`,
          icon: '📈',
          color: colors.info, 
          bgColor: colors.neutralLight,
          x: 1, y: 0 
        },
        { 
          label: 'Shop Retention', 
          value: `$${reportData.shopCommission.toLocaleString()}`, 
          subtitle: `${(100 - commissionRate).toFixed(1)}% retained`,
          icon: '🏪',
          color: colors.accent, 
          bgColor: colors.neutralLight,
          x: 0, y: 1 
        },
        { 
          label: 'Average per Employee', 
          value: `$${avgSalesPerEmployee.toLocaleString()}`, 
          subtitle: `Performance metric`,
          icon: '👥',
          color: colors.warning, 
          bgColor: colors.neutralLight,
          x: 1, y: 1 
        }
      ];
      
      kpiData.forEach(kpi => {
        const cardX = margin + (kpi.x * (cardWidth + cardSpacing));
        const cardY = yPosition + (kpi.y * (cardHeight + cardSpacing));
        
        // Modern card with shadow effect (simulated)
        doc.setFillColor(220, 220, 220); // Shadow
        doc.roundedRect(cardX + 1, cardY + 1, cardWidth, cardHeight, 4, 4, 'F');
        
        // Main card background
        doc.setFillColor(...kpi.bgColor);
        doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 4, 4, 'F');
        
        // Gradient accent bar (top)
        doc.setFillColor(...kpi.color);
        doc.roundedRect(cardX, cardY, cardWidth, 4, 4, 4, 'F');
        
        // Icon background circle
        doc.setFillColor(...kpi.color);
        doc.circle(cardX + 12, cardY + 15, 8, 'F');
        
        // Icon (simulated with text)
        doc.setTextColor(...colors.white);
        doc.setFontSize(12);
        doc.text(kpi.icon, cardX + 8, cardY + 18);
        
        // KPI Label
        doc.setTextColor(...colors.neutral);
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.text(kpi.label.toUpperCase() + ':', cardX + 25, cardY + 12);
        
        // KPI Value
        doc.setTextColor(...kpi.color);
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text(kpi.value, cardX + 25, cardY + 22);
        
        // Subtitle
        doc.setTextColor(...colors.neutral);
        doc.setFontSize(7);
        doc.setFont(undefined, 'normal');
        doc.text(kpi.subtitle, cardX + 25, cardY + 30);
        
        // Progress bar for percentage-based metrics
        if (kpi.label.includes('Commission') || kpi.label.includes('Retention')) {
          const progressWidth = 60;
          const progressHeight = 3;
          const progressX = cardX + cardWidth - progressWidth - 5;
          const progressY = cardY + cardHeight - 8;
          
          // Progress background
          doc.setFillColor(...colors.neutralLight);
          doc.rect(progressX, progressY, progressWidth, progressHeight, 'F');
          
          // Progress fill
          const fillWidth = (progressWidth * Math.min(commissionRate, 100)) / 100;
          doc.setFillColor(...kpi.color);
          doc.rect(progressX, progressY, fillWidth, progressHeight, 'F');
        }
      });
      
      yPosition += 75;
      
      // Employee Performance Analytics Section
      if (reportData.employees.length > 0) {
        // Performance Analytics Header
        doc.setTextColor(...colors.neutralDark);
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('🏆 EMPLOYEE PERFORMANCE ANALYTICS', margin, yPosition);
        yPosition += 8;
        
        // Performance summary bar
        doc.setTextColor(...colors.neutral);
        doc.setFontSize(9);
        doc.text(`Ranking based on total sales • Top 3 performers highlighted • ${reportData.employees.length} total employees`, margin, yPosition);
        yPosition += 15;
        
        // Premium table with advanced styling and performance bars
        const tableStartY = yPosition;
        const rowHeight = 16;
        const colWidths = [45, 25, 35, 35, 30, 25];
        const headers = ['Employee', 'ID', 'Sales ($)', 'Commission', 'Shop Rev.', 'Rank'];
        
        // Modern gradient header
        doc.setFillColor(...colors.primary);
        doc.roundedRect(margin, yPosition - 3, contentWidth, rowHeight + 2, 2, 2, 'F');
        
        // Header accent
        doc.setFillColor(...colors.primaryDark);
        doc.rect(margin, yPosition + rowHeight - 2, contentWidth, 2, 'F');
        
        // Header text with icons
        doc.setTextColor(...colors.white);
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        
        let xPosition = margin + 3;
        const headerIcons = ['👤', '🆔', '💵', '📊', '🏪', '🏅'];
        headers.forEach((header, index) => {
          doc.text(`${headerIcons[index]} ${header}`, xPosition, yPosition + 7);
          xPosition += colWidths[index];
        });
        
        yPosition += rowHeight;
        
        // Table rows with alternating colors and performance indicators
        doc.setTextColor(...colors.black);
        doc.setFont(undefined, 'normal');
        
        // Calculate max sales for performance bars
        const maxSales = Math.max(...reportData.employees.map((emp: any) => emp.total_sales));
        
        reportData.employees.forEach((employee: any, index: number) => {
          // Check if we need a new page
          if (yPosition > pageHeight - 50) {
            doc.addPage();
            yPosition = margin;
            
            // Repeat modern header on new page
            doc.setFillColor(...colors.primary);
            doc.roundedRect(margin, yPosition - 3, contentWidth, rowHeight + 2, 2, 2, 'F');
            doc.setFillColor(...colors.primaryDark);
            doc.rect(margin, yPosition + rowHeight - 2, contentWidth, 2, 'F');
            
            doc.setTextColor(...colors.white);
            doc.setFontSize(9);
            doc.setFont(undefined, 'bold');
            
            xPosition = margin + 3;
            headers.forEach((header, i) => {
              doc.text(`${headerIcons[i]} ${header}`, xPosition, yPosition + 7);
              xPosition += colWidths[i];
            });
            
            yPosition += rowHeight;
            doc.setTextColor(...colors.neutralDark);
            doc.setFont(undefined, 'normal');
          }
          
          // Enhanced row styling with performance-based colors
          const performanceScore = (employee.total_sales / maxSales) * 100;
          let rowBgColor = colors.neutralLight;
          let accentColor = colors.neutral;
          
          if (index === 0) {
            rowBgColor = [255, 248, 220]; // Gold tint for #1
            accentColor = colors.gold;
          } else if (index === 1) {
            rowBgColor = [245, 245, 245]; // Silver tint for #2
            accentColor = colors.neutral;
          } else if (index === 2) {
            rowBgColor = [255, 237, 213]; // Bronze tint for #3
            accentColor = colors.warning;
          } else if (index % 2 === 0) {
            rowBgColor = colors.neutralLight;
          }
          
          // Row background with subtle styling
          doc.setFillColor(...rowBgColor);
          doc.roundedRect(margin, yPosition - 2, contentWidth, rowHeight, 1, 1, 'F');
          
          // Performance bar on the left edge
          const barWidth = 2;
          const barHeight = (performanceScore / 100) * (rowHeight - 4);
          doc.setFillColor(...accentColor);
          doc.rect(margin, yPosition + rowHeight - barHeight - 2, barWidth, barHeight, 'F');
          
          // Top performer medals
          if (index < 3 && reportData.employees.length > 3) {
            const medals = ['🥇', '🥈', '🥉'];
            doc.setFontSize(12);
            doc.text(medals[index], margin + contentWidth - 10, yPosition + 8);
          }
          
          // Enhanced row data with better typography and visual elements
          xPosition = margin + 5; // Offset for performance bar
          doc.setFontSize(8);
          
          // Employee name with smart truncation
          let nameText = employee.employee_name || employee.employee_id;
          if (nameText.length > 15) nameText = nameText.substring(0, 12) + '...';
          
          doc.setTextColor(...colors.neutralDark);
          doc.setFont(undefined, index < 3 ? 'bold' : 'normal');
          doc.text(nameText, xPosition, yPosition + 8);
          
          // Add performance indicator dot
          const performanceLevel = performanceScore > 75 ? 'high' : performanceScore > 50 ? 'medium' : 'low';
          const dotColor = performanceLevel === 'high' ? colors.success : 
                          performanceLevel === 'medium' ? colors.warning : colors.danger;
          doc.setFillColor(...dotColor);
          doc.circle(xPosition + 35, yPosition + 6, 1.5, 'F');
          
          xPosition += colWidths[0];
          
          // Employee ID with better formatting
          doc.setTextColor(...colors.neutral);
          doc.setFont(undefined, 'normal');
          let idText = employee.employee_id.toString();
          if (idText.length > 8) idText = idText.substring(0, 6) + '..';
          doc.text(idText, xPosition, yPosition + 8);
          xPosition += colWidths[1];
          
          // Sales amount with performance bar
          doc.setTextColor(...colors.success);
          doc.setFont(undefined, 'bold');
          doc.text(`$${employee.total_sales.toLocaleString()}`, xPosition, yPosition + 8);
          
          // Mini performance bar under sales
          const miniBarWidth = 25;
          const miniBarHeight = 2;
          const miniBarX = xPosition;
          const miniBarY = yPosition + 11;
          
          doc.setFillColor(...colors.neutralLight);
          doc.rect(miniBarX, miniBarY, miniBarWidth, miniBarHeight, 'F');
          
          const fillWidth = (miniBarWidth * performanceScore) / 100;
          doc.setFillColor(...colors.success);
          doc.rect(miniBarX, miniBarY, fillWidth, miniBarHeight, 'F');
          
          xPosition += colWidths[2];
          
          // Commission amount with percentage
          doc.setTextColor(...colors.info);
          doc.setFont(undefined, 'bold');
          doc.text(`$${employee.commission_amount.toLocaleString()}`, xPosition, yPosition + 8);
          
          // Commission rate
          const commRate = employee.total_sales > 0 ? (employee.commission_amount / employee.total_sales * 100) : 0;
          doc.setTextColor(...colors.neutral);
          doc.setFontSize(7);
          doc.setFont(undefined, 'normal');
          doc.text(`(${commRate.toFixed(1)}%)`, xPosition, yPosition + 12);
          
          xPosition += colWidths[3];
          
          // Shop commission with visual emphasis
          doc.setTextColor(...colors.accent);
          doc.setFont(undefined, 'bold');
          doc.setFontSize(8);
          const shopCom = employee.total_sales - employee.commission_amount;
          doc.text(`$${shopCom.toLocaleString()}`, xPosition, yPosition + 8);
          xPosition += colWidths[4];
          
          // Ranking with styled badges
          doc.setTextColor(...accentColor);
          doc.setFont(undefined, 'bold');
          doc.setFontSize(10);
          doc.text(`#${index + 1}`, xPosition, yPosition + 8);
          
          yPosition += rowHeight;
        });
        
        // Modern table border with shadow effect
        doc.setDrawColor(...colors.neutral);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, tableStartY - 3, contentWidth, yPosition - tableStartY + 5, 2, 2);
        
        // Add performance insights section
        yPosition += 10;
        
        // Performance Insights Box
        doc.setFillColor(...colors.neutralLight);
        doc.roundedRect(margin, yPosition, contentWidth, 25, 3, 3, 'F');
        
        doc.setFillColor(...colors.info);
        doc.rect(margin, yPosition, 4, 25, 'F');
        
        doc.setTextColor(...colors.neutralDark);
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('💡 PERFORMANCE INSIGHTS', margin + 10, yPosition + 8);
        
        // Generate insights
        const topPerformerSales = reportData.employees[0]?.total_sales || 0;
        const bottomPerformerSales = reportData.employees[reportData.employees.length - 1]?.total_sales || 0;
        const performanceGap = topPerformerSales - bottomPerformerSales;
        
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...colors.neutral);
        doc.text(`Performance Gap: $${performanceGap.toLocaleString()} between top and bottom performer`, margin + 10, yPosition + 16);
        doc.text(`Team Efficiency: ${reportData.employees.length > 0 ? ((totalCommission/totalSales)*100).toFixed(1) : '0'}% commission rate indicates ${commissionRate > 15 ? 'high' : commissionRate > 10 ? 'moderate' : 'conservative'} incentive structure`, margin + 10, yPosition + 21);
        
        yPosition += 30;
      }
      
      // Premium footer with branding
      const footerY = pageHeight - 30;
      
      // Footer gradient background
      doc.setFillColor(...colors.primary);
      doc.rect(0, footerY, pageWidth, 30, 'F');
      
      doc.setFillColor(...colors.primaryDark);
      doc.rect(0, footerY, pageWidth, 3, 'F');
      
      // Company branding section
      doc.setTextColor(...colors.white);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('🚀 POWERED BY SALES MANAGEMENT PRO', pageWidth / 2, footerY + 12, { align: 'center' });
      
      // Footer details
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...colors.primaryLight);
      doc.text(`Confidential Report • Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, pageWidth / 2, footerY + 20, { align: 'center' });
      
      // Add QR code placeholder (simulated)
      doc.setFillColor(...colors.white);
      doc.roundedRect(pageWidth - 35, footerY + 5, 20, 20, 2, 2, 'F');
      doc.setTextColor(...colors.primary);
      doc.setFontSize(6);
      doc.text('QR CODE', pageWidth - 28, footerY + 12, { align: 'center' });
      doc.text('DASHBOARD', pageWidth - 28, footerY + 18, { align: 'center' });
      
      // Add page numbers if multiple pages
      const pageCount = doc.internal.getNumberOfPages();
      if (pageCount > 1) {
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setTextColor(...colors.gray);
          doc.setFontSize(8);
          doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, footerY + 20, { align: 'right' });
        }
      }
      
      // Convert to buffer
      const pdfBuffer = new Uint8Array(doc.output('arraybuffer'));
      
      console.log('PDF content created, uploading to storage...');
      
      // Upload PDF to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from('reports')
        .upload(filePath, pdfBuffer, {
          contentType: 'application/pdf',
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