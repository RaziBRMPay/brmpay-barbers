import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Settings as SettingsIcon, Save, Eye, EyeOff } from 'lucide-react';
import CommissionConfiguration from '@/components/CommissionConfiguration';

type USTimezone = 'US/Eastern' | 'US/Central' | 'US/Mountain' | 'US/Pacific' | 'US/Alaska' | 'US/Hawaii';

interface MerchantData {
  id: string;
  shop_name: string;
  timezone: USTimezone;
  clover_merchant_id?: string;
  clover_api_token?: string;
}

interface SettingsData {
  id: string;
  commission_percentage: number;
  report_time_cycle: string;
}

const US_TIMEZONES = [
  { value: 'US/Eastern', label: 'Eastern Time' },
  { value: 'US/Central', label: 'Central Time' },
  { value: 'US/Mountain', label: 'Mountain Time' },
  { value: 'US/Pacific', label: 'Pacific Time' },
  { value: 'US/Alaska', label: 'Alaska Time' },
  { value: 'US/Hawaii', label: 'Hawaii Time' },
];

const Settings = () => {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [merchantData, setMerchantData] = useState<MerchantData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [formData, setFormData] = useState({
    shop_name: '',
    timezone: 'US/Eastern' as USTimezone,
    commission_percentage: 70,
    report_time_cycle: '21:00',
    clover_merchant_id: '',
    clover_api_token: '',
  });
  const [showApiToken, setShowApiToken] = useState(false);
  const [cloverShopName, setCloverShopName] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, [profile]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch merchant data
      const { data: merchant, error: merchantError } = await supabase
        .from('merchants')
        .select('*')
        .eq('user_id', profile?.id)
        .single();

      if (merchantError && merchantError.code !== 'PGRST116') {
        console.error('Error fetching merchant data:', merchantError);
        return;
      }

      if (merchant) {
        setMerchantData(merchant);
        setFormData(prev => ({
          ...prev,
          shop_name: merchant.shop_name || '',
          timezone: (merchant.timezone as USTimezone) || 'US/Eastern',
          clover_merchant_id: merchant.clover_merchant_id || '',
          clover_api_token: merchant.clover_api_token || '',
        }));

        // Fetch shop name from Clover if credentials exist
        if (merchant.clover_merchant_id && merchant.clover_api_token) {
          await fetchCloverShopName(merchant.clover_merchant_id, merchant.clover_api_token);
        }

        // Fetch settings
        const { data: settingsData, error: settingsError } = await supabase
          .from('settings')
          .select('*')
          .eq('merchant_id', merchant.id)
          .single();

        if (settingsError && settingsError.code !== 'PGRST116') {
          console.error('Error fetching settings:', settingsError);
        } else if (settingsData) {
          setSettings(settingsData);
          setFormData(prev => ({
            ...prev,
            commission_percentage: settingsData.commission_percentage,
            report_time_cycle: settingsData.report_time_cycle.slice(0, 5), // Remove seconds
          }));
        }
      }
    } catch (error) {
      console.error('Error in fetchData:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCloverShopName = async (merchantId: string, apiToken: string) => {
    try {
      // In a real implementation, you would call the Clover API
      // For now, we'll simulate fetching the shop name
      const mockShopName = "Clover Shop Name"; // This would come from Clover API
      setCloverShopName(mockShopName);
    } catch (error) {
      console.error('Error fetching Clover shop name:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Save or create merchant data
      if (merchantData) {
        const { error: merchantError } = await supabase
          .from('merchants')
          .update({
            shop_name: formData.shop_name,
            timezone: formData.timezone,
            clover_merchant_id: formData.clover_merchant_id,
            clover_api_token: formData.clover_api_token,
          })
          .eq('id', merchantData.id);

        if (merchantError) throw merchantError;
      } else {
        const { data: newMerchant, error: merchantError } = await supabase
          .from('merchants')
          .insert({
            user_id: profile?.id,
            shop_name: formData.shop_name,
            timezone: formData.timezone,
            clover_merchant_id: formData.clover_merchant_id,
            clover_api_token: formData.clover_api_token,
          })
          .select()
          .single();

        if (merchantError) throw merchantError;
        setMerchantData(newMerchant);
      }

      // Save or create settings data
      const merchantId = merchantData?.id || (await supabase
        .from('merchants')
        .select('id')
        .eq('user_id', profile?.id)
        .single()).data?.id;

      if (settings) {
        const { error: settingsError } = await supabase
          .from('settings')
          .update({
            commission_percentage: formData.commission_percentage,
            report_time_cycle: formData.report_time_cycle + ':00',
          })
          .eq('id', settings.id);

        if (settingsError) throw settingsError;
      } else {
        const { error: settingsError } = await supabase
          .from('settings')
          .insert({
            merchant_id: merchantId,
            commission_percentage: formData.commission_percentage,
            report_time_cycle: formData.report_time_cycle + ':00',
          });

        if (settingsError) throw settingsError;
      }

      toast({
        title: 'Settings saved',
        description: 'Your settings have been updated successfully.',
      });

      // Refresh data
      await fetchData();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
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
        {/* Header */}
        <div className="bg-gradient-card rounded-2xl p-6 shadow-soft border">
          <div className="flex items-center space-x-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <SettingsIcon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Settings</h2>
              <p className="text-muted-foreground">Configure your shop and commission settings</p>
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Shop Configuration */}
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader>
              <CardTitle>Shop Configuration</CardTitle>
              <CardDescription>
                Basic information about your barbershop
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="shop_name">Shop Name</Label>
                <div className="p-3 bg-muted/50 rounded-lg border">
                  <p className="font-medium text-foreground">
                    {cloverShopName || formData.shop_name || 'Not configured'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {cloverShopName ? 'Automatically fetched from Clover' : 'Configure Clover API to auto-fetch shop name'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={formData.timezone}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, timezone: value as USTimezone }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {US_TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Commission Settings */}
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader>
              <CardTitle>Commission Settings</CardTitle>
              <CardDescription>
                Configure how commissions are calculated
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="commission_percentage">Commission Percentage (%)</Label>
                <Input
                  id="commission_percentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={formData.commission_percentage}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    commission_percentage: parseFloat(e.target.value) || 0 
                  }))}
                />
                <p className="text-sm text-muted-foreground">
                  Percentage of sales that goes to the employee
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="report_time_cycle">Daily Report Time</Label>
                <Input
                  id="report_time_cycle"
                  type="time"
                  value={formData.report_time_cycle}
                  onChange={(e) => setFormData(prev => ({ ...prev, report_time_cycle: e.target.value }))}
                />
                <p className="text-sm text-muted-foreground">
                  Time when daily reports are generated and sent
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Clover API Configuration */}
        <Card className="shadow-soft border-0 bg-gradient-card">
          <CardHeader>
            <CardTitle>Clover API Configuration</CardTitle>
            <CardDescription>
              Connect your Clover account to fetch sales data automatically
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="clover_merchant_id">Clover Merchant ID</Label>
                <Input
                  id="clover_merchant_id"
                  value={formData.clover_merchant_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, clover_merchant_id: e.target.value }))}
                  placeholder="Enter your Clover merchant ID"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clover_api_token">Clover API Token</Label>
                <div className="relative">
                  <Input
                    id="clover_api_token"
                    type={showApiToken ? "text" : "password"}
                    value={formData.clover_api_token}
                    onChange={(e) => setFormData(prev => ({ ...prev, clover_api_token: e.target.value }))}
                    placeholder="Enter your Clover API token"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowApiToken(!showApiToken)}
                  >
                    {showApiToken ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium mb-2">How to get your Clover API credentials:</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Log in to your Clover dashboard</li>
                <li>Navigate to Account & Setup → API Tokens</li>
                <li>Create a new API token with required permissions</li>
                <li>Copy your Merchant ID and API Token here</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* Commission Configuration */}
        {merchantData && (
          <CommissionConfiguration merchantId={merchantData.id} />
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-success hover:shadow-glow transition-all duration-300"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Settings;