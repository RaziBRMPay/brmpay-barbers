import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, TrendingUp, Users, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

interface AssignedStore {
  id: string;
  shop_name: string;
  timezone: string;
  user_email: string;
  settings?: {
    commission_percentage: number;
    report_time_cycle: string;
  };
}

interface DashboardStats {
  totalStores: number;
  totalSalesThisMonth: number;
  totalCommissionsThisMonth: number;
  activeStores: number;
}

const SubAdminDashboard = () => {
  const { profile } = useAuth();
  const [assignedStores, setAssignedStores] = useState<AssignedStore[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalStores: 0,
    totalSalesThisMonth: 0,
    totalCommissionsThisMonth: 0,
    activeStores: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role === 'sub_admin') {
      fetchAssignedStores();
    }
  }, [profile]);

  const fetchAssignedStores = async () => {
    try {
      // Fetch stores assigned to this sub-admin
      const { data: assignments, error } = await supabase
        .from('sub_admin_stores')
        .select(`
          *,
          merchants (
            id,
            shop_name,
            timezone,
            user_id,
            profiles (
              email
            ),
            settings (
              commission_percentage,
              report_time_cycle
            )
          )
        `)
        .eq('sub_admin_id', profile?.id);

      if (error) {
        console.error('Error fetching assigned stores:', error);
        toast({
          title: "Error",
          description: "Failed to load assigned stores",
          variant: "destructive",
        });
        return;
      }

      const stores: AssignedStore[] = assignments?.map(assignment => ({
        id: assignment.merchants.id,
        shop_name: assignment.merchants.shop_name,
        timezone: assignment.merchants.timezone,
        user_email: assignment.merchants.profiles.email,
        settings: assignment.merchants.settings?.[0] || undefined
      })) || [];

      setAssignedStores(stores);

      // Calculate basic stats
      setStats({
        totalStores: stores.length,
        totalSalesThisMonth: Math.floor(Math.random() * 50000) + 10000, // Mock data
        totalCommissionsThisMonth: Math.floor(Math.random() * 35000) + 7000, // Mock data
        activeStores: stores.length
      });

    } catch (error) {
      console.error('Error in fetchAssignedStores:', error);
      toast({
        title: "Error",
        description: "Failed to load assigned stores",
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
        {/* Welcome Section */}
        <div className="bg-gradient-card rounded-2xl p-6 shadow-soft border">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            Sub Admin Dashboard
          </h2>
          <p className="text-muted-foreground">
            Manage your assigned stores and monitor their performance.
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Assigned Stores</CardTitle>
              <Building2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {stats.totalStores}
              </div>
              <p className="text-xs text-muted-foreground">Active barbershops</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <TrendingUp className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent">
                ${stats.totalSalesThisMonth.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Commissions</CardTitle>
              <Users className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">
                ${stats.totalCommissionsThisMonth.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Stores</CardTitle>
              <AlertCircle className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {stats.activeStores}
              </div>
              <p className="text-xs text-muted-foreground">Online now</p>
            </CardContent>
          </Card>
        </div>

        {/* Assigned Stores */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>My Assigned Stores</CardTitle>
            <CardDescription>
              Barbershops you have been assigned to manage
            </CardDescription>
          </CardHeader>
          <CardContent>
            {assignedStores.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">No stores assigned</p>
                <p className="text-muted-foreground">
                  Contact your administrator to get stores assigned to your account.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {assignedStores.map((store) => (
                  <Card key={store.id} className="bg-background border shadow-soft">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg">{store.shop_name}</CardTitle>
                          <CardDescription>{store.user_email}</CardDescription>
                        </div>
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Timezone</p>
                          <p className="font-medium">{store.timezone.replace('US/', '')}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Commission</p>
                          <p className="font-medium">{store.settings?.commission_percentage || 70}%</p>
                        </div>
                      </div>
                      <div className="pt-2">
                        <Button asChild variant="outline" className="w-full">
                          <Link to={`/sub-admin/store/${store.id}`}>
                            View Reports
                          </Link>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        {assignedStores.length > 0 && (
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks for managing your stores</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Button 
                  className="justify-start bg-gradient-primary hover:shadow-glow transition-all duration-300"
                  asChild
                >
                  <Link to="/sub-admin/stores">
                    <Building2 className="mr-2 h-4 w-4" />
                    View All Stores
                  </Link>
                </Button>
                <Button variant="outline" className="justify-start" asChild>
                  <Link to="/sub-admin/reports">
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Generate Reports
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SubAdminDashboard;