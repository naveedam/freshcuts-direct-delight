import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Loader2, Eye, Package, Trash2, FileText, PackageCheck, Calendar, Download, CreditCard, Send, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/currency';
import { PurchaseOrder, Vendor } from '@/types/vendor';
import { format } from 'date-fns';
import { PurchaseOrderDialog } from '@/components/admin/PurchaseOrderDialog';
import { PurchaseOrderDetailsDialog } from '@/components/admin/PurchaseOrderDetailsDialog';
import { ReceiveOrderDialog } from '@/components/admin/ReceiveOrderDialog';
import { VendorPaymentsDialog } from '@/components/admin/VendorPaymentsDialog';
import { VendorDailySummaryDialog } from '@/components/admin/VendorDailySummaryDialog';
import { writeExcelFile } from '@/lib/excel-utils';
import { PO_STATUS_LABELS, PO_STATUS_STYLES, ACTIVE_PO_STATUSES, ARCHIVED_PO_STATUSES, markPOsPayableOnInvoice } from '@/lib/po-lifecycle';

export default function PurchaseOrdersAdmin() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [viewingPO, setViewingPO] = useState<PurchaseOrder | null>(null);
  const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [payingPO, setPayingPO] = useState<PurchaseOrder | null>(null);
  const [vendorFilter, setVendorFilter] = useState<string>('all');
  const [weeklyPaymentOpen, setWeeklyPaymentOpen] = useState(false);
  const [weeklyPayAmount, setWeeklyPayAmount] = useState('');
  const [weeklyPayMethod, setWeeklyPayMethod] = useState('bank_transfer');
  const [weeklyPayRef, setWeeklyPayRef] = useState('');
  const [weeklyPayNotes, setWeeklyPayNotes] = useState('');
  const [weeklyPayLoading, setWeeklyPayLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [vendorSummaryOpen, setVendorSummaryOpen] = useState(false);

  const { data: purchaseOrders, isLoading } = useQuery({
    queryKey: ['admin', 'purchase-orders', statusFilter, paymentFilter, showArchived, fromDate, toDate, vendorFilter],
    queryFn: async () => {
      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          vendor:vendors(id, name, contact_person, email, phone)
        `)
        .order('order_date', { ascending: false });
      if (fromDate) query = query.gte('order_date', fromDate);
      if (toDate) query = query.lte('order_date', toDate);
      if (vendorFilter !== 'all') query = query.eq('vendor_id', vendorFilter);
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      } else if (!showArchived) {
        query = query.in('status', ACTIVE_PO_STATUSES);
      }
      if (paymentFilter !== 'all') {
        query = query.eq('payment_status', paymentFilter);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as PurchaseOrder[];
    }
  });

  const { data: stats } = useQuery({
    queryKey: ['admin', 'purchase-order-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('status, payment_status, total_amount');
      
      if (error) throw error;

      const active = data.filter(po => po.status !== 'cancelled');
      return {
        total: active.length,
        received: active.filter(po => po.status === 'received').length,
        payable: active.filter(po => po.status === 'payable').length,
        paid: active.filter(po => po.status === 'paid').length,
        totalValue: active.reduce((sum, po) => sum + (po.total_amount || 0), 0),
        unpaid: active.filter(po => po.payment_status === 'pending').reduce((sum, po) => sum + (po.total_amount || 0), 0),
      };
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Delete items first
      await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id);
      const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
      toast.success('Purchase order deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete: ' + error.message);
    }
  });

  const { data: vendors } = useQuery({
    queryKey: ['admin', 'vendors-for-po-filter'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('id, name').eq('status', 'active').order('name');
      if (error) throw error;
      return data || [];
    }
  });

  const handleWeeklyPayment = async () => {
    if (!vendorFilter || vendorFilter === 'all') return;
    if (!weeklyPayAmount || parseFloat(weeklyPayAmount) <= 0) return;
    setWeeklyPayLoading(true);
    try {
      await supabase.from('vendor_payments').insert({
        vendor_id: vendorFilter,
        amount: parseFloat(weeklyPayAmount),
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: weeklyPayMethod,
        reference_number: weeklyPayRef || null,
        notes: weeklyPayNotes || null,
      });
      const pendingPOs = (purchaseOrders || []).filter(p => p.payment_status === 'pending');
      const poIds = pendingPOs.map(po => po.id);
      for (const po of pendingPOs) {
        await supabase.from('purchase_orders')
          .update({ payment_status: 'paid', paid_amount: po.total_amount })
          .eq('id', po.id);
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
      toast.success('Payment recorded — ' + (poIds.length) + ' POs marked paid');
      setWeeklyPaymentOpen(false);
      setWeeklyPayAmount('');
      setWeeklyPayRef('');
      setWeeklyPayNotes('');
    } catch (err: any) {
      toast.error('Failed: ' + err.message);
    }
    setWeeklyPayLoading(false);
  };

  const exportToExcel = () => {
    if (!purchaseOrders?.length) {
      toast.error('No purchase orders to export');
      return;
    }

    const exportData = purchaseOrders.map(po => ({
      'PO Number': po.po_number,
      'Vendor': po.vendor?.name || 'Unknown',
      'Order Date': format(new Date(po.order_date), 'dd MMM yyyy'),
      'Expected Delivery': po.expected_delivery_date 
        ? format(new Date(po.expected_delivery_date), 'dd MMM yyyy') 
        : '-',
      'Status': po.status.replace('_', ' ').toUpperCase(),
      'Payment Status': po.payment_status.toUpperCase(),
      'Subtotal': po.subtotal,
      'Tax Amount': po.tax_amount,
      'Total Amount': po.total_amount,
      'Paid Amount': po.paid_amount || 0,
      'Notes': po.notes || '',
    }));

    writeExcelFile(`Purchase_Orders_${format(new Date(), 'yyyy-MM-dd')}.xlsx`, [
      { name: 'Purchase Orders', data: exportData }
    ]);
    toast.success('Purchase orders exported successfully');
  };

  const getStatusBadge = (status: string) => (
    <Badge className={PO_STATUS_STYLES[status] || 'bg-gray-100 text-gray-800'}>
      {PO_STATUS_LABELS[status] || status}
    </Badge>
  );

  const getPaymentBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
      partial: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
      paid: 'bg-green-100 text-green-800 hover:bg-green-100',
    };
    return <Badge className={styles[status] || 'bg-gray-100 text-gray-800'}>{status}</Badge>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">Purchase Orders</h1>
            <p className="font-body text-muted-foreground">Manage orders to your vendors</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setVendorSummaryOpen(true)}>
              <Send className="h-4 w-4 mr-2" />
              Vendor Summary
            </Button>
            <Button variant="outline" onClick={exportToExcel} disabled={!purchaseOrders?.length}>
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>

          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active POs</CardDescription>
              <CardTitle className="text-2xl">{stats?.total || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Received</CardDescription>
              <CardTitle className="text-2xl">{stats?.received || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Payable</CardDescription>
              <CardTitle className="text-2xl">{stats?.payable || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Paid</CardDescription>
              <CardTitle className="text-2xl">{stats?.paid || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Value</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(stats?.totalValue || 0)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Unpaid</CardDescription>
              <CardTitle className="text-2xl text-destructive">{formatCurrency(stats?.unpaid || 0)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">From</Label>
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-36" />
            <Label className="text-sm whitespace-nowrap">To</Label>
            <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-36" />
            <Button variant="ghost" size="sm" onClick={() => { setFromDate(''); setToDate(''); }} className="text-xs">Clear</Button>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(PO_STATUS_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendors?.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={showArchived ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowArchived(s => !s)}
          >
            {showArchived ? 'Hide archived' : 'Show archived (paid/cancelled)'}
          </Button>
          {vendorFilter !== 'all' && (
            <Button
              variant="default"
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => setWeeklyPaymentOpen(true)}
            >
              <Wallet className="h-4 w-4 mr-1" /> Record Payment
            </Button>
          )}
        </div>

        {/* Weekly Payment Dialog */}
        {weeklyPaymentOpen && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-green-800">Record Vendor Payment — {vendors?.find(v => v.id === vendorFilter)?.name}</h3>
                <Button variant="ghost" size="sm" onClick={() => setWeeklyPaymentOpen(false)}>✕</Button>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <Label className="text-xs">Amount (₹)</Label>
                  <Input type="number" value={weeklyPayAmount} onChange={e => setWeeklyPayAmount(e.target.value)} className="w-32" placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-xs">Method</Label>
                  <Select value={weeklyPayMethod} onValueChange={setWeeklyPayMethod}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Reference / UTR</Label>
                  <Input value={weeklyPayRef} onChange={e => setWeeklyPayRef(e.target.value)} className="w-40" placeholder="Optional" />
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input value={weeklyPayNotes} onChange={e => setWeeklyPayNotes(e.target.value)} className="w-48" placeholder="e.g. Week 15-21 Jun" />
                </div>
                <Button onClick={handleWeeklyPayment} disabled={weeklyPayLoading} className="bg-green-600 hover:bg-green-700">
                  {weeklyPayLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wallet className="h-4 w-4 mr-1" />}
                  Confirm Payment
                </Button>
              </div>
              <p className="text-xs text-green-700 mt-2">This will record the payment and mark all pending POs in the current filter as paid.</p>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !purchaseOrders?.length ? (
              <div className="p-12 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No purchase orders found</p>
                <Button variant="link" onClick={() => setCreateDialogOpen(true)}>
                  Create your first PO
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Expected Delivery</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-mono font-medium">{po.po_number}</TableCell>
                      <TableCell>{po.vendor?.name || 'Unknown'}</TableCell>
                      <TableCell>{format(new Date(po.order_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell>
                        {po.expected_delivery_date 
                          ? format(new Date(po.expected_delivery_date), 'dd MMM yyyy')
                          : '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(po.status)}</TableCell>
                      <TableCell>{getPaymentBadge(po.payment_status)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(po.total_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewingPO(po)}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {['sent', 'confirmed', 'partially_received'].includes(po.status) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setReceivingPO(po)}
                              title="Receive Order"
                            >
                              <PackageCheck className="h-4 w-4" />
                            </Button>
                          )}
                          {po.payment_status !== 'paid' && po.status !== 'cancelled' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPayingPO(po)}
                              title="Pay Vendor"
                            >
                              <CreditCard className="h-4 w-4" />
                            </Button>
                          )}
                          {po.status === 'draft' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingPO(po)}
                                title="Edit"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  if (confirm('Delete this purchase order?')) {
                                    deleteMutation.mutate(po.id);
                                  }
                                }}
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <PurchaseOrderDialog
        open={createDialogOpen || !!editingPO}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false);
            setEditingPO(null);
          }
        }}
        purchaseOrder={editingPO}
      />

      {/* View Details Dialog */}
      <PurchaseOrderDetailsDialog
        purchaseOrder={viewingPO}
        onClose={() => setViewingPO(null)}
      />

      {/* Receive Order Dialog */}
      <ReceiveOrderDialog
        purchaseOrder={receivingPO}
        onClose={() => setReceivingPO(null)}
      />

      {/* Vendor Payment Dialog */}
      {payingPO && payingPO.vendor && (
        <VendorPaymentsDialog
          vendor={payingPO.vendor as any}
          open={!!payingPO}
          onOpenChange={(open) => { if (!open) setPayingPO(null); }}
          preselectedPoId={payingPO.id}
        />
      )}

      <VendorDailySummaryDialog open={vendorSummaryOpen} onOpenChange={setVendorSummaryOpen} />
    </AdminLayout>
  );
}
