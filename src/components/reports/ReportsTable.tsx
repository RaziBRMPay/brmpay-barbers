import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Download, 
  FileText, 
  RefreshCw, 
  Loader2, 
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
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

interface ReportsTableProps {
  reports: Report[];
  loading: boolean;
  onDownload: (report: Report) => void;
  onRegenerate: (report: Report) => void;
  onPreview: (report: Report) => void;
  regenerating: string | null;
  selectedReports: string[];
  onSelectReport: (reportId: string) => void;
  onSelectAll: (selected: boolean) => void;
}

type SortField = 'report_date' | 'created_at' | 'report_type' | 'file_name';
type SortDirection = 'asc' | 'desc';

export const ReportsTable: React.FC<ReportsTableProps> = ({
  reports,
  loading,
  onDownload,
  onRegenerate,
  onPreview,
  regenerating,
  selectedReports,
  onSelectReport,
  onSelectAll
}) => {
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];

      // Convert dates to timestamps for proper sorting
      if (sortField === 'report_date' || sortField === 'created_at') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      // Handle null values
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [reports, sortField, sortDirection]);

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4" />;
    return sortDirection === 'asc' ? 
      <ArrowUp className="h-4 w-4" /> : 
      <ArrowDown className="h-4 w-4" />;
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

  const allSelected = reports.length > 0 && selectedReports.length === reports.length;
  const partiallySelected = selectedReports.length > 0 && selectedReports.length < reports.length;

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-background/50">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected || partiallySelected}
                  onCheckedChange={onSelectAll}
                />
              </TableHead>
              <TableHead className="w-12"></TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('file_name')}
              >
                <div className="flex items-center gap-2">
                  Report Name
                  {getSortIcon('file_name')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('report_type')}
              >
                <div className="flex items-center gap-2">
                  Type
                  {getSortIcon('report_type')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('report_date')}
              >
                <div className="flex items-center gap-2">
                  Report Date
                  {getSortIcon('report_date')}
                </div>
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('created_at')}
              >
                <div className="flex items-center gap-2">
                  Generated
                  {getSortIcon('created_at')}
                </div>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              // Loading skeleton rows
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-4 w-4 bg-muted animate-pulse rounded" /></TableCell>
                  <TableCell><div className="h-8 w-8 bg-muted animate-pulse rounded-lg" /></TableCell>
                  <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                  <TableCell><div className="h-6 w-20 bg-muted animate-pulse rounded-full" /></TableCell>
                  <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                  <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded" /></TableCell>
                  <TableCell><div className="h-8 w-24 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : sortedReports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No reports found</h3>
                  <p className="text-muted-foreground">
                    Reports will appear here once they are generated.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              sortedReports.map((report) => (
                <TableRow key={report.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Checkbox
                      checked={selectedReports.includes(report.id)}
                      onCheckedChange={() => onSelectReport(report.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="bg-primary/10 rounded-lg p-2 w-8 h-8 flex items-center justify-center">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {report.file_name || `Report ${report.id.slice(0, 8)}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getReportTypeBadgeVariant(report.report_type)}>
                      {getReportTypeLabel(report.report_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {format(new Date(report.report_date), 'MMM dd, yyyy')}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(report.created_at), 'MMM dd, HH:mm')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onPreview(report)}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {!report.file_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRegenerate(report)}
                          disabled={regenerating === report.id}
                          className="h-8 w-8 p-0"
                        >
                          {regenerating === report.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDownload(report)}
                        disabled={!report.file_url}
                        className="h-8 w-8 p-0"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};