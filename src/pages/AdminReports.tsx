import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-picker-with-range';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { BarChart3, TrendingUp, DollarSign, Users, Download, Eye, FileText } from 'lucide-react';
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
  file_url: string | null;
  file_name: string | null;
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
  const [merchantFilter, setMerchantFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchReportsData();
  }, [dateRange, reportTypeFilter, merchantFilter]);

  const fetchReportsData = async () => {
    try {
      // Fetch platform statistics
      const { data: merchantsData } = await supabase
        .from('merchants')
        .select('id');

      let query = supabase
        .from('reports')
        .select(`
          id,
          report_date,
          report_type,
          report_data,
          created_at,
          file_url,
          file_name,
          merchants!reports_merchant_id_fkey (
            shop_name
          )
        `)
        .gte('report_date', dateRange?.from?.toISOString().split('T')[0] || '2020-01-01')
        .lte('report_date', dateRange?.to?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0])
        .order('created_at', { ascending: false });

      if (reportTypeFilter !== 'all') {
        query = query.eq('report_type', reportTypeFilter);
      }

      const { data: reportsData } = await query;

      if (reportsData) {
        // Calculate aggregated stats from report data
        let totalRevenue = 0;
        let totalCommissions = 0;

        let formattedReports: ReportSummary[] = reportsData.map(report => {
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
            created_at: report.created_at,
            file_url: report.file_url,
            file_name: report.file_name
          };
        });

        // Apply merchant filter
        if (merchantFilter) {
          formattedReports = formattedReports.filter(report => 
            report.merchant_name.toLowerCase().includes(merchantFilter.toLowerCase())
          );
        }

        // Apply search filter
        if (searchTerm) {
          formattedReports = formattedReports.filter(report => 
            report.merchant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            report.file_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            report.report_type.toLowerCase().includes(searchTerm.toLowerCase())
          );
        }

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

  const handleDownload = async (fileUrl: string | null, fileName: string | null) => {
    if (!fileUrl) {
      toast({
        title: "Error",
        description: "No file available for download",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(fileUrl);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'report.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Success",
        description: "Report downloaded successfully",
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Error",
        description: "Failed to download report",
        variant: "destructive",
      });
    }
  };

  const handlePreview = (fileUrl: string | null) => {
    if (!fileUrl) {
      toast({
        title: "Error",
        description: "No file available for preview",
        variant: "destructive",
      });
      return;
    }
    
    window.open(fileUrl, '_blank');
  };

  const filteredReports = reports.filter(report => {
    const matchesSearch = !searchTerm || 
      report.merchant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.file_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.report_type.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

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
            <CardTitle>Filter & Search Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
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
              <div>
                <label className="text-sm font-medium mb-2 block">Search</label>
                <Input
                  placeholder="Search reports, merchants..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
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

        {/* PDF Reports Table */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Generated PDF Reports ({filteredReports.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredReports.length === 0 ? (
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
                      <TableHead>File Name</TableHead>
                      <TableHead>Sales</TableHead>
                      <TableHead>Commissions</TableHead>
                      <TableHead>Generated</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.map((report) => (
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
                        <TableCell className="text-sm text-muted-foreground">
                          {report.file_name || 'No file'}
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
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handlePreview(report.file_url)}
                              disabled={!report.file_url}
                              title="Preview PDF"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleDownload(report.file_url, report.file_name)}
                              disabled={!report.file_url}
                              title="Download PDF"
                            >
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