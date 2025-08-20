import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users, Save } from 'lucide-react';

interface Employee {
  employee_id: string;
  employee_name: string;
  commission_percentage?: number;
}

interface CommissionConfigurationProps {
  merchantId: string;
}

const CommissionConfiguration: React.FC<CommissionConfigurationProps> = ({ merchantId }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [commissionRates, setCommissionRates] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchEmployees();
  }, [merchantId]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      
      // Fetch employees who have recorded sales
      const { data: salesData, error: salesError } = await supabase
        .from('employee_sales_data')
        .select('employee_id, employee_name')
        .eq('merchant_id', merchantId)
        .gt('total_sales', 0);

      if (salesError) throw salesError;

      // Get unique employees
      const uniqueEmployees = salesData?.reduce((acc: Employee[], curr) => {
        if (!acc.find(emp => emp.employee_id === curr.employee_id)) {
          acc.push({
            employee_id: curr.employee_id,
            employee_name: curr.employee_name
          });
        }
        return acc;
      }, []) || [];

      // Fetch existing commission configurations
      const { data: commissionData, error: commissionError } = await supabase
        .from('employee_commissions')
        .select('*')
        .eq('merchant_id', merchantId);

      if (commissionError) throw commissionError;

      // Merge employee data with existing commission rates
      const employeesWithCommissions = uniqueEmployees.map(emp => {
        const existingCommission = commissionData?.find(c => c.employee_id === emp.employee_id);
        return {
          ...emp,
          commission_percentage: existingCommission?.commission_percentage || 70
        };
      });

      setEmployees(employeesWithCommissions);
      
      // Initialize commission rates state
      const rates: Record<string, number> = {};
      employeesWithCommissions.forEach(emp => {
        rates[emp.employee_id] = emp.commission_percentage || 70;
      });
      setCommissionRates(rates);

    } catch (error) {
      console.error('Error fetching employees:', error);
      toast({
        title: 'Error',
        description: 'Failed to load employee commission data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCommissionChange = (employeeId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setCommissionRates(prev => ({
      ...prev,
      [employeeId]: Math.max(0, Math.min(100, numValue)) // Clamp between 0-100
    }));
  };

  const saveCommissionRates = async () => {
    try {
      setSaving(true);

      // Prepare upsert data
      const upsertData = employees.map(emp => ({
        merchant_id: merchantId,
        employee_id: emp.employee_id,
        employee_name: emp.employee_name,
        commission_percentage: commissionRates[emp.employee_id] || 70
      }));

      const { error } = await supabase
        .from('employee_commissions')
        .upsert(upsertData, {
          onConflict: 'merchant_id,employee_id'
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Commission rates saved successfully',
      });

      // Refresh the data
      await fetchEmployees();

    } catch (error) {
      console.error('Error saving commission rates:', error);
      toast({
        title: 'Error',
        description: 'Failed to save commission rates',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="shadow-soft border-0 bg-gradient-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Commission Configuration
          </CardTitle>
          <CardDescription>
            Loading employee commission settings...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (employees.length === 0) {
    return (
      <Card className="shadow-soft border-0 bg-gradient-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Commission Configuration
          </CardTitle>
          <CardDescription>
            Set individual commission rates for each employee
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No employees with sales data found. Employees will appear here once they have recorded sales.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-soft border-0 bg-gradient-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Commission Configuration
        </CardTitle>
        <CardDescription>
          Set individual commission rates for each employee with sales history
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4">
          {employees.map((employee) => (
            <div key={employee.employee_id} className="flex items-center justify-between p-4 border rounded-lg bg-background/50">
              <div className="flex-1">
                <h4 className="font-medium text-foreground">{employee.employee_name}</h4>
                <p className="text-sm text-muted-foreground">ID: {employee.employee_id}</p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`commission-${employee.employee_id}`} className="text-sm font-medium">
                  Commission %:
                </Label>
                <Input
                  id={`commission-${employee.employee_id}`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={commissionRates[employee.employee_id] || 70}
                  onChange={(e) => handleCommissionChange(employee.employee_id, e.target.value)}
                  className="w-20 text-center"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4">
          <Button
            onClick={saveCommissionRates}
            disabled={saving}
            className="bg-gradient-success hover:shadow-glow transition-all duration-300"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Commission Rates
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default CommissionConfiguration;