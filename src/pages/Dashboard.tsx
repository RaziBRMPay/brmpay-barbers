import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, DollarSign, Users, TrendingUp, Calculator } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

interface MerchantData {
  id: string;
  shop_name: string;
  timezone: string;
}

interface SettingsData {
  commission_percentage: number;
  report_time_cycle: string;
}

const Dashboard = () => {
  const { profile } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [merchantData, setMerchantData] = useState<MerchantData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role === 'merchant') {
      fetchMerchantData();
    }
  }, [profile]);

  useEffect(() => {
    // Auto-load today's data when merchant data is available
    if (merchantData) {
      generateReport();
    }
  }, [merchantData, selectedDate]);

  const fetchMerchantData = async () => {
    try {
      // Fetch merchant data
      const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('*')
        .eq('user_id', profile?.id)
        .single();

      if (merchantError) {
        console.error('Error fetching merchant data:', merchantError);
        return;
      }

      setMerchantData(merchant);

      // Fetch settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .select('*')
        .eq('merchant_id', merchant.id)
        .single();

      if (settingsError) {
        console.error('Error fetching settings:', settingsError);
        return;
      }

      setSettings(settingsData);
    } catch (error) {
      console.error('Error in fetchMerchantData:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    if (!merchantData) {
      return;
    }

    setLoading(true);
    try {
      // Call the Clover API integration edge function
      const { data, error } = await supabase.functions.invoke('clover-sales', {
        body: {
          merchantId: merchantData.id,
          startDate: selectedDate.toISOString(),
          endDate: selectedDate.toISOString()
        }
      });

      if (error) {
        console.error('Error calling clover-sales function:', error);
        
        // Check if it's a missing credentials error
        if (error.message?.includes('MISSING_CLOVER_CREDENTIALS') || 
            (data && data.code === 'MISSING_CLOVER_CREDENTIALS')) {
          toast({
            title: "Clover API Setup Required",
            description: "Please configure your Clover API credentials in settings to fetch sales data",
            variant: "destructive",
          });
          return;
        }
        
        toast({
          title: "Error",
          description: "Failed to fetch sales data from Clover",
          variant: "destructive",
        });
        return;
      }

      if (data?.success) {
        setSalesData(data.salesData);
        toast({
          title: "Success",
          description: `Found ${data.salesData.length} employees with sales data`,
        });
      } else {
        toast({
          title: "Warning",
          description: data?.error || "No sales data found for the selected period",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Error",
        description: "Failed to generate report",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendCommissionReport = async () => {
    if (!merchantData || salesData.length === 0) {
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-commission-report', {
        body: {
          merchantId: merchantData.id,
          salesData: salesData,
          dateRange: {
            from: selectedDate.toISOString().split('T')[0],
            to: selectedDate.toISOString().split('T')[0]
          }
        }
      });

      if (error) {
        console.error('Error sending commission report:', error);
        toast({
          title: "Error",
          description: "Failed to send email report",
          variant: "destructive",
        });
        return;
      }

      if (data.success) {
        toast({
          title: "📧 Email Sent!",
          description: `Commission report sent to ${data.sentTo}`,
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to send email report",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error sending commission report:', error);
      toast({
        title: "Error",
        description: "Failed to send email report",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="bg-gradient-card rounded-2xl p-6 shadow-soft border">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Sales Commission Dashboard
          </h2>
          <p className="text-muted-foreground">
            Track daily sales and commissions for {merchantData?.shop_name || 'your shop'}
          </p>
        </div>

        {/* Date Selection and Summary */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Selected Date</CardTitle>
              <CalendarIcon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-primary">
                {format(selectedDate, "MMM dd, yyyy")}
              </div>
              <p className="text-xs text-muted-foreground">Current viewing</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <DollarSign className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-accent">
                ${salesData.reduce((sum: number, emp: any) => sum + emp.total_sales, 0).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">Today's total</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Commissions</CardTitle>
              <Calculator className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-warning">
                ${salesData.reduce((sum: number, emp: any) => sum + emp.commission_amount, 0).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">To be paid</p>
            </CardContent>
          </Card>
        </div>

        {/* Date Selection and Actions */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Date Selection</CardTitle>
            <CardDescription>
              Choose a different date to view sales commissions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="justify-start text-left font-normal min-w-[200px]"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDate, "LLL dd, y")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              
              <div className="flex gap-3">
                <Button 
                  onClick={() => setSelectedDate(new Date())}
                  variant="outline"
                  className="hover:shadow-soft transition-all duration-300"
                >
                  Today
                </Button>
                
                {salesData.length > 0 && (
                  <Button 
                    onClick={sendCommissionReport}
                    disabled={loading}
                    variant="outline"
                    className="hover:shadow-soft transition-all duration-300"
                  >
                    📧 Send Email Report
                  </Button>
                )}
              </div>
            </div>

          </CardContent>
        </Card>

        {/* Sales Data Display */}
        {salesData.length > 0 ? (
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader>
              <CardTitle>Employee Commission Report</CardTitle>
              <CardDescription>
                Commission breakdown for {format(selectedDate, "MMMM dd, yyyy")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-white rounded-lg shadow-soft overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium">Employee</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">Total Sales</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">Orders</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">Commission ({settings?.commission_percentage}%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {salesData.map((employee: any, index: number) => (
                      <tr key={index} className="hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium">{employee.employee_name}</td>
                        <td className="px-4 py-3 text-right">${employee.total_sales.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">{employee.order_count || 0}</td>
                        <td className="px-4 py-3 text-right font-semibold text-accent">
                          ${employee.commission_amount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted font-semibold">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      <td className="px-4 py-3 text-right">
                        ${salesData.reduce((sum: number, emp: any) => sum + emp.total_sales, 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {salesData.reduce((sum: number, emp: any) => sum + (emp.order_count || 0), 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-accent">
                        ${salesData.reduce((sum: number, emp: any) => sum + emp.commission_amount, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader>
              <CardTitle>No Sales Data</CardTitle>
              <CardDescription>
                No sales found for {format(selectedDate, "MMMM dd, yyyy")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  No sales data available for the selected date.
                </p>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    💡 <strong>Need real data?</strong> Configure your Clover API credentials in{' '}
                    <a href="/settings" className="text-primary hover:underline font-medium">
                      Settings
                    </a>{' '}
                    to automatically fetch sales data from your Clover account.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;