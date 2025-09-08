import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Download, Calendar, Loader2, RefreshCw, TestTube, Play, Grid, List } from 'lucide-react';
import { format } from 'date-fns';
import { DateRange } from 'react-day-picker';
import ReportStatusMonitor from '@/components/ReportStatusMonitor';
import ReportNotificationSystem from '@/components/ReportNotificationSystem';
import { ReportsTable } from '@/components/reports/ReportsTable';
import { ReportFilters } from '@/components/reports/ReportFilters';
import { ReportPreviewModal } from '@/components/reports/ReportPreviewModal';
import { BulkActionToolbar } from '@/components/reports/BulkActionToolbar';

interface Report {
  id: string;
  report_date: string;
  report_type: string;
  file_name: string | null;
  file_url: string | null;
  created_at: string;
  report_data: any;
}

interface MerchantData {
  id: string;
  shop_name: string;
}

const Reports = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [merchantData, setMerchantData] = useState<MerchantData | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [testingScheduler, setTestingScheduler] = useState(false);
  
  // Enhanced UI state
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [reportTypeFilter, setReportTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);

  // Filter and search functionality
  const filteredReports = useMemo(() => {
    return reports.filter(report => {
      // Search filter
      const matchesSearch = searchTerm === '' || 
        report.file_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.report_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.id.includes(searchTerm);

      // Type filter  
      const matchesType = reportTypeFilter === 'all' || report.report_type === reportTypeFilter;

      // Date range filter
      const matchesDateRange = !dateRange?.from || !dateRange?.to || 
        (new Date(report.report_date) >= dateRange.from && new Date(report.report_date) <= dateRange.to);

      return matchesSearch && matchesType && matchesDateRange;
    });
  }, [reports, searchTerm, reportTypeFilter, dateRange]);

  const hasActiveFilters = searchTerm !== '' || reportTypeFilter !== 'all' || !!dateRange?.from;

  // Selection handlers
  const handleSelectReport = useCallback((reportId: string) => {
    setSelectedReports(prev => 
      prev.includes(reportId) 
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    );
  }, []);

  const handleSelectAll = useCallback((selected: boolean) => {
    setSelectedReports(selected ? filteredReports.map(r => r.id) : []);
  }, [filteredReports]);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setReportTypeFilter('all');
    setDateRange(undefined);
  }, []);

  // Bulk actions
  const handleDownloadSelected = useCallback(async () => {
    const selectedReportObjects = reports.filter(r => selectedReports.includes(r.id) && r.file_url);
    
    if (selectedReportObjects.length === 0) {
      toast({
        title: 'No files to download',
        description: 'Selected reports do not have available files.',
        variant: 'destructive',
      });
      return;
    }

    // Download each report
    for (const report of selectedReportObjects) {
      await downloadReport(report);
    }
    
    setSelectedReports([]);
  }, [selectedReports, reports]);

  useEffect(() => {
    if (profile?.role === 'merchant') {
      fetchData();
    }
  }, [profile]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch merchant data
      const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('id, shop_name')
        .eq('user_id', profile?.id)
        .single();

      if (merchantError) {
        console.error('Error fetching merchant data:', merchantError);
        return;
      }

      setMerchantData(merchant);

      // Fetch reports
      const { data: reportsData, error: reportsError } = await supabase
        .from('reports')
        .select('*')
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false });

      if (reportsError) {
        console.error('Error fetching reports:', reportsError);
        toast({
          title: 'Error',
          description: 'Failed to load reports',
          variant: 'destructive',
        });
        return;
      }

      setReports(reportsData || []);
    } catch (error) {
      console.error('Error in fetchData:', error);
      toast({
        title: 'Error',
        description: 'Failed to load data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = async (report: Report) => {
    if (!report.file_url) {
      toast({
        title: 'Error',
        description: 'Report file not available',
        variant: 'destructive',
      });
      return;
    }

    try {
      console.log('Downloading report from:', report.file_url);
      
      // Fetch the file from the Supabase Storage URL
      const response = await fetch(report.file_url);
      
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      
      // Determine file extension and MIME type
      const isTextFile = report.file_name?.endsWith('.txt');
      const mimeType = isTextFile ? 'text/plain' : 'application/pdf';
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([blob], { type: mimeType }));
      const link = document.createElement('a');
      link.href = url;
      link.download = report.file_name || `report-${report.report_date}.${isTextFile ? 'txt' : 'pdf'}`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: 'Download Complete',
        description: `Report ${report.file_name} downloaded successfully.`,
      });
    } catch (error) {
      console.error('Error downloading report:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to download report',
        variant: 'destructive',
      });
    }
  };

  const regenerateReport = async (report: Report) => {
    if (!merchantData) return;
    
    setRegenerating(report.id);
    
    try {
      console.log('Regenerating report:', report.id);
      
      const { data, error } = await supabase.functions.invoke('generate-pdf-report', {
        body: {
          merchantId: merchantData.id,
          reportDate: report.report_date,
          reportType: report.report_type
        }
      });

      if (error) {
        throw error;
      }

      console.log('Report regenerated successfully:', data);
      
      toast({
        title: 'Success',
        description: 'Report regenerated successfully',
      });
      
      // Refresh the reports list
      await fetchData();
      
    } catch (error) {
      console.error('Error regenerating report:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to regenerate report',
        variant: 'destructive',
      });
    } finally {
      setRegenerating(null);
    }
  };

  const testScheduler = async () => {
    if (!merchantData) return;
    
    setTestingScheduler(true);
    
    try {
      console.log('Testing scheduler for merchant:', merchantData.id);
      
      const { data, error } = await supabase.functions.invoke('auto-report-scheduler', {
        body: {
          merchantId: merchantData.id
        }
      });

      if (error) {
        throw error;
      }

      console.log('Scheduler test completed:', data);
      
      toast({
        title: 'Test Successful',
        description: 'Report generation pipeline tested successfully. Check reports for new PDF.',
      });
      
      // Refresh the reports list after a short delay
      setTimeout(() => fetchData(), 2000);
      
    } catch (error) {
      console.error('Error testing scheduler:', error);
      toast({
        title: 'Test Failed',
        description: error instanceof Error ? error.message : 'Failed to test scheduler',
        variant: 'destructive',
      });
    } finally {
      setTestingScheduler(false);
    }
  };

  const getReportTypeLabel = (type: string) => {
    switch (type) {
      case 'daily_sales':
        return 'Daily Sales';
      case 'commission_summary':
        return 'Commission Summary';
      default:
        return type.replace('_', ' ').toUpperCase();
    }
  };

  const getReportTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'daily_sales':
        return 'default';
      case 'commission_summary':
        return 'secondary';
      default:
        return 'outline';
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
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-card rounded-2xl p-6 shadow-soft border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-primary/10 rounded-lg p-2">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Report Archive</h2>
                <p className="text-muted-foreground">
                  Access your automated PDF reports for {merchantData?.shop_name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex border rounded-lg overflow-hidden">
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className="rounded-none"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-none"
                >
                  <Grid className="h-4 w-4" />
                </Button>
              </div>
              
              <Button
                onClick={testScheduler}
                disabled={testingScheduler}
                variant="outline"
                className="hover:shadow-soft transition-all duration-300"
              >
                {testingScheduler ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <TestTube className="h-4 w-4 mr-2" />
                )}
                Test Scheduler
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <ReportFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          reportTypeFilter={reportTypeFilter}
          onReportTypeChange={setReportTypeFilter}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onClearFilters={clearFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Bulk Actions */}
        <BulkActionToolbar
          selectedCount={selectedReports.length}
          onDownloadSelected={handleDownloadSelected}
          onClearSelection={() => setSelectedReports([])}
        />

        {/* Reports Content */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Available Reports</CardTitle>
                <CardDescription>
                  {filteredReports.length} of {reports.length} reports
                  {hasActiveFilters && ' (filtered)'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {viewMode === 'table' ? (
              <ReportsTable
                reports={filteredReports}
                loading={loading}
                onDownload={downloadReport}
                onRegenerate={regenerateReport}
                onPreview={setPreviewReport}
                regenerating={regenerating}
                selectedReports={selectedReports}
                onSelectReport={handleSelectReport}
                onSelectAll={handleSelectAll}
              />
            ) : (
              // Legacy grid view for backward compatibility
              <div className="space-y-4">
                {filteredReports.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {hasActiveFilters ? 'No reports match your filters' : 'No reports available'}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {hasActiveFilters 
                        ? 'Try adjusting your search terms or filters.' 
                        : 'Reports will appear here once they are automatically generated.'
                      }
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredReports.map((report) => (
                      <div
                        key={report.id}
                        className="flex items-center justify-between p-4 border rounded-lg bg-background/50 hover:bg-background/70 transition-colors"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="bg-primary/10 rounded-lg p-2">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-foreground">
                                {report.file_name || `Report ${report.id.slice(0, 8)}`}
                              </h4>
                              <Badge variant={getReportTypeBadgeVariant(report.report_type)}>
                                {getReportTypeLabel(report.report_type)}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                <span>
                                  Report Date: {format(new Date(report.report_date), 'MM/dd/yyyy')}
                                </span>
                              </div>
                              <span>Generated: {format(new Date(report.created_at), 'MM/dd/yyyy HH:mm')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!report.file_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => regenerateReport(report)}
                              disabled={regenerating === report.id}
                              className="hover:shadow-soft transition-all duration-300"
                            >
                              {regenerating === report.id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                              )}
                              Generate PDF
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadReport(report)}
                            disabled={!report.file_url}
                            className="hover:shadow-soft transition-all duration-300"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Report Status Monitor */}
        {merchantData && (
          <ReportStatusMonitor 
            merchantId={merchantData.id} 
            shopName={merchantData.shop_name} 
          />
        )}

        {/* Report Notifications */}
        {merchantData && (
          <ReportNotificationSystem merchantId={merchantData.id} />
        )}

        {/* Info Card */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Automated Report Generation</CardTitle>
            <CardDescription>
              How the automated reporting system works
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="font-medium text-foreground">📊 Daily Sales Reports</h4>
                <p className="text-sm text-muted-foreground">
                  Automatically generated at the end of each report cycle, containing detailed sales data for each employee.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-foreground">💰 Commission Reports</h4>
                <p className="text-sm text-muted-foreground">
                  Detailed commission calculations based on individual employee rates and sales performance.
                </p>
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                <strong>💡 Tip:</strong> Use the search and filter options above to quickly find specific reports. 
                You can also select multiple reports for bulk download operations.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Modal */}
      <ReportPreviewModal
        report={previewReport}
        isOpen={!!previewReport}
        onClose={() => setPreviewReport(null)}
        onDownload={downloadReport}
      />
    </DashboardLayout>
  );
};

export default Reports;