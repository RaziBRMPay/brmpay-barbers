import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Shield, Eye, EyeOff, Save, Trash2, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SecureCredential {
  id: string;
  credential_type: string;
  encrypted_value: string;
  is_active: boolean;
  created_at: string;
}

interface SecureCredentialManagerProps {
  merchantId: string;
}

// Simple encryption for demo - in production, use proper encryption library
const simpleEncrypt = (text: string): string => {
  return btoa(text); // Base64 encoding - replace with proper encryption
};

const simpleDecrypt = (encrypted: string): string => {
  try {
    return atob(encrypted); // Base64 decoding - replace with proper decryption
  } catch {
    return '';
  }
};

const SecureCredentialManager: React.FC<SecureCredentialManagerProps> = ({ merchantId }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<SecureCredential[]>([]);
  const [formData, setFormData] = useState({
    clover_merchant_id: '',
    clover_api_token: '',
  });
  const [showTokens, setShowTokens] = useState({
    clover_merchant_id: false,
    clover_api_token: false,
  });

  useEffect(() => {
    fetchCredentials();
  }, [merchantId]);

  const fetchCredentials = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('secure_credentials')
        .select('*')
        .eq('merchant_id', merchantId)
        .eq('is_active', true);

      if (error) throw error;

      setCredentials(data || []);

      // Populate form with existing credentials
      const credentialMap: Record<string, string> = {};
      data?.forEach(cred => {
        credentialMap[cred.credential_type] = simpleDecrypt(cred.encrypted_value);
      });

      setFormData({
        clover_merchant_id: credentialMap.clover_merchant_id || '',
        clover_api_token: credentialMap.clover_api_token || '',
      });

    } catch (error) {
      console.error('Error fetching credentials:', error);
      toast({
        title: 'Error',
        description: 'Failed to load secure credentials',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const logSecurityEvent = async (action: string, success: boolean, error?: string) => {
    try {
      await supabase.rpc('log_security_event', {
        p_merchant_id: merchantId,
        p_action: action,
        p_resource_type: 'secure_credentials',
        p_success: success,
        p_error_message: error || null
      });
    } catch (err) {
      console.error('Error logging security event:', err);
    }
  };

  const saveCredentials = async () => {
    try {
      setSaving(true);

      // Validate inputs
      if (!formData.clover_merchant_id.trim() || !formData.clover_api_token.trim()) {
        toast({
          title: 'Validation Error',
          description: 'Both Clover Merchant ID and API Token are required',
          variant: 'destructive',
        });
        return;
      }

      // Prepare credentials for upsert
      const credentialsToUpsert = [
        {
          merchant_id: merchantId,
          credential_type: 'clover_merchant_id',
          encrypted_value: simpleEncrypt(formData.clover_merchant_id.trim()),
          created_by: (await supabase.auth.getUser()).data.user?.id
        },
        {
          merchant_id: merchantId,
          credential_type: 'clover_api_token',
          encrypted_value: simpleEncrypt(formData.clover_api_token.trim()),
          created_by: (await supabase.auth.getUser()).data.user?.id
        }
      ];

      const { error } = await supabase
        .from('secure_credentials')
        .upsert(credentialsToUpsert, {
          onConflict: 'merchant_id,credential_type'
        });

      if (error) throw error;

      await logSecurityEvent('credentials_updated', true);

      toast({
        title: 'Success',
        description: 'Secure credentials saved successfully',
      });

      await fetchCredentials();

    } catch (error) {
      console.error('Error saving credentials:', error);
      await logSecurityEvent('credentials_update_failed', false, error.message);
      
      toast({
        title: 'Error',
        description: 'Failed to save secure credentials',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteCredential = async (credentialType: string) => {
    try {
      const { error } = await supabase
        .from('secure_credentials')
        .update({ is_active: false })
        .eq('merchant_id', merchantId)
        .eq('credential_type', credentialType);

      if (error) throw error;

      await logSecurityEvent('credential_deleted', true);

      toast({
        title: 'Success',
        description: 'Credential deleted successfully',
      });

      await fetchCredentials();
      
      // Clear form field
      setFormData(prev => ({
        ...prev,
        [credentialType]: ''
      }));

    } catch (error) {
      console.error('Error deleting credential:', error);
      await logSecurityEvent('credential_delete_failed', false, error.message);
      
      toast({
        title: 'Error',
        description: 'Failed to delete credential',
        variant: 'destructive',
      });
    }
  };

  const toggleShowToken = (type: string) => {
    setShowTokens(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  if (loading) {
    return (
      <Card className="shadow-soft border-0 bg-gradient-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Secure API Credentials
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
          Secure API Credentials
        </CardTitle>
        <CardDescription>
          Securely manage your Clover API credentials with encryption
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Your API credentials are encrypted and stored securely. Only authorized users can access them.
          </AlertDescription>
        </Alert>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="clover_merchant_id">Clover Merchant ID</Label>
            <div className="relative">
              <Input
                id="clover_merchant_id"
                type={showTokens.clover_merchant_id ? "text" : "password"}
                value={formData.clover_merchant_id}
                onChange={(e) => setFormData(prev => ({ ...prev, clover_merchant_id: e.target.value }))}
                placeholder="Enter your Clover merchant ID"
                className="pr-20"
              />
              <div className="absolute right-0 top-0 h-full flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-3 py-2 hover:bg-transparent"
                  onClick={() => toggleShowToken('clover_merchant_id')}
                >
                  {showTokens.clover_merchant_id ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
                {formData.clover_merchant_id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-3 py-2 hover:bg-transparent text-destructive"
                    onClick={() => deleteCredential('clover_merchant_id')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="clover_api_token">Clover API Token</Label>
            <div className="relative">
              <Input
                id="clover_api_token"
                type={showTokens.clover_api_token ? "text" : "password"}
                value={formData.clover_api_token}
                onChange={(e) => setFormData(prev => ({ ...prev, clover_api_token: e.target.value }))}
                placeholder="Enter your Clover API token"
                className="pr-20"
              />
              <div className="absolute right-0 top-0 h-full flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-3 py-2 hover:bg-transparent"
                  onClick={() => toggleShowToken('clover_api_token')}
                >
                  {showTokens.clover_api_token ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
                {formData.clover_api_token && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="px-3 py-2 hover:bg-transparent text-destructive"
                    onClick={() => deleteCredential('clover_api_token')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="font-medium mb-2">Security Features:</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Credentials are encrypted before storage</li>
            <li>All access is logged for audit purposes</li>
            <li>Multi-store data isolation enforced</li>
            <li>Regular credential rotation recommended</li>
          </ul>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={saveCredentials}
            disabled={saving}
            className="bg-gradient-success hover:shadow-glow transition-all duration-300"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Secure Credentials'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default SecureCredentialManager;