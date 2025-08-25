import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Clock, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface ReportStatusMonitorProps {
  merchantId: string;
  shopName: string;
}

interface CronStatus {
  jobName: string;
  cronExpression: string;
  isConfigured: boolean;
  nextRunTime?: string;
  lastCompletedRun?: string;
  reportTime: string;
  timezone: string;
  shopName: string;
  error?: string;
}

const ReportStatusMonitor: React.FC<ReportStatusMonitorProps> = ({ merchantId, shopName }) => {
  const { toast } = useToast();
  const [cronStatus, setCronStatus] = useState<CronStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCronStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-cron-jobs', {
        body: { 
          action: 'status',
          merchantId: merchantId
        }
      });
      
      if (error) throw error;
      
      if (data?.status) {
        setCronStatus(data.status);
      }
    } catch (error) {
      console.error('Error fetching cron status:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch scheduler status',
        variant: 'destructive',
      });
    }
  };

  const refreshStatus = async () => {
    setRefreshing(true);
    await fetchCronStatus();
    setRefreshing(false);
  };

  useEffect(() => {
    const loadStatus = async () => {
      setLoading(true);
      await fetchCronStatus();
      setLoading(false);
    };
    
    loadStatus();
  }, [merchantId]);

  if (loading) {
    return (
      <Card className="shadow-soft border-0 bg-gradient-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-soft border-0 bg-gradient-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Report Scheduler Status
            </CardTitle>
            <CardDescription>
              Current automated reporting configuration for {shopName}
            </CardDescription>
          </div>
          <Button
            onClick={refreshStatus}
            disabled={refreshing}
            size="sm"
            variant="outline"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {cronStatus?.isConfigured ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="font-medium">Scheduler Active</span>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    Running
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Job: {cronStatus.jobName}
                </p>
                <p className="text-sm text-muted-foreground">
                  Cron: {cronStatus.cronExpression}
                </p>
              </div>
              
              <div className="space-y-2">
                <div className="font-medium">Schedule Details</div>
                <p className="text-sm text-muted-foreground">
                  Report Time: {cronStatus.reportTime.slice(0, 5)} ({cronStatus.timezone})
                </p>
                <p className="text-sm text-muted-foreground">
                  Timezone: {cronStatus.timezone}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {cronStatus.nextRunTime && (
                <div className="p-3 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Next Report</span>
                  </div>
                  <p className="text-sm text-foreground">
                    {format(new Date(cronStatus.nextRunTime), 'EEEE, MMM dd, yyyy \'at\' h:mm a')}
                  </p>
                </div>
              )}

              {cronStatus.lastCompletedRun && (
                <div className="p-3 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="font-medium text-sm">Last Completed</span>
                  </div>
                  <p className="text-sm text-foreground">
                    {format(new Date(cronStatus.lastCompletedRun), 'MMM dd, yyyy \'at\' h:mm a')}
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Scheduler Not Configured</h3>
            <p className="text-muted-foreground mb-4">
              Automatic report generation is not currently set up for this merchant.
            </p>
            {cronStatus?.error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 max-w-md mx-auto">
                <p className="text-sm text-destructive">
                  Error: {cronStatus.error}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportStatusMonitor;