import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/currency';
import { useNavigate } from 'react-router-dom';
import {
  Package, ShoppingCart, IndianRupee, TrendingUp, Building2,
  Plus, FileText, Truck, Upload, Receipt, AlertTriangle, BarChart3, CalendarDays, Star, Users
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
  const today = startOfDay(new Date());
  const monthStart = startOfMonth(new Date());
  const weekStart = startOfWeek(new Date());

  const { data: orders, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, total_amount, status, created_at, building_name, flat_number, discount_amount')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  const { data: orderItems } = useQuery({
    queryKey: ['admin', 'dashboard-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('order_id, product_name, quantity, total_price, product_id, unit_price, vendor_cost');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: products } = useQuery({
    queryKey: ['admin', 'dashboard-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category, stock_quantity, in_stock, pricing_model, unit');
      if (error) throw error;
      return data || [];
    }
  });

  const { data: purchaseOrders } = useQuery({
    queryKey: ['admin', 'dashboard-purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, total_amount, created_at')
        .gte('created_at', monthStart.toISOString());
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch vendors for procurement summary
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

  // Fetch vendor-product mappings for procurement intelligence
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

  // Computed stats
  const stats = useMemo(() => {
    if (!orders) return null;

    const todayOrders = orders.filter(o => new Date(o.created_at) >= today);
    const monthOrders = orders.filter(o => new Date(o.created_at) >= monthStart);
    const weekOrders = orders.filter(o => new Date(o.created_at) >= weekStart);

    const salesToday = todayOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    const salesMonth = monthOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    const purchasesMonth = purchaseOrders?.reduce((s, p) => s + Number(p.total_amount), 0) || 0;

    const pending = orders.filter(o => o.status === 'pending').length;
    const delivered = orders.filter(o => o.status === 'delivered').length;
    const avgOrderValue = orders.length > 0 ? orders.reduce((s, o) => s + Number(o.total_amount), 0) / orders.length : 0;
    const totalWeight = orderItems?.reduce((s, i) => s + Number(i.quantity), 0) || 0;

    const weekRevenue = weekOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    // Top product: only from finalized orders (exclude cancelled, draft, pending)
    const finalizedStatuses = new Set(['processing', 'shipped', 'delivered', 'completed']);
    const weekFinalizedOrders = weekOrders.filter(o => finalizedStatuses.has(o.status));
    const weekFinalizedIds = new Set(weekFinalizedOrders.map(o => o.id));
    const weekFinalizedItems = orderItems?.filter(i => weekFinalizedIds.has(i.order_id)) || [];
    const productSales: Record<string, { name: string; qty: number; productId: string | null }> = {};
    weekFinalizedItems.forEach(i => {
      const key = i.product_id || i.product_name;
      if (!productSales[key]) productSales[key] = { name: i.product_name, qty: 0, productId: i.product_id };
      productSales[key].qty += Number(i.quantity);
    });
    const topProduct = Object.values(productSales).sort((a, b) => b.qty - a.qty)[0]?.name || 'N/A';

    // Today's vendor cost & profit
    const todayOrderIds = new Set(todayOrders.map(o => o.id));
    const todayItems = orderItems?.filter(i => todayOrderIds.has(i.order_id)) || [];
    const vendorCostToday = todayItems.reduce((s, i) => s + (Number(i.vendor_cost || 0) * Number(i.quantity)), 0);
    const profitToday = salesToday - vendorCostToday;

    // Today's avg order value
    const avgOrderValueToday = todayOrders.length > 0 ? salesToday / todayOrders.length : 0;

    return {
      salesToday, salesMonth, purchasesMonth,
      netRevenue: salesMonth - purchasesMonth,
      ordersToday: todayOrders.length,
      pending, delivered, avgOrderValue, totalWeight,
      weekOrders: weekOrders.length, weekRevenue, topProduct,
      vendorCostToday, profitToday, avgOrderValueToday,
    };
  }, [orders, orderItems, purchaseOrders, today, monthStart, weekStart]);

  // Top selling products today
  const topSellingToday = useMemo(() => {
    if (!orders || !orderItems) return [];
    const todayOrderIds = new Set(orders.filter(o => new Date(o.created_at) >= today).map(o => o.id));
    const todayItems = orderItems.filter(i => todayOrderIds.has(i.order_id));
    const productMap: Record<string, { name: string; qty: number; revenue: number }> = {};
    todayItems.forEach(i => {
      const key = i.product_name;
      if (!productMap[key]) productMap[key] = { name: key, qty: 0, revenue: 0 };
      productMap[key].qty += Number(i.quantity);
      productMap[key].revenue += Number(i.total_price);
    });
    return Object.values(productMap).sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [orders, orderItems, today]);

  // Vendor procurement summary: aggregate pending order items by vendor
  const vendorProcurement = useMemo(() => {
    if (!orders || !orderItems || !vendorProducts || !vendors || !products) return [];
    const pendingOrderIds = new Set(orders.filter(o => o.status === 'pending' || o.status === 'processing').map(o => o.id));
    const pendingItems = orderItems.filter(i => pendingOrderIds.has(i.order_id));

    // Build product->preferred vendor map
    const preferredVendorMap: Record<string, string> = {};
    vendorProducts.forEach(vp => {
      if (vp.is_preferred_vendor) preferredVendorMap[vp.product_id] = vp.vendor_id;
    });
    // Fallback: any vendor mapping
    vendorProducts.forEach(vp => {
      if (!preferredVendorMap[vp.product_id]) preferredVendorMap[vp.product_id] = vp.vendor_id;
    });

    const vendorMap = new Map(vendors.map(v => [v.id, v.name]));
    const productUnitMap = new Map(products.map(p => [p.id, { unit: p.unit, pricing_model: p.pricing_model }]));

    // Group: vendor -> product -> qty
    const summary: Record<string, { vendorName: string; items: Record<string, { productName: string; qty: number; unit: string }> }> = {};

    pendingItems.forEach(i => {
      const vendorId = i.product_id ? preferredVendorMap[i.product_id] : null;
      if (!vendorId) return;
      const vendorName = vendorMap.get(vendorId) || 'Unknown';
      if (!summary[vendorId]) summary[vendorId] = { vendorName, items: {} };
      const key = i.product_name;
      const pInfo = i.product_id ? productUnitMap.get(i.product_id) : null;
      const unit = pInfo?.pricing_model === 'unit_based' ? (pInfo.unit || 'pcs') : 'kg';
      if (!summary[vendorId].items[key]) summary[vendorId].items[key] = { productName: key, qty: 0, unit };
      summary[vendorId].items[key].qty += Number(i.quantity);
    });

    return Object.values(summary).map(v => ({
      vendorName: v.vendorName,
      items: Object.values(v.items).sort((a, b) => b.qty - a.qty),
    })).sort((a, b) => b.items.length - a.items.length);
  }, [orders, orderItems, vendorProducts, vendors, products]);

  // Today's apartment delivery demand
  const todayApartmentDemand = useMemo(() => {
    if (!orders) return [];
    const todayOrders = orders.filter(o => new Date(o.created_at) >= today);
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
      .slice(0, 10);
  }, [orders, today]);

  // Chart data
  const chartData = useMemo(() => {
    if (!orders) return [];
    let start: Date;
    if (chartPeriod === 'today') start = today;
    else if (chartPeriod === '7days') start = daysAgo(6);
    else start = monthStart;

    const filtered = orders.filter(o => new Date(o.created_at) >= start);
    const dayMap: Record<string, number> = {};
    filtered.forEach(o => {
      const day = new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      dayMap[day] = (dayMap[day] || 0) + Number(o.total_amount);
    });
    return Object.entries(dayMap).map(([day, sales]) => ({ day, sales: Math.round(sales) })).reverse();
  }, [orders, chartPeriod, today, monthStart]);

  // Category performance (all time)
  const categoryData = useMemo(() => {
    if (!orderItems || !products) return [];
    const productCatMap: Record<string, string> = {};
    products.forEach(p => { productCatMap[p.id] = p.category; });
    const catRevenue: Record<string, number> = {};
    orderItems.forEach(i => {
      const cat = (i.product_id && productCatMap[i.product_id]) || 'Other';
      catRevenue[cat] = (catRevenue[cat] || 0) + Number(i.total_price);
    });
    return Object.entries(catRevenue).map(([category, revenue]) => ({ category, revenue })).sort((a, b) => b.revenue - a.revenue);
  }, [orderItems, products]);

  // Low stock
  const lowStockItems = useMemo(() => {
    if (!products) return [];
    return products
      .filter(p => p.in_stock && (p.stock_quantity ?? 0) <= 5)
      .sort((a, b) => (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0))
      .slice(0, 8);
  }, [products]);

  const StatCard = ({ title, value, icon: Icon, subtitle }: { title: string; value: string; icon: any; subtitle?: string }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-8 w-24" /> : (
          <>
            <p className="text-2xl font-bold">{value}</p>
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
          <p className="font-body text-muted-foreground">Business overview &amp; analytics</p>
        </div>

        {/* Financial Overview - Today's P&L */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Sales Today" value={formatCurrency(stats?.salesToday || 0)} icon={IndianRupee} subtitle={`${stats?.ordersToday || 0} orders`} />
          <StatCard title="Vendor Cost Today" value={formatCurrency(stats?.vendorCostToday || 0)} icon={Package} subtitle="Purchase cost" />
          <StatCard title="Profit Today" value={formatCurrency(stats?.profitToday || 0)} icon={TrendingUp} subtitle="Sales − Vendor Cost" />
          <StatCard title="Avg Order Value" value={formatCurrency(stats?.avgOrderValueToday || 0)} icon={IndianRupee} subtitle="Today" />
          <StatCard title="Net Revenue (Month)" value={formatCurrency(stats?.netRevenue || 0)} icon={BarChart3} subtitle="Sales − Purchases" />
        </div>

        {/* Sales Trend + Operational */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Sales Trend</CardTitle>
              <div className="flex gap-1">
                {periodOptions.map(p => (
                  <Button
                    key={p.value}
                    size="sm"
                    variant={chartPeriod === p.value ? 'default' : 'ghost'}
                    className="h-7 text-xs"
                    onClick={() => setChartPeriod(p.value)}
                  >
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
                    <XAxis dataKey="day" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis className="text-xs" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-muted-foreground py-12">No sales data for this period</p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <StatCard title="Orders Today" value={String(stats?.ordersToday || 0)} icon={ShoppingCart} />
            <StatCard title="Pending Orders" value={String(stats?.pending || 0)} icon={AlertTriangle} />
            <StatCard title="Delivered Orders" value={String(stats?.delivered || 0)} icon={Truck} />
            <StatCard title="Total Weight Sold" value={`${(stats?.totalWeight || 0).toFixed(1)} kg`} icon={Package} />
          </div>
        </div>

        {/* Top Selling Products Today + Today's Apartment Delivery Demand */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4" /> Top Selling Products Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topSellingToday.length > 0 ? (
                <div className="space-y-2">
                  {topSellingToday.map((p, idx) => (
                    <div key={p.name} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground w-5">#{idx + 1}</span>
                        <span className="text-sm font-medium truncate">{p.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold">{p.qty % 1 === 0 ? p.qty : p.qty.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(p.revenue)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6">No sales today yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Today's Delivery Demand
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todayApartmentDemand.length > 0 ? (
                <div className="space-y-2">
                  {todayApartmentDemand.map((apt) => (
                    <div key={apt.building} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{apt.building}</p>
                        <p className="text-xs text-muted-foreground">{apt.flatsCount} flats</p>
                      </div>
                      <Badge variant="secondary">{apt.deliveries} deliveries</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6">No deliveries today yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Vendor Procurement Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Vendor Procurement Summary
              <Badge variant="outline" className="ml-2 text-xs">Pending Orders</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vendorProcurement.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {vendorProcurement.map((v) => (
                  <div key={v.vendorName} className="border rounded-lg p-3 space-y-2">
                    <p className="font-semibold text-sm border-b pb-1">{v.vendorName}</p>
                    {v.items.map((item) => (
                      <div key={item.productName} className="flex items-center justify-between text-sm">
                        <span className="truncate mr-2 text-muted-foreground">{item.productName}</span>
                        <span className="font-medium shrink-0">
                          {item.qty % 1 === 0 ? item.qty : item.qty.toFixed(2)} {item.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-6">No pending procurement needed</p>
            )}
          </CardContent>
        </Card>

        {/* Category Performance + Weekly Snapshot */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Category Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {categoryData.length > 0 ? (
                <div className="space-y-2">
                  {categoryData.map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between p-2.5 bg-muted/40 rounded-lg">
                      <span className="text-sm font-medium">{cat.category}</span>
                      <span className="text-sm font-bold">{formatCurrency(cat.revenue)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6">No category data yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" /> Weekly Snapshot
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-muted/40 rounded-lg">
                  <p className="text-2xl font-bold">{stats?.weekOrders || 0}</p>
                  <p className="text-xs text-muted-foreground">Orders</p>
                </div>
                <div className="text-center p-3 bg-muted/40 rounded-lg">
                  <p className="text-lg font-bold">{formatCurrency(stats?.weekRevenue || 0)}</p>
                  <p className="text-xs text-muted-foreground">Revenue</p>
                </div>
                <div className="text-center p-3 bg-muted/40 rounded-lg">
                  <p className="text-sm font-bold truncate">{stats?.topProduct || 'N/A'}</p>
                  <p className="text-xs text-muted-foreground">Top Product</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => navigate('/admin/orders')}>
                <Plus className="h-4 w-4" />
                <span className="text-xs">Create Order</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => navigate('/admin/orders')}>
                <FileText className="h-4 w-4" />
                <span className="text-xs">Generate Invoice</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => navigate('/admin/purchase-orders')}>
                <Truck className="h-4 w-4" />
                <span className="text-xs">Purchase Order</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => navigate('/admin/bulk-upload')}>
                <Upload className="h-4 w-4" />
                <span className="text-xs">Upload Products</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex-col gap-1" onClick={() => navigate('/admin/gst-reports')}>
                <Receipt className="h-4 w-4" />
                <span className="text-xs">GST Reports</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Reminder */}
        {lowStockItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-amber-600">
                <AlertTriangle className="h-4 w-4" /> Low Stock Reminder
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {lowStockItems.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <span className="text-sm truncate mr-2">{p.name}</span>
                    <Badge variant="destructive" className="text-xs shrink-0">
                      {p.stock_quantity ?? 0} left
                    </Badge>
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
