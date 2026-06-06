import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, FileText, Wallet, IndianRupee, TrendingUp, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';
import { writeExcelFile } from '@/lib/excel-utils';
import { PO_STATUS_LABELS, PO_STATUS_STYLES } from '@/lib/po-lifecycle';
import { toast } from 'sonner';

export default function VendorLedger() {
  const [vendorId, setVendorId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  const { data: vendors } = useQuery({
    queryKey: ['vendor-ledger', 'vendors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('id, name').order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['vendor-ledger', vendorId, statusFilter, fromDate, toDate],
    queryFn: async () => {
      let q = supabase
        .from('purchase_orders')
        .select(`
          id, po_number, vendor_id, status, order_date, total_amount, paid_amount, notes,
          vendor:vendors(id, name)
        `)
        .order('order_date', { ascending: false });
      if (vendorId !== 'all') q = q.eq('vendor_id', vendorId);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      if (fromDate) q = q.gte('order_date', `${fromDate}T00:00:00`);
      if (toDate) q = q.lte('order_date', `${toDate}T23:59:59.999`);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: lastPayments } = useQuery({
    queryKey: ['vendor-ledger', 'last-payment', vendorId],
    queryFn: async () => {
      let q = supabase.from('vendor_payments').select('vendor_id, payment_date').order('payment_date', { ascending: false });
      if (vendorId !== 'all') q = q.eq('vendor_id', vendorId);
      const { data } = await q;
      const map: Record<string, string> = {};
      (data || []).forEach((p: any) => { if (!map[p.vendor_id]) map[p.vendor_id] = p.payment_date; });
      return map;
    },
  });

  const stats = useMemo(() => {
    if (!rows) return null;
    const purchase = rows.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const paid = rows.reduce((s: number, r: any) => s + Number(r.paid_amount || 0), 0);
    const openPOs = rows.filter((r: any) => !['paid', 'cancelled'].includes(r.status)).length;
    const lastPaymentDate = vendorId !== 'all' && lastPayments?.[vendorId]
      ? format(new Date(lastPayments[vendorId]), 'dd MMM yyyy') : '—';
    return { purchase, paid, outstanding: purchase - paid, openPOs, lastPaymentDate };
  }, [rows, lastPayments, vendorId]);

  const handleExport = () => {
    if (!rows?.length) { toast.error('Nothing to export'); return; }
    const data = rows.map((r: any) => {
      const orderMatch = r.notes?.match(/Order #([a-f0-9]{8})/i);
      return {
        Date: format(new Date(r.order_date), 'dd MMM yyyy'),
        'PO Number': r.po_number,
        Vendor: r.vendor?.name || '',
        'Customer Order': orderMatch ? orderMatch[1] : '',
        'Purchase Amount': Number(r.total_amount || 0),
        'Paid Amount': Number(r.paid_amount || 0),
        Outstanding: Number(r.total_amount || 0) - Number(r.paid_amount || 0),
        Status: PO_STATUS_LABELS[r.status] || r.status,
      };
    });
    writeExcelFile(`Vendor_Ledger_${format(new Date(), 'yyyy-MM-dd')}.xlsx`, [
      { name: 'Ledger', data },
    ]);
    toast.success('Exported');
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Vendor Ledger</h1>
            <p className="font-body text-muted-foreground">Procurement, payments & outstanding by vendor</p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={!rows?.length}>
            <Download className="h-4 w-4 mr-2" /> Export Excel
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />Purchase Value</CardDescription><CardTitle className="text-xl">{formatCurrency(stats?.purchase || 0)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><IndianRupee className="h-3 w-3" />Paid</CardDescription><CardTitle className="text-xl text-green-600">{formatCurrency(stats?.paid || 0)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Wallet className="h-3 w-3" />Outstanding</CardDescription><CardTitle className="text-xl text-destructive">{formatCurrency(stats?.outstanding || 0)}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><FileText className="h-3 w-3" />Open POs</CardDescription><CardTitle className="text-xl">{stats?.openPOs || 0}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription className="flex items-center gap-1"><Clock className="h-3 w-3" />Last Payment</CardDescription><CardTitle className="text-base">{stats?.lastPaymentDate || '—'}</CardTitle></CardHeader></Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-end">
            <div className="min-w-[200px]">
              <Label>Vendor</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vendors</SelectItem>
                  {vendors?.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px]">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {Object.entries(PO_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>From</Label><Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>PO #</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Customer Order</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                ) : !rows?.length ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No purchase orders</TableCell></TableRow>
                ) : rows.map((r: any) => {
                  const orderMatch = r.notes?.match(/Order #([a-f0-9]{8})/i);
                  const outstanding = Number(r.total_amount || 0) - Number(r.paid_amount || 0);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{format(new Date(r.order_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell className="font-mono">{r.po_number}</TableCell>
                      <TableCell>{r.vendor?.name || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{orderMatch ? orderMatch[1] : '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.total_amount)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatCurrency(r.paid_amount)}</TableCell>
                      <TableCell className={`text-right font-medium ${outstanding > 0 ? 'text-destructive' : ''}`}>{formatCurrency(outstanding)}</TableCell>
                      <TableCell><Badge className={PO_STATUS_STYLES[r.status]}>{PO_STATUS_LABELS[r.status] || r.status}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}