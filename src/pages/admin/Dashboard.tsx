import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabase-paginate';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/currency';
import { useNavigate } from 'react-router-dom';
import {
  Package, ShoppingCart, IndianRupee, TrendingUp, Building2,
  AlertTriangle, BarChart3, Star, Users, CreditCard, Clock, Wallet, Receipt
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

const periodOptions = [
  { label: 'Today', value: 'today' },
  { label: 'Last 7 Days', value: '7days' },
  { label: 'This Month', value: 'month' },
] as const;

type Period = typeof periodOptions[number]['value'];

function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfWeek(d: Date) { const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(d.getFullYear(), d.getMonth(), diff); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return startOfDay(d); }

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [chartPeriod, setChartPeriod] = useState<Period>('7days');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const today = startOfDay(now);
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard-orders'],
    queryFn: async () => {
      return await fetchAllRows<any>(() =>
        supabase
          .from('orders')
          .select('id, total_amount, amount_paid, balance_due, status, created_at, building_name, flat_number, shipping_cost, converted_to_sale, invoice_cancelled, weight_finalized')
          .order('created_at', { ascending: false })
      );
    }
  });

  const { data: orderItems } = useQuery({
    queryKey: ['admin', 'dashboard-items'],
    queryFn: async () => {
      return await fetchAllRows<any>(() =>
        supabase.from('order_items').select('order_id, product_name, quantity, total_price, product_id')
      );
    }
  });

  const { data: purchaseOrders } = useQuery({
    queryKey: ['admin', 'dashboard-purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, vendor_id, total_amount, paid_amount, payment_status, status, order_date, vendor:vendors(name)')
        .gte('order_date', monthStart.toISOString())
        .neq('status', 'cancelled');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: customerPayments } = useQuery({
    queryKey: ['admin', 'dashboard-customer-payments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_payments')
        .select('amount, payment_date, order_id')
        .gte('payment_date', today.toISOString());
      if (error) throw error;
      return data || [];
    }
  });

  const { data: todayExpenses } = useQuery({
    queryKey: ['admin', 'dashboard-expenses-today'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('expenses')
        .select('amount')
        .eq('expense_date', today);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: monthExpenses } = useQuery({
    queryKey: ['admin', 'dashboard-expenses-month'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('expenses')
        .select('amount')
        .gte('expense_date', monthStart);
      if (error) throw error;
      return data || [];
    }
  });

  const { data: vendors } = useQuery({
    queryKey: ['admin', 'dashboard-vendors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, name')
        .eq('status', 'active');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: vendorProducts } = useQuery({
    queryKey: ['admin', 'dashboard-vendor-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_products')
        .select('vendor_id, product_id, cost_price, is_preferred_vendor');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: products } = useQuery({
    queryKey: ['admin', 'dashboard-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, pricing_model, unit');
      if (error) throw error;
      return data || [];
    }
  });

  // --- Computed stats ---
  const stats = useMemo(() => {
    if (!orders) return null;
    const todayOrders = orders.filter(o => new Date(o.created_at) >= today);
    const isLiveInvoice = (o: any) =>
      !o.invoice_cancelled && o.status !== 'cancelled' && o.converted_to_sale;
    const todayInvoiced = todayOrders.filter(isLiveInvoice);
    const salesToday = todayInvoiced.reduce((s, o) => s + Number(o.total_amount), 0);
    const vendorCostToday = (purchaseOrders || [])
      .filter(p => new Date(p.order_date) >= today)
      .reduce((s, p) => s + Number(p.total_amount), 0);
    const expensesToday = (todayExpenses || []).reduce((s, e) => s + Number(e.amount), 0);
    const profitToday = salesToday - vendorCostToday - expensesToday;
    const todayStr = new Date().toISOString().split('T')[0];
    const collectionsToday = (customerPayments || [])
      .filter(p => p.payment_date && p.payment_date.slice(0, 10) === todayStr)
      .reduce((s, p) => s + Number(p.amount), 0);
    const ordersToday = todayOrders.length;
    const pendingFinalization = todayOrders.filter(o =>
      !o.weight_finalized && o.status !== 'cancelled'
    ).length;
    const totalOutstanding = orders
      .filter(o => isLiveInvoice(o))
      .reduce((s, o) => s + Math.max(0, Number(o.balance_due || 0) || (Number(o.total_amount) - Number(o.amount_paid || 0))), 0);
    const overdueOrders = orders.filter(o => {
      if (!isLiveInvoice(o)) return false;
      const due = Number(o.balance_due || 0) || (Number(o.total_amount) - Number(o.amount_paid || 0));
      if (due <= 0) return false;
      const daysOld = (Date.now() - new Date(o.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return daysOld > 30;
    });
    const overdueAmount = overdueOrders.reduce((s, o) =>
      s + (Number(o.balance_due || 0) || (Number(o.total_amount) - Number(o.amount_paid || 0))), 0);
    return {
      salesToday, vendorCostToday, profitToday, collectionsToday, expensesToday,
      ordersToday, pendingFinalization, totalOutstanding, overdueAmount,
    };
  }, [orders, purchaseOrders, customerPayments, today]);

  // Vendor payments due this week
  const vendorPaymentsDue = useMemo(() => {
    if (!purchaseOrders) return [];
    const unpaid = (purchaseOrders as any[]).filter(p =>
      p.payment_status === 'pending' &&
      new Date(p.order_date) >= startOfDay(daysAgo(7))
    );
    const byVendor = new Map<string, { name: string; total: number; count: number }>();
    unpaid.forEach(p => {
      const name = p.vendor?.name || 'Unknown';
      const cur = byVendor.get(p.vendor_id) || { name, total: 0, count: 0 };
      cur.total += Number(p.total_amount || 0);
      cur.count++;
      byVendor.set(p.vendor_id, cur);
    });
    return Array.from(byVendor.values()).sort((a, b) => b.total - a.total);
  }, [purchaseOrders]);

  // Top selling products today
  const topSellingToday = useMemo(() => {
    if (!orders || !orderItems) return [];
    const todayIds = new Set(orders.filter(o => new Date(o.created_at) >= today).map(o => o.id));
    const todayItems = orderItems.filter(i => todayIds.has(i.order_id));
    const productUnitMap2 = new Map((products || []).map(p => [p.id, p.unit || 'kg']));
    const map: Record<string, { name: string; qty: number; revenue: number; unit: string }> = {};
    todayItems.forEach(i => {
      if (!map[i.product_name]) map[i.product_name] = { name: i.product_name, qty: 0, revenue: 0, unit: (i.product_id && productUnitMap2.get(i.product_id)) || 'kg' };
      map[i.product_name].qty += Number(i.quantity);
      map[i.product_name].revenue += Number(i.total_price);
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [orders, orderItems, today]);

  // Today's delivery demand by apartment
  const todayApartmentDemand = useMemo(() => {
    if (!orders) return [];
    const todayOrders = orders.filter(o => new Date(o.created_at) >= today && o.status !== 'cancelled');
    const map: Record<string, { building: string; deliveries: number; flats: Set<string> }> = {};
    todayOrders.forEach(o => {
      if (!o.building_name) return;
      if (!map[o.building_name]) map[o.building_name] = { building: o.building_name, deliveries: 0, flats: new Set() };
      map[o.building_name].deliveries++;
      if (o.flat_number) map[o.building_name].flats.add(o.flat_number);
    });
    return Object.values(map)
      .map(d => ({ building: d.building, deliveries: d.deliveries, flatsCount: d.flats.size }))
      .sort((a, b) => b.deliveries - a.deliveries)
      .slice(0, 8);
  }, [orders, today]);

  // Vendor procurement summary (pending orders)
  const vendorProcurement = useMemo(() => {
    if (!orders || !orderItems || !vendorProducts || !vendors || !products) return [];
    const pendingIds = new Set(orders.filter(o => o.status === 'pending' || o.status === 'processing').map(o => o.id));
    const pendingItems = orderItems.filter(i => pendingIds.has(i.order_id));
    const preferredVendorMap: Record<string, string> = {};
    vendorProducts.forEach(vp => {
      if (vp.is_preferred_vendor) preferredVendorMap[vp.product_id] = vp.vendor_id;
    });
    vendorProducts.forEach(vp => {
      if (!preferredVendorMap[vp.product_id]) preferredVendorMap[vp.product_id] = vp.vendor_id;
    });
    const vendorMap = new Map(vendors.map(v => [v.id, v.name]));
    const productUnitMap = new Map(products.map(p => [p.id, { unit: p.unit, pricing_model: p.pricing_model }]));
    const summary: Record<string, { vendorName: string; items: Record<string, { productName: string; qty: number; unit: string }> }> = {};
    pendingItems.forEach(i => {
      const vendorId = i.product_id ? preferredVendorMap[i.product_id] : null;
      if (!vendorId) return;
      const vendorName = vendorMap.get(vendorId) || 'Unknown';
      if (!summary[vendorId]) summary[vendorId] = { vendorName, items: {} };
      const pInfo = i.product_id ? productUnitMap.get(i.product_id) : null;
      const unit = pInfo?.pricing_model === 'unit_based' ? (pInfo.unit || 'pcs') : 'kg';
      if (!summary[vendorId].items[i.product_name]) summary[vendorId].items[i.product_name] = { productName: i.product_name, qty: 0, unit };
      summary[vendorId].items[i.product_name].qty += Number(i.quantity);
    });
    return Object.values(summary).map(v => ({
      vendorName: v.vendorName,
      items: Object.values(v.items).sort((a, b) => b.qty - a.qty),
    })).sort((a, b) => b.items.length - a.items.length);
  }, [orders, orderItems, vendorProducts, vendors, products]);

  // Chart data
  const chartData = useMemo(() => {
    if (!orders) return [];
    let start: Date;
    if (chartPeriod === 'today') start = today;
    else if (chartPeriod === '7days') start = daysAgo(6);
    else start = monthStart;
    const filtered = orders.filter(o => new Date(o.created_at) >= start && !o.invoice_cancelled && o.converted_to_sale);
    const dayMap: Record<string, number> = {};
    filtered.forEach(o => {
      const day = new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      dayMap[day] = (dayMap[day] || 0) + Number(o.total_amount);
    });
    return Object.entries(dayMap).map(([day, sales]) => ({ day, sales: Math.round(sales) })).reverse();
  }, [orders, chartPeriod, today, monthStart]);

  const StatCard = ({ title, value, icon: Icon, subtitle, tone }: {
    title: string; value: string; icon: any; subtitle?: string; tone?: 'red' | 'green' | 'amber';
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-24" /> : (
          <>
            <p className={`text-2xl font-bold ${tone === 'red' ? 'text-destructive' : tone === 'green' ? 'text-green-600' : tone === 'amber' ? 'text-amber-600' : ''}`}>
              {value}
            </p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="font-body text-muted-foreground">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>

        {/* Row 1: Today's P&L */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Today's P&L</h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard title="Sales Today" value={formatCurrency(stats?.salesToday || 0)} icon={IndianRupee} subtitle={`${stats?.ordersToday || 0} invoiced orders`} />
            <StatCard title="Vendor Cost" value={formatCurrency(stats?.vendorCostToday || 0)} icon={Package} subtitle="Today's procurement" />
            <StatCard title="Operating Expenses" value={formatCurrency(stats?.expensesToday || 0)} icon={Receipt} subtitle="Delivery, packaging etc" />
            <StatCard title="Net Profit Today" value={formatCurrency(stats?.profitToday || 0)} icon={TrendingUp} tone={stats?.profitToday && stats.profitToday > 0 ? 'green' : 'red'} subtitle="Sales − Vendor − Expenses" />
            <StatCard title="Collections Today" value={formatCurrency(stats?.collectionsToday || 0)} icon={CreditCard} tone="green" subtitle="Payments received" />
          </div>
        </div>

        {/* Row 2: Operations */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Operations</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard title="Orders Today" value={String(stats?.ordersToday || 0)} icon={ShoppingCart} subtitle="All orders received" />
            <StatCard
              title="Pending Finalization"
              value={String(stats?.pendingFinalization || 0)}
              icon={Clock}
              tone={stats?.pendingFinalization ? 'amber' : undefined}
              subtitle="Weights not yet finalized"
            />
            <div className="cursor-pointer" onClick={() => navigate('/admin/orders')}>
              <StatCard
                title="Customer Outstanding"
                value={formatCurrency(stats?.totalOutstanding || 0)}
                icon={AlertTriangle}
                tone={stats?.totalOutstanding ? 'red' : undefined}
                subtitle={`₹${((stats?.overdueAmount || 0) / 1000).toFixed(0)}k overdue 30+ days`}
              />
            </div>
          </div>
        </div>

        {/* Row 3: Sales Trend + Delivery Demand */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Sales Trend</CardTitle>
              <div className="flex gap-1">
                {periodOptions.map(p => (
                  <Button key={p.value} size="sm" variant={chartPeriod === p.value ? 'default' : 'ghost'} className="h-7 text-xs" onClick={() => setChartPeriod(p.value)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-48 w-full" /> : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">No sales data for this period</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Today's Deliveries
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todayApartmentDemand.length > 0 ? (
                <div className="space-y-2">
                  {todayApartmentDemand.map((apt) => (
                    <div key={apt.building} className="flex items-center justify-between p-2 bg-muted/40 rounded-lg">
                      <div>
                        <p className="font-medium text-sm leading-tight">{apt.building}</p>
                        <p className="text-xs text-muted-foreground">{apt.flatsCount} flats</p>
                      </div>
                      <Badge variant="secondary">{apt.deliveries}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6">No deliveries today yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 4: Top Products + Vendor Payments Due */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4" /> Top Products Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topSellingToday.length > 0 ? (
                <div className="space-y-2">
                  {topSellingToday.map((p, idx) => (
                    <div key={p.name} className="flex items-center justify-between p-2 bg-muted/40 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-5">#{idx + 1}</span>
                        <span className="text-sm font-medium truncate">{p.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">{p.qty % 1 === 0 ? p.qty : p.qty.toFixed(2)} {p.unit || 'kg'}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(p.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6">No orders today yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Vendor Payments Due
                <Badge variant="outline" className="ml-1 text-xs">Last 7 days</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vendorPaymentsDue.length > 0 ? (
                <div className="space-y-2">
                  {vendorPaymentsDue.map((v) => (
                    <div key={v.name} className="flex items-center justify-between p-2 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer" onClick={() => navigate('/admin/purchase-orders')}>
                      <div>
                        <p className="font-medium text-sm">{v.name}</p>
                        <p className="text-xs text-muted-foreground">{v.count} PO{v.count > 1 ? 's' : ''} unpaid</p>
                      </div>
                      <span className="text-sm font-bold text-amber-700">{formatCurrency(v.total)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6 text-green-600 font-medium">All vendors paid ✓</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 5: Vendor Procurement Summary */}
        {vendorProcurement.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" /> Procurement Required
                <Badge variant="outline" className="ml-1 text-xs">Pending Orders</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vendorProcurement.map((v) => (
                  <div key={v.vendorName} className="border rounded-lg p-3 space-y-2">
                    <p className="font-semibold text-sm border-b pb-1">{v.vendorName}</p>
                    {v.items.map((item) => (
                      <div key={item.productName} className="flex items-center justify-between text-sm">
                        <span className="truncate mr-2 text-muted-foreground">{item.productName}</span>
                        <span className="font-medium shrink-0">{item.qty % 1 === 0 ? item.qty : item.qty.toFixed(2)} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
