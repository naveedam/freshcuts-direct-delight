import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabase-paginate';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';
import { format } from 'date-fns';
import { Users, Building2, ShoppingCart, IndianRupee, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

type OrderRow = {
  building_name: string;
  flat_number: string;
  total_amount: number;
  created_at: string;
};

export function ExecutiveSummaryContent() {
  const [sortBy, setSortBy] = useState<'customers' | 'revenue'>('customers');

  const { data: orders, isLoading } = useQuery({
    queryKey: ['exec-dashboard-orders'],
    queryFn: async () => {
      const data = await fetchAllRows<OrderRow>(() =>
        supabase
          .from('orders')
          .select('building_name, flat_number, total_amount, created_at')
          .neq('status', 'cancelled')
          .eq('invoice_cancelled', false)
          .not('building_name', 'is', null)
          .not('flat_number', 'is', null)
          .order('created_at', { ascending: true })
      );
      return data;
    },
  });

  const customerKey = (o: OrderRow) => `${o.building_name}|${o.flat_number}`;
  const monthKey = (dateStr: string) => dateStr.slice(0, 7);

  const totals = useMemo(() => {
    if (!orders) return null;
    const customers = new Set(orders.map(customerKey));
    const apartments = new Set(orders.map((o) => o.building_name));
    const revenue = orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    return {
      customers: customers.size,
      apartments: apartments.size,
      orders: orders.length,
      revenue,
      avgOrderValue: orders.length ? revenue / orders.length : 0,
    };
  }, [orders]);

  const monthly = useMemo(() => {
    if (!orders) return [];
    const firstMonth = new Map<string, string>();
    for (const o of orders) {
      const key = customerKey(o);
      const m = monthKey(o.created_at);
      if (!firstMonth.has(key) || m < firstMonth.get(key)!) firstMonth.set(key, m);
    }

    const byMonth = new Map<string, { customers: Set<string>; apartments: Set<string>; orders: number; revenue: number; newCustomers: Set<string>; returningCustomers: Set<string> }>();
    for (const o of orders) {
      const m = monthKey(o.created_at);
      const key = customerKey(o);
      if (!byMonth.has(m)) {
        byMonth.set(m, { customers: new Set(), apartments: new Set(), orders: 0, revenue: 0, newCustomers: new Set(), returningCustomers: new Set() });
      }
      const bucket = byMonth.get(m)!;
      bucket.customers.add(key);
      bucket.apartments.add(o.building_name);
      bucket.orders += 1;
      bucket.revenue += Number(o.total_amount) || 0;
      if (firstMonth.get(key) === m) bucket.newCustomers.add(key);
      else bucket.returningCustomers.add(key);
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, b]) => ({
        month,
        monthLabel: format(new Date(month + '-01'), 'MMM yyyy'),
        customers: b.customers.size,
        apartments: b.apartments.size,
        orders: b.orders,
        revenue: Math.round(b.revenue),
        newCustomers: b.newCustomers.size,
        returningCustomers: b.returningCustomers.size,
      }));
  }, [orders]);

  const apartmentStats = useMemo(() => {
    if (!orders) return [];
    const byApt = new Map<string, { customers: Set<string>; orders: number; revenue: number; first: string; last: string }>();
    for (const o of orders) {
      if (!byApt.has(o.building_name)) {
        byApt.set(o.building_name, { customers: new Set(), orders: 0, revenue: 0, first: o.created_at, last: o.created_at });
      }
      const bucket = byApt.get(o.building_name)!;
      bucket.customers.add(o.flat_number);
      bucket.orders += 1;
      bucket.revenue += Number(o.total_amount) || 0;
      if (o.created_at < bucket.first) bucket.first = o.created_at;
      if (o.created_at > bucket.last) bucket.last = o.created_at;
    }
    const rows = Array.from(byApt.entries()).map(([name, b]) => ({
      name,
      customers: b.customers.size,
      orders: b.orders,
      revenue: b.revenue,
      avgOrderValue: b.orders ? b.revenue / b.orders : 0,
      ordersPerCustomer: b.customers.size ? b.orders / b.customers.size : 0,
    }));
    return rows.sort((a, b) => (sortBy === 'customers' ? b.customers - a.customers : b.revenue - a.revenue));
  }, [orders, sortBy]);

  const concentration = useMemo(() => {
    if (!apartmentStats.length || !totals) return null;
    const byRevenue = [...apartmentStats].sort((a, b) => b.revenue - a.revenue);
    const top5Revenue = byRevenue.slice(0, 5).reduce((s, a) => s + a.revenue, 0);
    return {
      top5Names: byRevenue.slice(0, 5).map((a) => a.name),
      top5Revenue,
      pct: totals.revenue ? (top5Revenue / totals.revenue) * 100 : 0,
    };
  }, [apartmentStats, totals]);

  const momChange = (curr: number, prev: number) => {
    if (prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  };

  const lastTwoMonths = monthly.slice(-2);
  const [prevMonth, currMonth] = lastTwoMonths.length === 2 ? lastTwoMonths : [null, lastTwoMonths[0] || null];

  const ChangeIndicator = ({ pct }: { pct: number | null }) => {
    if (pct === null) return null;
    const Icon = pct > 0.5 ? TrendingUp : pct < -0.5 ? TrendingDown : Minus;
    const color = pct > 0.5 ? 'text-green-600' : pct < -0.5 ? 'text-destructive' : 'text-muted-foreground';
    return (
      <span className={`inline-flex items-center gap-1 text-xs ${color}`}>
        <Icon className="h-3 w-3" /> {Math.abs(pct).toFixed(1)}% vs prev month
      </span>
    );
  };

  if (isLoading || !totals) {
    return <div className="p-8 text-center text-muted-foreground">Loading executive summary…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-bold text-foreground">Executive Summary</h2>
        <p className="font-body text-muted-foreground text-sm">Customer growth, apartment reach, and revenue at a glance</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Users className="h-3 w-3" />Total Customers</CardDescription><CardTitle className="text-2xl">{totals.customers}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Building2 className="h-3 w-3" />Apartments Served</CardDescription><CardTitle className="text-2xl">{totals.apartments}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />Total Orders</CardDescription><CardTitle className="text-2xl">{totals.orders}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><IndianRupee className="h-3 w-3" />Total Revenue</CardDescription><CardTitle className="text-2xl">{formatCurrency(totals.revenue)}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Avg Order Value</CardDescription><CardTitle className="text-2xl">{formatCurrency(totals.avgOrderValue)}</CardTitle></CardHeader>
        </Card>
      </div>

      {currMonth && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest Month — {currMonth.monthLabel}</CardTitle>
            <CardDescription>Note: if this is the current calendar month, figures are partial (month still in progress).</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Active Customers</p>
              <p className="text-xl font-bold">{currMonth.customers}</p>
              {prevMonth && <ChangeIndicator pct={momChange(currMonth.customers, prevMonth.customers)} />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Apartments</p>
              <p className="text-xl font-bold">{currMonth.apartments}</p>
              {prevMonth && <ChangeIndicator pct={momChange(currMonth.apartments, prevMonth.apartments)} />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Orders</p>
              <p className="text-xl font-bold">{currMonth.orders}</p>
              {prevMonth && <ChangeIndicator pct={momChange(currMonth.orders, prevMonth.orders)} />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-xl font-bold">{formatCurrency(currMonth.revenue)}</p>
              {prevMonth && <ChangeIndicator pct={momChange(currMonth.revenue, prevMonth.revenue)} />}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Active Customers & Apartments by Month</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="customers" name="Customers" stroke="#16a34a" strokeWidth={2} />
                <Line type="monotone" dataKey="apartments" name="Apartments" stroke="#8b5cf6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Revenue by Month</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="revenue" name="Revenue" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New vs Returning Customers by Month</CardTitle>
          <CardDescription>"New" = first-ever order in that month. "Returning" = ordered before and ordered again this month.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="newCustomers" name="New" stackId="a" fill="#16a34a" />
              <Bar dataKey="returningCustomers" name="Returning" stackId="a" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {concentration && (
        <Card className="border-primary/30">
          <CardContent className="p-4">
            <p className="text-sm">
              <span className="font-bold">Top 5 apartments</span> ({concentration.top5Names.join(', ')})
              {' '}account for <span className="font-bold text-primary">{concentration.pct.toFixed(1)}%</span> of total revenue
              {' '}({formatCurrency(concentration.top5Revenue)} of {formatCurrency(totals.revenue)}).
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Apartment Leaderboard</CardTitle>
            <CardDescription>Customer concentration and order volume by apartment/complex</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant={sortBy === 'customers' ? 'default' : 'outline'} size="sm" onClick={() => setSortBy('customers')}>By Customers</Button>
            <Button variant={sortBy === 'revenue' ? 'default' : 'outline'} size="sm" onClick={() => setSortBy('revenue')}>By Revenue</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Apartment</TableHead>
                <TableHead className="text-right">Customers</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Orders/Customer</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Avg Order Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apartmentStats.map((a) => (
                <TableRow key={a.name}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-right">{a.customers}</TableCell>
                  <TableCell className="text-right">{a.orders}</TableCell>
                  <TableCell className="text-right">{a.ordersPerCustomer.toFixed(1)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(a.revenue)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(a.avgOrderValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}