import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { UserPlus, Edit2, Trash2, Search, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

interface User {
  id: string;
  email: string;
  role: 'admin' | 'sub_admin' | 'merchant';
  first_name?: string;
  last_name?: string;
  created_at: string;
  merchant?: {
    shop_name: string;
    timezone: string;
  };
}

const AdminUsers = () => {
  const { profile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    role: 'merchant' as 'admin' | 'sub_admin' | 'merchant',
    first_name: '',
    last_name: '',
    shop_name: '',
    timezone: 'US/Eastern'
  });

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchUsers();
    }
  }, [profile]);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, roleFilter]);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select(`
          *,
          merchants!merchants_user_id_fkey (
            shop_name,
            timezone
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching users:', error);
        toast({
          title: "Error",
          description: "Failed to load users",
          variant: "destructive",
        });
        return;
      }

      setUsers(profiles || []);
    } catch (error) {
      console.error('Error in fetchUsers:', error);
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.merchant?.shop_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (roleFilter !== 'all') {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    setFilteredUsers(filtered);
  };

  const createUser = async () => {
    try {
      setLoading(true);

      // Create user in auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newUser.email,
        password: newUser.password,
        email_confirm: true
      });

      if (authError) {
        console.error('Error creating user:', authError);
        toast({
          title: "Error",
          description: "Failed to create user account",
          variant: "destructive",
        });
        return;
      }

      // Update profile with additional info
      if (authData.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            role: newUser.role,
            first_name: newUser.first_name || null,
            last_name: newUser.last_name || null
          })
          .eq('id', authData.user.id);

        if (profileError) {
          console.error('Error updating profile:', profileError);
          toast({
            title: "Warning",
            description: "User created but profile update failed",
            variant: "destructive",
          });
        }

        // If merchant, create merchant record
        if (newUser.role === 'merchant' && newUser.shop_name) {
          const { error: merchantError } = await supabase
            .from('merchants')
            .insert({
              user_id: authData.user.id,
              shop_name: newUser.shop_name,
              timezone: newUser.timezone as any
            });

          if (merchantError) {
            console.error('Error creating merchant:', merchantError);
            toast({
              title: "Warning",
              description: "User created but merchant setup failed",
              variant: "destructive",
            });
          }
        }
      }

      toast({
        title: "Success",
        description: "User created successfully",
      });

      setCreateUserOpen(false);
      setNewUser({
        email: '',
        password: '',
        role: 'merchant',
        first_name: '',
        last_name: '',
        shop_name: '',
        timezone: 'US/Eastern'
      });
      
      await fetchUsers();
    } catch (error) {
      console.error('Error in createUser:', error);
      toast({
        title: "Error",
        description: "Failed to create user",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'default';
      case 'sub_admin': return 'secondary';
      case 'merchant': return 'outline';
      default: return 'outline';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Admin';
      case 'sub_admin': return 'Sub Admin';
      case 'merchant': return 'Merchant';
      default: return role;
    }
  };

  if (loading && users.length === 0) {
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
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-foreground">User Management</h2>
            <p className="text-muted-foreground">Manage all platform users and their permissions</p>
          </div>
          <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary hover:shadow-glow transition-all duration-300">
                <UserPlus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Add a new user to the platform with appropriate role and permissions.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="first_name">First Name</Label>
                    <Input
                      id="first_name"
                      value={newUser.first_name}
                      onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      value={newUser.last_name}
                      onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Minimum 6 characters"
                  />
                </div>
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select value={newUser.role} onValueChange={(value: any) => setNewUser({ ...newUser, role: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="merchant">Merchant</SelectItem>
                      <SelectItem value="sub_admin">Sub Admin</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newUser.role === 'merchant' && (
                  <>
                    <div>
                      <Label htmlFor="shop_name">Shop Name</Label>
                      <Input
                        id="shop_name"
                        value={newUser.shop_name}
                        onChange={(e) => setNewUser({ ...newUser, shop_name: e.target.value })}
                        placeholder="Best Barber Shop"
                      />
                    </div>
                    <div>
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select value={newUser.timezone} onValueChange={(value) => setNewUser({ ...newUser, timezone: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="US/Eastern">Eastern</SelectItem>
                          <SelectItem value="US/Central">Central</SelectItem>
                          <SelectItem value="US/Mountain">Mountain</SelectItem>
                          <SelectItem value="US/Pacific">Pacific</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <Button 
                  onClick={createUser} 
                  className="w-full bg-gradient-primary hover:shadow-glow transition-all duration-300"
                  disabled={loading || !newUser.email || !newUser.password}
                >
                  Create User
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                  <SelectItem value="sub_admin">Sub Admins</SelectItem>
                  <SelectItem value="merchant">Merchants</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Users ({filteredUsers.length})</CardTitle>
            <CardDescription>All platform users and their details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-white rounded-lg shadow-soft overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">User</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Role</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Shop/Details</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.email}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {getRoleLabel(user.role)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {user.merchant ? (
                          <div className="flex items-center space-x-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">{user.merchant.shop_name}</p>
                              <p className="text-xs text-muted-foreground">{user.merchant.timezone.replace('US/', '')}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end space-x-2">
                          <Button variant="ghost" size="sm">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No users found matching your criteria.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default AdminUsers;