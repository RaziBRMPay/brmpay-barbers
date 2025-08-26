import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Building2, Settings, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

interface UserStats {
  totalUsers: number;
  totalMerchants: number;
  totalSubAdmins: number;
  activeUsers: number;
}

interface RecentActivity {
  id: string;
  action: string;
  user: string;
  timestamp: string;
}

const AdminDashboard = () => {
  const { profile } = useAuth();
  const [userStats, setUserStats] = useState<UserStats>({
    totalUsers: 0,
    totalMerchants: 0,
    totalSubAdmins: 0,
    activeUsers: 0
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingUpCronJobs, setSettingUpCronJobs] = useState(false);

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchDashboardData();
    }
  }, [profile]);

  const fetchDashboardData = async () => {
    try {
      // Fetch user statistics
      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, role, created_at');

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        toast({
          title: "Error",
          description: "Failed to load dashboard data",
          variant: "destructive",
        });
        return;
      }

      const merchants = allProfiles.filter(p => p.role === 'merchant');
      const subAdmins = allProfiles.filter(p => p.role === 'sub_admin');

      setUserStats({
        totalUsers: allProfiles.length,
        totalMerchants: merchants.length,
        totalSubAdmins: subAdmins.length,
        activeUsers: allProfiles.length // For now, assume all users are active
      });

      // Create mock recent activity data
      const mockActivity: RecentActivity[] = [
        {
          id: '1',
          action: 'New merchant registered',
          user: 'Razi@brmpay.com',
          timestamp: new Date().toISOString()
        },
        {
          id: '2',
          action: 'Commission report generated',
          user: 'shop@example.com',
          timestamp: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: '3',
          action: 'Settings updated',
          user: 'Razi@brmpay.com',
          timestamp: new Date(Date.now() - 7200000).toISOString()
        }
      ];

      setRecentActivity(mockActivity);
    } catch (error) {
      console.error('Error in fetchDashboardData:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const setupAllMerchantCronJobs = async () => {
    setSettingUpCronJobs(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('manage-cron-jobs', {
        body: {
          action: 'setup_all'
        }
      });

      if (error) throw error;

      const results = data?.results || [];
      const successCount = results.filter((r: any) => r.success).length;
      const failureCount = results.filter((r: any) => !r.success).length;

      toast({
        title: 'Cron Jobs Setup Complete',
        description: `${successCount} cron jobs created successfully${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
        variant: failureCount > 0 ? 'destructive' : 'default',
      });

      console.log('Cron job setup results:', results);
    } catch (error) {
      console.error('Error setting up cron jobs:', error);
      toast({
        title: 'Error',
        description: 'Failed to setup cron jobs. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSettingUpCronJobs(false);
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
            Admin Dashboard
          </h2>
          <p className="text-muted-foreground">
            Manage users, merchants, and oversee the entire platform.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {userStats.totalUsers}
              </div>
              <p className="text-xs text-muted-foreground">All platform users</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Merchants</CardTitle>
              <Building2 className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent">
                {userStats.totalMerchants}
              </div>
              <p className="text-xs text-muted-foreground">Active barbershops</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sub Admins</CardTitle>
              <Settings className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">
                {userStats.totalSubAdmins}
              </div>
              <p className="text-xs text-muted-foreground">Platform managers</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Today</CardTitle>
              <TrendingUp className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {userStats.activeUsers}
              </div>
              <p className="text-xs text-muted-foreground">Users online</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions & Recent Activity */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Quick Actions */}
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common administrative tasks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                className="w-full justify-start bg-gradient-primary hover:shadow-glow transition-all duration-300"
                asChild
              >
                <a href="/admin/users">
                  <Users className="mr-2 h-4 w-4" />
                  Manage Users
                </a>
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                asChild
              >
                <a href="/admin/merchants">
                  <Building2 className="mr-2 h-4 w-4" />
                  View Merchants
                </a>
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                asChild
              >
                <a href="/admin/reports">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Platform Reports
                </a>
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={setupAllMerchantCronJobs}
                disabled={settingUpCronJobs}
              >
                <Clock className="mr-2 h-4 w-4" />
                {settingUpCronJobs ? 'Setting up...' : 'Setup All Cron Jobs'}
              </Button>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest platform events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className="bg-primary/10 rounded-full p-1">
                      <AlertTriangle className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {activity.action}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activity.user} • {new Date(activity.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System Status */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>Platform health and integrations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center justify-between p-4 bg-background rounded-lg">
                <div>
                  <p className="text-sm font-medium">Database</p>
                  <p className="text-xs text-muted-foreground">Supabase</p>
                </div>
                <Badge variant="default" className="bg-success text-success-foreground">
                  Online
                </Badge>
              </div>
              <div className="flex items-center justify-between p-4 bg-background rounded-lg">
                <div>
                  <p className="text-sm font-medium">Clover API</p>
                  <p className="text-xs text-muted-foreground">Integration</p>
                </div>
                <Badge variant="secondary">
                  Ready
                </Badge>
              </div>
              <div className="flex items-center justify-between p-4 bg-background rounded-lg">
                <div>
                  <p className="text-sm font-medium">Email Service</p>
                  <p className="text-xs text-muted-foreground">Resend</p>
                </div>
                <Badge variant="secondary">
                  Ready
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminDashboard;