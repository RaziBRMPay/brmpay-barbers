import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

interface EmployeeMetrics {
  employee_name: string;
  total_sales: number;
  commission_amount: number;
  shop_commission: number;
}

interface DashboardMetricsProps {
  salesData: EmployeeMetrics[];
  loading?: boolean;
}

const DashboardMetrics: React.FC<DashboardMetricsProps> = ({ salesData, loading }) => {
  const totalSales = salesData.reduce((sum, emp) => sum + emp.total_sales, 0);
  const totalCommissionPaid = salesData.reduce((sum, emp) => sum + emp.commission_amount, 0);
  const totalShopCommission = salesData.reduce((sum, emp) => sum + emp.shop_commission, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const metrics = [
    {
      title: 'Total Sales',
      value: formatCurrency(totalSales),
      icon: DollarSign,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Total Commission Paid',
      value: formatCurrency(totalCommissionPaid),
      icon: TrendingDown,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Total Shop Commission',
      value: formatCurrency(totalShopCommission),
      icon: TrendingUp,
      color: 'text-accent',
      bgColor: 'bg-accent/10',
    },
  ];

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Loading...</CardTitle>
              <div className="h-4 w-4 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold bg-muted rounded w-20 h-8 animate-pulse" />
              <p className="text-xs text-muted-foreground mt-1">Calculating...</p>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {metrics.map((metric, index) => {
        const Icon = metric.icon;
        return (
          <Card key={index} className="shadow-soft border-0 bg-gradient-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
              <div className={`rounded-lg p-2 ${metric.bgColor}`}>
                <Icon className={`h-4 w-4 ${metric.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${metric.color}`}>
                {metric.value}
              </div>
              <p className="text-xs text-muted-foreground">
                For selected period
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default DashboardMetrics;