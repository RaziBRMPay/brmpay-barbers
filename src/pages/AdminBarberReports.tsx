import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-picker-with-range';
import { Search, Download, TrendingUp, DollarSign, Users, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { DateRange } from 'react-day-picker';
import { format } from 'date-fns';

interface BarberReport {
  id: string;
  employee_id: string;
  employee_name: string;
  merchant_id: string;
  shop_name: string;
  total_sales: number;
  commission_amount: number;
  sales_count: number;
  avg_sale: number;
  commission_percentage: number;
  sales_date: string;
}

interface BarberSummary {
  employee_id: string;
  employee_name: string;
  total_sales: number;
  total_commission: number;
  total_transactions: number;
  avg_sale: number;
  performance_rank: number;
}

const AdminBarberReports = () => {
  const [barberReports, setBarberReports] = useState<BarberReport[]>([]);
  const [barberSummaries, setBarberSummaries] = useState<BarberSummary[]>([]);
  const [merchants, setMerchants] = useState<{ id: string; shop_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: new Date(new Date().setDate(new Date().getDate() - 30)),
    to: new Date()
  });

  useEffect(() => {
    fetchMerchants();
    fetchBarberReports();
  }, []);

  useEffect(() => {
    fetchBarberReports();
  }, [dateRange, selectedMerchant]);

  const fetchMerchants = async () => {
    try {
      const { data, error } = await supabase
        .from('merchants')
        .select('id, shop_name')
        .order('shop_name');

      if (error) throw error;
      setMerchants(data || []);
    } catch (error) {
      console.error('Error fetching merchants:', error);
      toast({
        title: "Error",
        description: "Failed to load merchants",
        variant: "destructive",
      });
    }
  };

  const fetchBarberReports = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('employee_sales_data')
        .select(`
          *,
          merchants!employee_sales_data_merchant_id_fkey (
            shop_name
          )
        `)
        .order('sales_date', { ascending: false });

      if (selectedMerchant !== 'all') {
        query = query.eq('merchant_id', selectedMerchant);
      }

      if (dateRange?.from) {
        query = query.gte('sales_date', format(dateRange.from, 'yyyy-MM-dd'));
      }

      if (dateRange?.to) {
        query = query.lte('sales_date', format(dateRange.to, 'yyyy-MM-dd'));
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform data and calculate summaries
      const reports = (data || []).map(item => ({
        id: item.id,
        employee_id: item.employee_id,
        employee_name: item.employee_name,
        merchant_id: item.merchant_id,
        shop_name: item.merchants?.shop_name || 'Unknown Shop',
        total_sales: Number(item.total_sales),
        commission_amount: Number(item.commission_amount),
        sales_count: 1, // Each record represents one day
        avg_sale: Number(item.total_sales),
        commission_percentage: item.total_sales > 0 ? (Number(item.commission_amount) / Number(item.total_sales)) * 100 : 0,
        sales_date: item.sales_date
      }));

      setBarberReports(reports);

      // Calculate barber summaries
      const summaryMap = new Map<string, BarberSummary>();
      
      reports.forEach(report => {
        const key = report.employee_id;
        if (summaryMap.has(key)) {
          const existing = summaryMap.get(key)!;
          existing.total_sales += report.total_sales;
          existing.total_commission += report.commission_amount;
          existing.total_transactions += 1;
        } else {
          summaryMap.set(key, {
            employee_id: report.employee_id,
            employee_name: report.employee_name,
            total_sales: report.total_sales,
            total_commission: report.commission_amount,
            total_transactions: 1,
            avg_sale: 0,
            performance_rank: 0
          });
        }
      });

      // Calculate averages and rankings
      const summaries = Array.from(summaryMap.values()).map(summary => ({
        ...summary,
        avg_sale: summary.total_transactions > 0 ? summary.total_sales / summary.total_transactions : 0
      }));

      // Sort by total sales and assign ranks
      summaries.sort((a, b) => b.total_sales - a.total_sales);
      summaries.forEach((summary, index) => {
        summary.performance_rank = index + 1;
      });

      setBarberSummaries(summaries);
    } catch (error) {
      console.error('Error fetching barber reports:', error);
      toast({
        title: "Error",
        description: "Failed to load barber reports",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredSummaries = barberSummaries.filter(barber =>
    barber.employee_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getRankBadgeVariant = (rank: number) => {
    if (rank === 1) return 'default';
    if (rank <= 3) return 'secondary';
    return 'outline';
  };

  if (loading && barberSummaries.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  const totalSales = barberSummaries.reduce((sum, barber) => sum + barber.total_sales, 0);
  const totalCommissions = barberSummaries.reduce((sum, barber) => sum + barber.total_commission, 0);
  const avgSalePerBarber = barberSummaries.length > 0 ? totalSales / barberSummaries.length : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Barber Performance Reports</h2>
            <p className="text-muted-foreground">Track individual barber performance and commission earnings</p>
          </div>
          <Button className="bg-gradient-primary hover:shadow-glow transition-all duration-300">
            <Download className="mr-2 h-4 w-4" />
            Export Data
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Sales</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalSales)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Commissions</p>
                  <p className="text-2xl font-bold">{formatCurrency(totalCommissions)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Users className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Active Barbers</p>
                  <p className="text-2xl font-bold">{barberSummaries.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Star className="h-6 w-6 text-orange-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Avg per Barber</p>
                  <p className="text-2xl font-bold">{formatCurrency(avgSalePerBarber)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardContent className="pt-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search barbers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <Select value={selectedMerchant} onValueChange={setSelectedMerchant}>
                <SelectTrigger className="w-full lg:w-48">
                  <SelectValue placeholder="All Shops" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Shops</SelectItem>
                  {merchants.map((merchant) => (
                    <SelectItem key={merchant.id} value={merchant.id}>
                      {merchant.shop_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DatePickerWithRange
                selected={dateRange}
                onSelect={setDateRange}
                className="w-full lg:w-80"
              />
            </div>
          </CardContent>
        </Card>

        {/* Barber Performance Table */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Barber Performance ({filteredSummaries.length})</CardTitle>
            <CardDescription>Individual barber performance metrics and rankings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-white rounded-lg shadow-soft overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Rank</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Barber</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Total Sales</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Commission Earned</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Transactions</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Avg Sale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredSummaries.map((barber) => (
                    <tr key={barber.employee_id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Badge variant={getRankBadgeVariant(barber.performance_rank)}>
                          #{barber.performance_rank}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{barber.employee_name}</p>
                          <p className="text-sm text-muted-foreground">ID: {barber.employee_id}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(barber.total_sales)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-green-600">
                        {formatCurrency(barber.total_commission)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {barber.total_transactions}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatCurrency(barber.avg_sale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSummaries.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No barber data found for the selected criteria.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminBarberReports;