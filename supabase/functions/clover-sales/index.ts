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

interface CloverSalesRequest {
  merchantId: string;
  startDate: string;
  endDate: string;
}

interface CloverEmployee {
  id: string;
  name: string;
  role?: string;
}

interface CloverOrder {
  id: string;
  employee: CloverEmployee;
  total: number;
  created: number;
  taxAmount?: number;
  serviceCharge?: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Input validation
    const requestBody = await req.json();
    const { merchantId, startDate, endDate } = requestBody;

    // Validate required fields
    if (!merchantId || !startDate || !endDate) {
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: merchantId, startDate, endDate' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate date format
    const startDateTime = new Date(startDate);
    const endDateTime = new Date(endDate);
    
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      return new Response(JSON.stringify({ 
        error: 'Invalid date format. Use ISO 8601 format.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate merchant ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(merchantId)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid merchant ID format' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Initialize Supabase client with service role for server-side operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Fetching sales data for merchant:', merchantId, 'from', startDate, 'to', endDate);

    // Get merchant's Clover API credentials from secure storage
    const { data: credentials, error: credError } = await supabase
      .from('secure_credentials')
      .select('credential_type, encrypted_value')
      .eq('merchant_id', merchantId)
      .eq('is_active', true)
      .in('credential_type', ['clover_merchant_id', 'clover_api_token']);

    if (credError) {
      console.error('Error fetching secure credentials:', credError);
      return new Response(JSON.stringify({ error: 'Failed to fetch credentials' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!credentials || credentials.length !== 2) {
      return new Response(JSON.stringify({ 
        error: 'Clover API credentials not configured for this merchant',
        code: 'MISSING_CLOVER_CREDENTIALS'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Simple decryption - replace with proper decryption in production
    const simpleDecrypt = (encrypted: string): string => {
      try {
        return atob(encrypted);
      } catch {
        return '';
      }
    };

    // Decrypt credentials
    const credMap: Record<string, string> = {};
    credentials.forEach(cred => {
      credMap[cred.credential_type] = simpleDecrypt(cred.encrypted_value);
    });

    const cloverApiToken = credMap.clover_api_token;
    const cloverMerchantId = credMap.clover_merchant_id;

    // Convert dates to Unix timestamps for Clover API
    const startTime = new Date(startDate).getTime();
    const endTime = new Date(endDate).getTime();

    // Fetch employees from Clover API
    console.log('Fetching employees from Clover API...');
    const employeesResponse = await fetch(
      `https://api.clover.com/v3/merchants/${cloverMerchantId}/employees`,
      {
        headers: {
          'Authorization': `Bearer ${cloverApiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!employeesResponse.ok) {
      console.error('Clover employees API error:', employeesResponse.status);
      return new Response(JSON.stringify({ error: 'Failed to fetch employees from Clover' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const employeesData = await employeesResponse.json();
    const employees: CloverEmployee[] = employeesData.elements || [];

    console.log('Found employees:', employees.length);

    // Fetch orders from Clover API
    console.log('Fetching orders from Clover API...');
    const ordersResponse = await fetch(
      `https://api.clover.com/v3/merchants/${cloverMerchantId}/orders?filter=createdTime>=${startTime}&filter=createdTime<=${endTime}&expand=lineItems,employee`,
      {
        headers: {
          'Authorization': `Bearer ${cloverApiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!ordersResponse.ok) {
      console.error('Clover orders API error:', ordersResponse.status);
      return new Response(JSON.stringify({ error: 'Failed to fetch orders from Clover' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ordersData = await ordersResponse.json();
    const orders: CloverOrder[] = ordersData.elements || [];

    console.log('Found orders:', orders.length);

    // Debug: Log first few orders to understand the data structure
    if (orders.length > 0) {
      console.log('Sample order structure:', JSON.stringify(orders[0], null, 2));
      console.log('Sample order.total:', orders[0].total);
      console.log('Sample order.created:', orders[0].created);
      console.log('Sample order.employee:', orders[0].employee);
    }

    // Calculate sales by employee and date
    const salesByEmployeeAndDate = new Map<string, { 
      employeeId: string,
      employeeName: string,
      salesDate: string,
      totalSales: number, 
      orderCount: number 
    }>();

    let processedOrdersCount = 0;
    let totalSalesDebug = 0;

    // Process orders and calculate sales by employee and date
    orders.forEach((order, index) => {
      if (order.employee && order.employee.id && order.created) {
        const employeeId = order.employee.id;
        const employeeName = order.employee.name || 'Unknown Employee';
        
        // Debug order processing
        if (index < 3) { // Log first 3 orders
          console.log(`Order ${index}: Employee ${employeeId} (${employeeName}), Total: ${order.total}, Created: ${order.created}`);
        }
        
        // Convert Unix timestamp to date string (YYYY-MM-DD)
        const orderDate = new Date(order.created).toISOString().split('T')[0];
        const key = `${employeeId}-${orderDate}`;
        
        const orderTotal = order.total || 0;
        totalSalesDebug += orderTotal;
        processedOrdersCount++;
        
        const current = salesByEmployeeAndDate.get(key);
        
        if (current) {
          current.totalSales += orderTotal;
          current.orderCount += 1;
        } else {
          salesByEmployeeAndDate.set(key, {
            employeeId,
            employeeName,
            salesDate: orderDate,
            totalSales: orderTotal,
            orderCount: 1
          });
        }
      } else {
        // Debug orders that are being skipped
        if (index < 3) {
          console.log(`Skipped order ${index}: employee=${!!order.employee}, employee.id=${order.employee?.id}, created=${order.created}`);
        }
      }
    });

    console.log(`Processed ${processedOrdersCount} orders out of ${orders.length}`);
    console.log(`Total sales before conversion (cents): ${totalSalesDebug}`);
    console.log(`Total sales after conversion (dollars): ${totalSalesDebug / 100}`);
    console.log(`Sales entries created: ${salesByEmployeeAndDate.size}`);

    // Add zero-sales entries for employees with no sales on any day in the range
    // (Only for the start date to avoid cluttering the database)
    employees.forEach(employee => {
      const startDateKey = `${employee.id}-${new Date(startDate).toISOString().split('T')[0]}`;
      if (!salesByEmployeeAndDate.has(startDateKey)) {
        salesByEmployeeAndDate.set(startDateKey, {
          employeeId: employee.id,
          employeeName: employee.name,
          salesDate: new Date(startDate).toISOString().split('T')[0],
          totalSales: 0,
          orderCount: 0
        });
      }
    });

    // Get default commission percentage for this merchant
    const { data: settings } = await supabase
      .from('settings')
      .select('commission_percentage')
      .eq('merchant_id', merchantId)
      .single();

    const defaultCommissionRate = (settings?.commission_percentage || 70) / 100;

    // Get individual employee commission rates
    const { data: employeeCommissions } = await supabase
      .from('employee_commissions')
      .select('employee_id, commission_percentage')
      .eq('merchant_id', merchantId);

    const employeeCommissionMap = new Map<string, number>();
    employeeCommissions?.forEach(ec => {
      employeeCommissionMap.set(ec.employee_id, ec.commission_percentage / 100);
    });

    // Convert to array and calculate commissions using individual rates
    const salesData = Array.from(salesByEmployeeAndDate.values()).map((data) => {
      const commissionRate = employeeCommissionMap.get(data.employeeId) || defaultCommissionRate;
      const totalSales = data.totalSales / 100; // Convert from cents to dollars
      const commissionAmount = totalSales * commissionRate;
      
      return {
        employee_id: data.employeeId,
        employee_name: data.employeeName,
        sales_date: data.salesDate,
        total_sales: totalSales,
        order_count: data.orderCount,
        commission_amount: commissionAmount,
        commission_rate: commissionRate * 100, // Store as percentage for display
      };
    });

    // Store sales data in database for historical tracking
    const salesDataForStorage = salesData.map(data => ({
      merchant_id: merchantId,
      employee_id: data.employee_id,
      employee_name: data.employee_name,
      sales_date: data.sales_date, // Use actual sales date instead of start date
      total_sales: data.total_sales,
      commission_amount: data.commission_amount,
    }));

    if (salesDataForStorage.length > 0) {
      const { error: insertError } = await supabase
        .from('employee_sales_data')
        .upsert(salesDataForStorage, {
          onConflict: 'merchant_id,employee_id,sales_date'
        });

      if (insertError) {
        console.error('Error storing sales data:', insertError);
      }
    }

    console.log('Sales data processed successfully');

    return new Response(JSON.stringify({ 
      success: true,
      salesData,
      summary: {
        totalEmployees: salesData.length,
        totalSales: salesData.reduce((sum, emp) => sum + emp.total_sales, 0),
        totalCommissions: salesData.reduce((sum, emp) => sum + emp.commission_amount, 0),
        orderCount: orders.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in clover-sales function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

serve(handler);