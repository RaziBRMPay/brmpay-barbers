import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, Search, Eye, BarChart3, Users, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Link } from 'react-router-dom';

interface AssignedStore {
  id: string;
  shop_name: string;
  timezone: string;
  user_email: string;
  user_name: string;
  created_at: string;
  last_report_date?: string;
  total_reports: number;
}

const SubAdminStores = () => {
  const { profile } = useAuth();
  const [stores, setStores] = useState<AssignedStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (profile?.id) {
      fetchAssignedStores();
    }
  }, [profile]);

  const fetchAssignedStores = async () => {
    try {
      const { data, error } = await supabase
        .from('sub_admin_stores')
        .select(`
          merchants!sub_admin_stores_merchant_id_fkey (
            id,
            shop_name,
            timezone,
            created_at,
            profiles!merchants_user_id_fkey (
              email,
              first_name,
              last_name
            )
          )
        `)
        .eq('sub_admin_id', profile?.id);

      if (error) throw error;

      // Get report counts for each merchant
      const merchantIds = data.map(item => item.merchants.id);
      
      const { data: reportsData } = await supabase
        .from('reports')
        .select('merchant_id, report_date')
        .in('merchant_id', merchantIds)
        .order('report_date', { ascending: false });

      const reportCounts = reportsData?.reduce((acc, report) => {
        if (!acc[report.merchant_id]) {
          acc[report.merchant_id] = { count: 0, lastDate: null };
        }
        acc[report.merchant_id].count++;
        if (!acc[report.merchant_id].lastDate) {
          acc[report.merchant_id].lastDate = report.report_date;
        }
        return acc;
      }, {} as Record<string, { count: number; lastDate: string | null }>) || {};

      const formattedStores: AssignedStore[] = data.map(item => ({
        id: item.merchants.id,
        shop_name: item.merchants.shop_name,
        timezone: item.merchants.timezone,
        user_email: item.merchants.profiles?.email || '',
        user_name: `${item.merchants.profiles?.first_name || ''} ${item.merchants.profiles?.last_name || ''}`.trim() || 'N/A',
        created_at: item.merchants.created_at,
        last_report_date: reportCounts[item.merchants.id]?.lastDate,
        total_reports: reportCounts[item.merchants.id]?.count || 0
      }));

      setStores(formattedStores);
    } catch (error) {
      console.error('Error fetching assigned stores:', error);
      toast({
        title: "Error",
        description: "Failed to load assigned stores",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredStores = stores.filter(store => 
    store.shop_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.user_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                My Assigned Stores
              </h2>
              <p className="text-muted-foreground">
                Manage and monitor the barbershops assigned to you
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
              <Building2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {stores.length}
              </div>
              <p className="text-xs text-muted-foreground">Assigned to you</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
              <BarChart3 className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent">
                {stores.reduce((sum, store) => sum + store.total_reports, 0)}
              </div>
              <p className="text-xs text-muted-foreground">Across all stores</p>
            </CardContent>
          </Card>

          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Stores</CardTitle>
              <Users className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {stores.filter(store => store.total_reports > 0).length}
              </div>
              <p className="text-xs text-muted-foreground">With reports</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Search Stores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by shop name, owner, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Stores Table */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Assigned Stores ({filteredStores.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredStores.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {stores.length === 0 ? 'No stores assigned to you' : 'No stores match your search'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shop Name</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Timezone</TableHead>
                      <TableHead>Reports</TableHead>
                      <TableHead>Last Report</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStores.map((store) => (
                      <TableRow key={store.id}>
                        <TableCell className="font-medium">
                          {store.shop_name}
                        </TableCell>
                        <TableCell>{store.user_name}</TableCell>
                        <TableCell>{store.user_email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {store.timezone}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {store.total_reports} reports
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {store.last_report_date ? (
                            new Date(store.last_report_date).toLocaleDateString()
                          ) : (
                            <span className="text-muted-foreground">No reports</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={store.total_reports > 0 ? "default" : "secondary"}
                            className={store.total_reports > 0 ? "bg-success text-success-foreground" : ""}
                          >
                            {store.total_reports > 0 ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline" asChild>
                              <Link to={`/sub-admin/reports?merchant=${store.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button size="sm" variant="outline">
                              <BarChart3 className="h-4 w-4" />
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

        {/* Quick Actions */}
        {stores.length > 0 && (
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <Button className="w-full justify-start bg-gradient-primary hover:shadow-glow transition-all duration-300" asChild>
                  <Link to="/sub-admin/reports">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    View All Reports
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Building2 className="mr-2 h-4 w-4" />
                  Export Store Data
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SubAdminStores;