import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Percent, TrendingUp } from 'lucide-react';

interface EmployeeCardProps {
  employee: {
    employee_name: string;
    total_sales: number;
    commission_amount: number;
    shop_commission: number;
  };
}

const EmployeeCard: React.FC<EmployeeCardProps> = ({ employee }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const commissionRate = employee.total_sales > 0 
    ? (employee.commission_amount / employee.total_sales) * 100 
    : 0;

  return (
    <Card className="shadow-soft border-0 bg-gradient-card hover:shadow-glow transition-all duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground">
            {employee.employee_name}
          </CardTitle>
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            {commissionRate.toFixed(1)}% rate
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4">
          {/* Total Sales */}
          <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 rounded-lg p-2">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Total Sales</p>
                <p className="text-xs text-muted-foreground">Period sales</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-primary">
                {formatCurrency(employee.total_sales)}
              </p>
            </div>
          </div>

          {/* Commission Earned */}
          <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="bg-accent/10 rounded-lg p-2">
                <Percent className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Commission Earned</p>
                <p className="text-xs text-muted-foreground">Employee earnings</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-accent">
                {formatCurrency(employee.commission_amount)}
              </p>
            </div>
          </div>

          {/* Shop Commission */}
          <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="bg-warning/10 rounded-lg p-2">
                <TrendingUp className="h-4 w-4 text-warning" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Shop Commission</p>
                <p className="text-xs text-muted-foreground">Shop earnings</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-warning">
                {formatCurrency(employee.shop_commission)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default EmployeeCard;