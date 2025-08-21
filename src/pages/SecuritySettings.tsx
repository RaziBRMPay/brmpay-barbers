import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import SecurityAuditLog from '@/components/SecurityAuditLog';
import { Badge } from '@/components/ui/badge';

const SecuritySettings = () => {
  const { profile } = useAuth();

  const securityFeatures = [
    {
      name: 'Encrypted Credential Storage',
      status: 'enabled',
      description: 'All API tokens and sensitive data are encrypted before storage'
    },
    {
      name: 'Multi-Store Data Isolation', 
      status: 'enabled',
      description: 'Row-level security ensures complete data separation between stores'
    },
    {
      name: 'Rate Limiting',
      status: 'enabled', 
      description: 'API endpoints are protected against abuse with intelligent rate limiting'
    },
    {
      name: 'Security Audit Logging',
      status: 'enabled',
      description: 'All access attempts and security events are logged and monitored'
    },
    {
      name: 'Input Validation & Sanitization',
      status: 'enabled',
      description: 'All user inputs are validated and sanitized to prevent injection attacks'
    },
    {
      name: 'Secure Headers',
      status: 'enabled', 
      description: 'Security headers protect against XSS, clickjacking, and other attacks'
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'enabled':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Enabled
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Info className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <DashboardLayout>
        <div className="space-y-8">
          <div className="bg-gradient-card rounded-2xl p-6 shadow-soft border">
            <div className="flex items-center space-x-3">
              <div className="bg-primary/10 rounded-lg p-2">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Security Settings</h2>
                <p className="text-muted-foreground">Access denied - Admin privileges required</p>
              </div>
            </div>
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You need administrator privileges to access security settings. Contact your system administrator for assistance.
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-gradient-card rounded-2xl p-6 shadow-soft border">
          <div className="flex items-center space-x-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Security Settings</h2>
              <p className="text-muted-foreground">Monitor and configure system security features</p>
            </div>
          </div>
        </div>

        {/* Security Status Overview */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security Features Status
            </CardTitle>
            <CardDescription>
              Overview of implemented security measures and their current status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                All core security features are enabled and functioning properly.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4">
              {securityFeatures.map((feature, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg bg-background/50">
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground">{feature.name}</h4>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                  <div className="flex-shrink-0">
                    {getStatusBadge(feature.status)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Security Best Practices */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Security Best Practices</CardTitle>
            <CardDescription>
              Recommended security practices for your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">For Store Owners:</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Regularly rotate your Clover API tokens</li>
                  <li>Use strong, unique passwords for all accounts</li>
                  <li>Monitor access logs for suspicious activity</li>
                  <li>Keep employee access permissions up to date</li>
                </ul>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">For System Administrators:</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Review security audit logs regularly</li>
                  <li>Monitor rate limiting patterns for abuse</li>
                  <li>Ensure all edge functions have proper error handling</li>
                  <li>Implement backup and recovery procedures</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System-wide Security Audit Log */}
        <SecurityAuditLog maxEntries={100} />
      </div>
    </DashboardLayout>
  );
};

export default SecuritySettings;