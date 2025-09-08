import React from 'react';
import { format } from 'date-fns';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  FileText, 
  Download, 
  Calendar, 
  Users, 
  DollarSign,
  TrendingUp,
  Clock
} from 'lucide-react';

interface Report {
  id: string;
  report_date: string;
  report_type: string;
  file_name: string | null;
  file_url: string | null;
  created_at: string;
  report_data: any;
}

interface ReportPreviewModalProps {
  report: Report | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (report: Report) => void;
}

export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  report,
  isOpen,
  onClose,
  onDownload
}) => {
  if (!report) return null;

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

  // Extract summary data from report_data
  const getSummaryData = () => {
    if (!report.report_data) return null;

    const data = report.report_data;
    return {
      totalSales: data.totalSales || 0,
      totalCommission: data.totalCommission || 0,
      employeeCount: data.employeeData?.length || 0,
      topEmployee: data.employeeData?.reduce((top: any, emp: any) => 
        emp.totalSales > (top?.totalSales || 0) ? emp : top, null
      )
    };
  };

  const summaryData = getSummaryData();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="flex items-center gap-2">
                {report.file_name || `Report ${report.id.slice(0, 8)}`}
                <Badge variant={getReportTypeBadgeVariant(report.report_type)}>
                  {getReportTypeLabel(report.report_type)}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                Generated on {format(new Date(report.created_at), 'MMM dd, yyyy \'at\' h:mm a')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Report Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Report Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Report Date:</span>
                  <p className="font-medium">{format(new Date(report.report_date), 'MMMM dd, yyyy')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Generated:</span>
                  <p className="font-medium">{format(new Date(report.created_at), 'MMM dd, yyyy HH:mm')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">File Status:</span>
                  <p className={`font-medium ${report.file_url ? 'text-green-600' : 'text-yellow-600'}`}>
                    {report.file_url ? 'Available' : 'Processing'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">File Size:</span>
                  <p className="font-medium">
                    {report.file_url ? 'PDF Ready' : 'Generating...'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Statistics */}
          {summaryData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Summary Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted/30 rounded-lg">
                    <DollarSign className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-foreground">
                      ${summaryData.totalSales.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">Total Sales</p>
                  </div>
                  <div className="text-center p-4 bg-muted/30 rounded-lg">
                    <TrendingUp className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-foreground">
                      ${summaryData.totalCommission.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">Total Commission</p>
                  </div>
                  <div className="text-center p-4 bg-muted/30 rounded-lg">
                    <Users className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-foreground">
                      {summaryData.employeeCount}
                    </p>
                    <p className="text-sm text-muted-foreground">Employees</p>
                  </div>
                  {summaryData.topEmployee && (
                    <div className="text-center p-4 bg-muted/30 rounded-lg">
                      <TrendingUp className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                      <p className="text-lg font-bold text-foreground truncate">
                        {summaryData.topEmployee.employeeName}
                      </p>
                      <p className="text-sm text-muted-foreground">Top Performer</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button 
              onClick={() => onDownload(report)}
              disabled={!report.file_url}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};