import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, Search, Filter, Eye, Edit, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

interface Merchant {
  id: string;
  shop_name: string;
  timezone: string;
  created_at: string;
  user_email: string;
  user_name: string;
}

const AdminMerchants = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [timezoneFilter, setTimezoneFilter] = useState('all');

  useEffect(() => {
    fetchMerchants();
  }, []);

  const fetchMerchants = async () => {
    try {
      const { data, error } = await supabase
        .from('merchants')
        .select(`
          id,
          shop_name,
          timezone,
          created_at,
          profiles!merchants_user_id_fkey (
            email,
            first_name,
            last_name
          )
        `);

      if (error) throw error;

      const formattedMerchants = data.map(merchant => ({
        id: merchant.id,
        shop_name: merchant.shop_name,
        timezone: merchant.timezone,
        created_at: merchant.created_at,
        user_email: merchant.profiles?.email || '',
        user_name: `${merchant.profiles?.first_name || ''} ${merchant.profiles?.last_name || ''}`.trim() || 'N/A'
      }));

      setMerchants(formattedMerchants);
    } catch (error) {
      console.error('Error fetching merchants:', error);
      toast({
        title: "Error",
        description: "Failed to load merchants",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredMerchants = merchants.filter(merchant => {
    const matchesSearch = merchant.shop_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         merchant.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         merchant.user_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTimezone = timezoneFilter === 'all' || merchant.timezone === timezoneFilter;
    
    return matchesSearch && matchesTimezone;
  });

  const uniqueTimezones = [...new Set(merchants.map(m => m.timezone))];

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
                Merchant Management
              </h2>
              <p className="text-muted-foreground">
                View and manage all barbershop merchants on the platform
              </p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Filter Merchants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search merchants..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={timezoneFilter} onValueChange={setTimezoneFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Timezones</SelectItem>
                  {uniqueTimezones.map(timezone => (
                    <SelectItem key={timezone} value={timezone}>
                      {timezone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => {
                setSearchTerm('');
                setTimezoneFilter('all');
              }}>
                <Filter className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Merchants Table */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Merchants ({filteredMerchants.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredMerchants.length === 0 ? (
              <div className="text-center py-8">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No merchants found</p>
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
                      <TableHead>Joined</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMerchants.map((merchant) => (
                      <TableRow key={merchant.id}>
                        <TableCell className="font-medium">
                          {merchant.shop_name}
                        </TableCell>
                        <TableCell>{merchant.user_name}</TableCell>
                        <TableCell>{merchant.user_email}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {merchant.timezone}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(merchant.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="default" className="bg-success text-success-foreground">
                            Active
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
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

export default AdminMerchants;