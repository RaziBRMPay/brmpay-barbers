import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Bell, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface ReportNotificationSystemProps {
  merchantId: string;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  timestamp: string;
  reportId?: string;
  read: boolean;
}

const ReportNotificationSystem: React.FC<ReportNotificationSystemProps> = ({ merchantId }) => {
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    // Listen for new reports being created
    const channel = supabase
      .channel('reports-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reports',
          filter: `merchant_id=eq.${merchantId}`
        },
        (payload) => {
          console.log('New report created:', payload);
          
          const newReport = payload.new;
          
          // Show toast notification
          toast({
            title: 'Report Generated',
            description: `New ${newReport.report_type.replace('_', ' ')} report is ready for download`,
          });

          // Add to notifications list
          const notification: Notification = {
            id: `report-${newReport.id}`,
            type: 'success',
            message: `New ${newReport.report_type.replace('_', ' ')} report generated for ${format(new Date(newReport.report_date), 'MM/dd/yyyy')}`,
            timestamp: newReport.created_at,
            reportId: newReport.id,
            read: false
          };

          setNotifications(prev => [notification, ...prev.slice(0, 9)]); // Keep last 10
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reports',
          filter: `merchant_id=eq.${merchantId}`
        },
        (payload) => {
          console.log('Report updated:', payload);
          
          const updatedReport = payload.new;
          
          // Only notify if file_url was added (report was processed)
          if (updatedReport.file_url && !payload.old.file_url) {
            toast({
              title: 'Report Ready',
              description: `PDF report for ${format(new Date(updatedReport.report_date), 'MM/dd/yyyy')} is now available`,
            });

            const notification: Notification = {
              id: `report-update-${updatedReport.id}`,
              type: 'info',
              message: `PDF report for ${format(new Date(updatedReport.report_date), 'MM/dd/yyyy')} is ready for download`,
              timestamp: new Date().toISOString(),
              reportId: updatedReport.id,
              read: false
            };

            setNotifications(prev => [notification, ...prev.slice(0, 9)]);
          }
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        setIsListening(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchantId, toast]);

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      )
    );
  };

  const clearAllNotifications = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (notifications.length === 0) {
    return (
      <Card className="shadow-soft border-0 bg-gradient-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Report Notifications</CardTitle>
            {isListening && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Live
              </Badge>
            )}
          </div>
          <CardDescription>
            Live notifications for report generation and updates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No recent notifications. You'll be notified when reports are generated.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-soft border-0 bg-gradient-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <CardTitle>Report Notifications</CardTitle>
            {unreadCount > 0 && (
              <Badge variant="default" className="bg-primary">
                {unreadCount}
              </Badge>
            )}
            {isListening && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Live
              </Badge>
            )}
          </div>
          <Button
            onClick={clearAllNotifications}
            size="sm"
            variant="ghost"
          >
            Clear All
          </Button>
        </div>
        <CardDescription>
          Live notifications for report generation and updates
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                notification.read 
                  ? 'bg-muted/30 border-muted' 
                  : 'bg-background border-primary/20'
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {notification.type === 'success' && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                {notification.type === 'error' && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                {notification.type === 'info' && (
                  <Bell className="h-4 w-4 text-blue-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${notification.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {notification.message}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(notification.timestamp), 'MMM dd, yyyy \'at\' h:mm a')}
                </p>
              </div>
              {!notification.read && (
                <Button
                  onClick={() => markAsRead(notification.id)}
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                >
                  Mark Read
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ReportNotificationSystem;