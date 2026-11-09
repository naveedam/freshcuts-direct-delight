import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabase-paginate';
import { PageFrame, StickyTop } from '@/components/admin/TabbedAdminPage';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { writeExcelFile } from '@/lib/excel-utils';
import { toast } from 'sonner';

const INVOICED = new Set(['processing', 'shipped', 'delivered', 'completed']);

export default function VendorProfitability({ embedded = false }: { embedded?: boolean } = {}) {
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const { data: orders } = useQuery({
    queryKey: ['vendor-profit', 'orders', fromDate, toDate],
    queryFn: async () => {
      let q = supabase
        .from('orders')
        .select('id, status, converted_to_sale, invoice_cancelled, created_at');
      if (fromDate) q = q.gte('created_at', `${fromDate}T00:00:00`);
      if (toDate) q = q.lte('created_at', `${toDate}T23:59:59.999`);
      return await fetchAllRows<any>(() => q);
    },
  });

  const { data: items } = useQuery({
    queryKey: ['vendor-profit', 'items'],
    queryFn: async () => {
      return await fetchAllRows<any>(() =>
        supabase.from('order_items').select('order_id, vendor_id, quantity, actual_weight, unit_price, total_price, vendor_cost')
      );
    },
  });

  const { data: vendors } = useQuery({
    queryKey: ['vendor-profit', 'vendors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const rows = useMemo(() => {
    if (!orders || !items || !vendors) return [];
    const invoicedIds = new Set(
      orders
        .filter((o: any) => !o.invoice_cancelled && o.status !== 'cancelled' && (o.converted_to_sale || INVOICED.has(o.status)))
        .map((o: any) => o.id),
    );
    const byVendor = new Map<string, { sales: number; cost: number }>();
    for (const it of items as any[]) {
      if (!it.vendor_id || !invoicedIds.has(it.order_id)) continue;
      const qty = Number(it.actual_weight ?? it.quantity) || 0;
      const sales = Number(it.total_price) || 0;
      const cost = qty * (Number(it.vendor_cost) || 0);
      const cur = byVendor.get(it.vendor_id) || { sales: 0, cost: 0 };
      cur.sales += sales;
      cur.cost += cost;
      byVendor.set(it.vendor_id, cur);
    }
    return vendors
      .map(v => {
        const x = byVendor.get(v.id);
        if (!x) return null;
        const margin = x.sales - x.cost;
        const marginPct = x.sales > 0 ? (margin / x.sales) * 100 : 0;
        return { vendor: v.name, sales: x.sales, cost: x.cost, margin, marginPct };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b!.margin - a!.margin) as any[];
  }, [orders, items, vendors]);

  const handleExport = () => {
    if (!rows.length) { toast.error('Nothing to export'); return; }
    writeExcelFile(`Vendor_Profitability_${format(new Date(), 'yyyy-MM-dd')}.xlsx`, [
      { name: 'Profitability', data: rows.map(r => ({
        Vendor: r.vendor,
        'Sales Value': r.sales,
        'Vendor Cost': r.cost,
        'Gross Margin': r.margin,
        'Margin %': Number(r.marginPct.toFixed(2)),
      })) },
    ]);
    toast.success('Exported');
  };

  return (
    <PageFrame embedded={embedded}>
      <div className="space-y-4">
        <StickyTop>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Vendor Profitability</h1>
            <p className="font-body text-muted-foreground">Sales vs vendor cost margin</p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-2" /> Export Excel
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div><Label>From</Label><Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></div>
          </CardContent>
        </Card>

        </StickyTop>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!rows.length ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No data for selected range</TableCell></TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.vendor}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.sales)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.cost)}</TableCell>
                    <TableCell className={`text-right font-medium ${r.margin >= 0 ? 'text-green-600' : 'text-destructive'}`}>{formatCurrency(r.margin)}</TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-1">
                      <TrendingUp className="h-3 w-3 opacity-60" />
                      {r.marginPct.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}