import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Shield, AlertCircle, CheckCircle, Clock, User } from 'lucide-react';
import { format } from 'date-fns';

interface AuditLogEntry {
  id: string;
  merchant_id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  success: boolean;
  error_message?: string;
  created_at: string;
}

interface SecurityAuditLogProps {
  merchantId?: string;
  maxEntries?: number;
}

const SecurityAuditLog: React.FC<SecurityAuditLogProps> = ({ merchantId, maxEntries = 50 }) => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    fetchAuditLogs();
  }, [merchantId, profile]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('security_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(maxEntries);

      // If merchantId is provided and user is not admin, filter by merchant
      if (merchantId && profile?.role !== 'admin') {
        query = query.eq('merchant_id', merchantId);
      }

      const { data, error } = await query;

      if (error) throw error;

      setAuditLogs(data || []);

    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to load security audit logs',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string, success: boolean) => {
    const variant = success ? 'default' : 'destructive';
    const icon = success ? <CheckCircle className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />;
    
    return (
      <Badge variant={variant} className="flex items-center">
        {icon}
        {action.replace(/_/g, ' ').toLowerCase()}
      </Badge>
    );
  };

  const getResourceIcon = (resourceType: string) => {
    switch (resourceType) {
      case 'secure_credentials':
        return <Shield className="h-4 w-4" />;
      case 'employee_data':
        return <User className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <Card className="shadow-soft border-0 bg-gradient-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security Audit Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-soft border-0 bg-gradient-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Security Audit Log
        </CardTitle>
        <CardDescription>
          Recent security events and access attempts
        </CardDescription>
      </CardHeader>
      <CardContent>
        {auditLogs.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No security events recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {auditLogs.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between p-4 border rounded-lg bg-background/50 hover:bg-background/70 transition-colors"
              >
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    {getResourceIcon(entry.resource_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      {getActionBadge(entry.action, entry.success)}
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(entry.created_at), 'MMM dd, HH:mm:ss')}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {entry.resource_type.replace(/_/g, ' ')} action performed
                    </p>
                    {entry.error_message && (
                      <p className="text-sm text-destructive mt-1">
                        Error: {entry.error_message}
                      </p>
                    )}
                    {entry.resource_id && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Resource ID: {entry.resource_id}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">
                    User: {entry.user_id.slice(0, 8)}...
                  </p>
                  {entry.merchant_id && profile?.role === 'admin' && (
                    <p className="text-xs text-muted-foreground">
                      Store: {entry.merchant_id.slice(0, 8)}...
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SecurityAuditLog;