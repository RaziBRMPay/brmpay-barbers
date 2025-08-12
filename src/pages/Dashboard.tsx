import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, DollarSign, Users, TrendingUp, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { supabase } from '@/integrations/supabase/client';

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
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [merchantData, setMerchantData] = useState<MerchantData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role === 'merchant') {
      fetchMerchantData();
    }
  }, [profile]);

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
    if (!dateRange?.from || !dateRange?.to || !merchantData) {
      return;
    }

    setLoading(true);
    try {
      // For now, we'll create some sample data since Clover API integration isn't set up yet
      const sampleData = [
        { employee_name: 'John Smith', total_sales: 1250.00, commission_amount: 875.00 },
        { employee_name: 'Sarah Johnson', total_sales: 980.00, commission_amount: 686.00 },
        { employee_name: 'Mike Davis', total_sales: 1100.00, commission_amount: 770.00 },
      ];
      
      setSalesData(sampleData);
    } catch (error) {
      console.error('Error generating report:', error);
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
            Welcome back, {merchantData?.shop_name || 'Merchant'}!
          </h2>
          <p className="text-muted-foreground">
            Generate commission reports and track your employee performance.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Commission Rate</CardTitle>
              <DollarSign className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent">
                {settings?.commission_percentage || 70}%
              </div>
              <p className="text-xs text-muted-foreground">Current rate</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Report Time</CardTitle>
              <Clock className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {settings?.report_time_cycle || '9:00 PM'}
              </div>
              <p className="text-xs text-muted-foreground">Daily report time</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Timezone</CardTitle>
              <TrendingUp className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">
                {merchantData?.timezone?.replace('US/', '') || 'Eastern'}
              </div>
              <p className="text-xs text-muted-foreground">Local timezone</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">3</div>
              <p className="text-xs text-muted-foreground">Sample data</p>
            </CardContent>
          </Card>
        </div>

        {/* Report Generation */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Generate Commission Report</CardTitle>
            <CardDescription>
              Select a date range to calculate employee commissions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="justify-start text-left font-normal min-w-[280px]"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd, y")} -{" "}
                          {format(dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
              
              <Button 
                onClick={generateReport}
                disabled={!dateRange?.from || !dateRange?.to || loading}
                className="bg-gradient-primary hover:shadow-glow transition-all duration-300"
              >
                {loading ? 'Generating...' : 'Generate Report'}
              </Button>
            </div>

            {/* Sample Sales Data Display */}
            {salesData.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-4">Commission Report</h3>
                <div className="bg-white rounded-lg shadow-soft overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium">Employee</th>
                        <th className="px-4 py-3 text-right text-sm font-medium">Total Sales</th>
                        <th className="px-4 py-3 text-right text-sm font-medium">Commission ({settings?.commission_percentage}%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {salesData.map((employee: any, index: number) => (
                        <tr key={index} className="hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium">{employee.employee_name}</td>
                          <td className="px-4 py-3 text-right">${employee.total_sales.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-accent">
                            ${employee.commission_amount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  * This is sample data. Connect your Clover API for real sales data.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;