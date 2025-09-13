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
import { Settings as SettingsIcon, Save, Clock, Play, AlertCircle, CheckCircle } from 'lucide-react';
import CommissionConfiguration from '@/components/CommissionConfiguration';
import SecureCredentialManager from '@/components/SecureCredentialManager';
import SecurityAuditLog from '@/components/SecurityAuditLog';

type USTimezone = 'US/Eastern' | 'US/Central' | 'US/Mountain' | 'US/Pacific' | 'US/Alaska' | 'US/Hawaii';

interface MerchantData {
  id: string;
  shop_name: string;
  timezone: USTimezone;
}

interface SettingsData {
  id: string;
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
    report_time_cycle: '21:00',
  });
  const [cloverShopName, setCloverShopName] = useState<string>('');
  const [cronStatus, setCronStatus] = useState<any>(null);
  const [managingCron, setManagingCron] = useState(false);

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
        }));

        // Fetch shop name from Clover via secure credentials
        await fetchCloverShopNameSecure(merchant.id);

        // Fetch cron job status
        await fetchCronStatus(merchant.id);

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

  const fetchCloverShopNameSecure = async (merchantId: string) => {
    try {
      // Fetch shop name through secure edge function
      const { data, error } = await supabase.functions.invoke('clover-shop-info', {
        body: { merchantId }
      });
      
      if (error) throw error;
      
      if (data?.shopName) {
        setCloverShopName(data.shopName);
        
        // Auto-sync to database if current name is generic or empty
        const currentShopName = merchantData?.shop_name || '';
        const isGenericName = !currentShopName || 
                             currentShopName.toLowerCase().includes('default') ||
                             currentShopName.toLowerCase().includes('shop') ||
                             currentShopName.trim() === '';
        
        if (isGenericName && data.shopName !== currentShopName) {
          try {
            const { error: updateError } = await supabase
              .from('merchants')
              .update({ shop_name: data.shopName })
              .eq('id', merchantId);
            
            if (!updateError) {
              // Update local state to reflect the change
              setMerchantData(prev => prev ? { ...prev, shop_name: data.shopName } : null);
              setFormData(prev => ({ ...prev, shop_name: data.shopName }));
              
              toast({
                title: 'Shop Name Synced',
                description: `Updated shop name to "${data.shopName}" from Clover.`,
              });
            }
          } catch (syncError) {
            console.error('Error syncing shop name to database:', syncError);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Clover shop name:', error);
      // Don't show error to user for security reasons
    }
  };

  const fetchCronStatus = async (merchantId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('manage-cron-jobs', {
        body: { 
          action: 'status',
          merchantId: merchantId
        }
      });
      
      if (!error && data) {
        setCronStatus(data.status);
      }
    } catch (error) {
      console.error('Error fetching cron status:', error);
    }
  };

  const setupCronJob = async () => {
    if (!merchantData) return;
    
    setManagingCron(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('manage-cron-jobs', {
        body: {
          action: 'update',
          merchantId: merchantData.id,
          reportTime: formData.report_time_cycle + ':00',
          timezone: formData.timezone
        }
      });

      if (error) throw error;

      toast({
        title: 'Cron Job Updated',
        description: 'Report scheduling has been updated successfully.',
      });

      await fetchCronStatus(merchantData.id);
    } catch (error) {
      console.error('Error managing cron job:', error);
      toast({
        title: 'Error',
        description: 'Failed to update scheduling. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setManagingCron(false);
    }
  };

  const getNextReportTime = () => {
    if (!formData.report_time_cycle || !formData.timezone) return 'Not configured';
    
    const now = new Date();
    const [hours, minutes] = formData.report_time_cycle.split(':').map(Number);
    
    // Create next report time in local timezone
    const nextReport = new Date();
    nextReport.setHours(hours, minutes, 0, 0);
    
    // If time has passed today, schedule for tomorrow
    if (nextReport <= now) {
      nextReport.setDate(nextReport.getDate() + 1);
    }
    
    return nextReport.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
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
            report_time_cycle: formData.report_time_cycle + ':00',
          })
          .eq('id', settings.id);

        if (settingsError) throw settingsError;
      } else {
        const { error: settingsError } = await supabase
          .from('settings')
          .insert({
            merchant_id: merchantId,
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

          {/* Report Settings */}
          <Card className="shadow-soft border-0 bg-gradient-card">
            <CardHeader>
              <CardTitle>Report Settings</CardTitle>
              <CardDescription>
                Configure when daily reports are generated
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Next Scheduled Report</Label>
                  <Button
                    onClick={setupCronJob}
                    disabled={managingCron}
                    size="sm"
                    variant="outline"
                  >
                    {managingCron ? 'Updating...' : 'Update Schedule'}
                  </Button>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      {getNextReportTime()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Reports generate automatically at the scheduled time in your local timezone.
                  </p>
                </div>
                
                {cronStatus && (
                  <div className="p-3 bg-muted/30 rounded-lg border">
                    <div className="flex items-center gap-2 mb-2">
                      {cronStatus.isConfigured ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="font-medium text-sm text-green-700">Scheduler Active</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                          <span className="font-medium text-sm text-yellow-700">Needs Configuration</span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {cronStatus.isConfigured 
                        ? `Cron job: ${cronStatus.cronExpression || 'Running'}`
                        : 'Click "Update Schedule" to activate automatic reports'
                      }
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secure Clover API Configuration */}
        {merchantData && (
          <SecureCredentialManager merchantId={merchantData.id} />
        )}

        {/* Commission Configuration */}
        {merchantData && (
          <CommissionConfiguration merchantId={merchantData.id} />
        )}

        {/* Security Audit Log */}
        {merchantData && (
          <SecurityAuditLog merchantId={merchantData.id} maxEntries={20} />
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