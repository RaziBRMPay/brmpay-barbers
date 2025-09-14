import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-picker-with-range';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart3, TrendingUp, DollarSign, Users, Download, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { addDays } from 'date-fns';
import { DateRange } from 'react-day-picker';

interface PlatformStats {
  totalRevenue: number;
  totalCommissions: number;
  totalReports: number;
  activeMerchants: number;
}

interface ReportSummary {
  id: string;
  merchant_name: string;
  report_date: string;
  report_type: string;
  total_sales: number;
  total_commissions: number;
  created_at: string;
}

const AdminReports = () => {
  const [stats, setStats] = useState<PlatformStats>({
    totalRevenue: 0,
    totalCommissions: 0,
    totalReports: 0,
    activeMerchants: 0
  });
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -30),
    to: new Date()
  });
  const [reportTypeFilter, setReportTypeFilter] = useState('all');

  useEffect(() => {
    fetchReportsData();
  }, [dateRange, reportTypeFilter]);

  const fetchReportsData = async () => {
    try {
      // Fetch platform statistics
      const { data: merchantsData } = await supabase
        .from('merchants')
        .select('id');

      const { data: reportsData } = await supabase
        .from('reports')
        .select(`
          id,
          report_date,
          report_type,
          report_data,
          created_at,
          merchants!reports_merchant_id_fkey (
            shop_name
          )
        `)
        .gte('report_date', dateRange.from?.toISOString().split('T')[0])
        .lte('report_date', dateRange.to?.toISOString().split('T')[0])
        .eq(reportTypeFilter !== 'all' ? 'report_type' : 'report_type', reportTypeFilter !== 'all' ? reportTypeFilter : undefined);

      if (reportsData) {
        // Calculate aggregated stats from report data
        let totalRevenue = 0;
        let totalCommissions = 0;

        const formattedReports: ReportSummary[] = reportsData.map(report => {
          const reportData = report.report_data as any;
          const sales = reportData?.totalSales || 0;
          const commissions = reportData?.totalCommissions || 0;
          
          totalRevenue += sales;
          totalCommissions += commissions;

          return {
            id: report.id,
            merchant_name: report.merchants?.shop_name || 'Unknown',
            report_date: report.report_date,
            report_type: report.report_type,
            total_sales: sales,
            total_commissions: commissions,
            created_at: report.created_at
          };
        });

        setStats({
          totalRevenue,
          totalCommissions,
          totalReports: reportsData.length,
          activeMerchants: merchantsData?.length || 0
        });

        setReports(formattedReports);
      }
    } catch (error) {
      console.error('Error fetching reports data:', error);
      toast({
        title: "Error",
        description: "Failed to load reports data",
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
        {/* Header */}
        <div className="bg-gradient-card rounded-2xl p-6 shadow-soft border">
          <div className="flex items-center space-x-4">
            <div className="bg-primary/10 rounded-full p-3">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                Platform Reports & Analytics
              </h2>
              <p className="text-muted-foreground">
                View comprehensive platform performance and merchant analytics
              </p>
            </div>
          </div>
        </div>

        {/* Platform Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                ${stats.totalRevenue.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Across all merchants</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Commissions</CardTitle>
              <TrendingUp className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent">
                ${stats.totalCommissions.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Employee earnings</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reports Generated</CardTitle>
              <BarChart3 className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">
                {stats.totalReports}
              </div>
              <p className="text-xs text-muted-foreground">In selected period</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Merchants</CardTitle>
              <Users className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {stats.activeMerchants}
              </div>
              <p className="text-xs text-muted-foreground">Total merchants</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Filter Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-sm font-medium mb-2 block">Date Range</label>
                <DatePickerWithRange
                  selected={dateRange}
                  onSelect={setDateRange}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Report Type</label>
                <Select value={reportTypeFilter} onValueChange={setReportTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="daily_sales">Daily Sales</SelectItem>
                    <SelectItem value="weekly_summary">Weekly Summary</SelectItem>
                    <SelectItem value="monthly_report">Monthly Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="w-full bg-gradient-primary hover:shadow-glow transition-all duration-300">
                  <Download className="h-4 w-4 mr-2" />
                  Export Data
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Reports Table */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Recent Reports ({reports.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <div className="text-center py-8">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No reports found for the selected criteria</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Report Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Sales</TableHead>
                      <TableHead>Commissions</TableHead>
                      <TableHead>Generated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell className="font-medium">
                          {report.merchant_name}
                        </TableCell>
                        <TableCell>
                          {new Date(report.report_date).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {report.report_type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-success">
                          ${report.total_sales.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-accent">
                          ${report.total_commissions.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {new Date(report.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminReports;