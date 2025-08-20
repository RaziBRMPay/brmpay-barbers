import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    // Initialize Supabase client with service role for server-side operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { merchantId, startDate, endDate }: CloverSalesRequest = await req.json();

    console.log('Fetching sales data for merchant:', merchantId, 'from', startDate, 'to', endDate);

    // Get merchant's Clover API credentials from database
    const { data: merchant, error: merchantError } = await supabase
      .from('merchants')
      .select('clover_merchant_id, clover_api_token, shop_name')
      .eq('id', merchantId)
      .single();

    if (merchantError || !merchant) {
      console.error('Error fetching merchant:', merchantError);
      return new Response(JSON.stringify({ error: 'Merchant not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!merchant.clover_merchant_id || !merchant.clover_api_token) {
      return new Response(JSON.stringify({ 
        error: 'Clover API credentials not configured for this merchant',
        code: 'MISSING_CLOVER_CREDENTIALS'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cloverApiToken = merchant.clover_api_token;
    const cloverMerchantId = merchant.clover_merchant_id;

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

    // Calculate sales by employee
    const salesByEmployee = new Map<string, { 
      name: string, 
      totalSales: number, 
      orderCount: number 
    }>();

    // Initialize all employees with zero sales
    employees.forEach(employee => {
      salesByEmployee.set(employee.id, {
        name: employee.name,
        totalSales: 0,
        orderCount: 0
      });
    });

    // Process orders and calculate sales
    orders.forEach(order => {
      if (order.employee && order.employee.id) {
        const employeeId = order.employee.id;
        const current = salesByEmployee.get(employeeId);
        
        if (current) {
          current.totalSales += order.total || 0;
          current.orderCount += 1;
        } else {
          // Employee not found in employees list, add them
          salesByEmployee.set(employeeId, {
            name: order.employee.name || 'Unknown Employee',
            totalSales: order.total || 0,
            orderCount: 1
          });
        }
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
    const salesData = Array.from(salesByEmployee.entries()).map(([employeeId, data]) => {
      const commissionRate = employeeCommissionMap.get(employeeId) || defaultCommissionRate;
      const totalSales = data.totalSales / 100; // Convert from cents to dollars
      const commissionAmount = totalSales * commissionRate;
      
      return {
        employee_id: employeeId,
        employee_name: data.name,
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
      sales_date: new Date(startDate).toISOString().split('T')[0],
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