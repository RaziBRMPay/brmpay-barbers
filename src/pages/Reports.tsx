import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { FileText, Download, Calendar, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

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
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-gradient-card rounded-2xl p-6 shadow-soft border">
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
        </div>

        {/* Reports List */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Available Reports</CardTitle>
            <CardDescription>
              Automated reports are generated at the end of each report cycle
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reports.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No reports available</h3>
                <p className="text-muted-foreground mb-4">
                  Reports will appear here once they are automatically generated at the end of each report cycle.
                </p>
                <div className="bg-muted/50 rounded-lg p-4 max-w-md mx-auto">
                  <p className="text-sm text-muted-foreground">
                    <strong>Note:</strong> Report generation is triggered automatically based on your configured report cycle time in Settings.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => (
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
          </CardContent>
        </Card>

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
                <strong>💡 Tip:</strong> Report generation time can be configured in your Settings page. 
                Reports are stored securely and available for download at any time.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Reports;