import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Loader2, Eye, Package, Trash2, FileText, PackageCheck, Calendar, Download, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/currency';
import { PurchaseOrder, Vendor } from '@/types/vendor';
import { format } from 'date-fns';
import { PurchaseOrderDialog } from '@/components/admin/PurchaseOrderDialog';
import { PurchaseOrderDetailsDialog } from '@/components/admin/PurchaseOrderDetailsDialog';
import { ReceiveOrderDialog } from '@/components/admin/ReceiveOrderDialog';
import { VendorPaymentsDialog } from '@/components/admin/VendorPaymentsDialog';
import { writeExcelFile } from '@/lib/excel-utils';

type POStatus = 'draft' | 'sent' | 'confirmed' | 'partially_received' | 'received' | 'cancelled';
type PaymentStatus = 'pending' | 'partial' | 'paid';

export default function PurchaseOrdersAdmin() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);
  const [viewingPO, setViewingPO] = useState<PurchaseOrder | null>(null);
  const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');

  const { data: purchaseOrders, isLoading } = useQuery({
    queryKey: ['admin', 'purchase-orders', statusFilter, paymentFilter],
    queryFn: async () => {
      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          vendor:vendors(id, name, contact_person, email, phone),
          items:purchase_order_items(*)
        `)
        .order('created_at', { ascending: false });
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
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

      return {
        total: data.length,
        draft: data.filter(po => po.status === 'draft').length,
        pending: data.filter(po => ['sent', 'confirmed'].includes(po.status)).length,
        received: data.filter(po => po.status === 'received').length,
        totalValue: data.reduce((sum, po) => sum + (po.total_amount || 0), 0),
        unpaid: data.filter(po => po.payment_status === 'pending').reduce((sum, po) => sum + (po.total_amount || 0), 0),
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

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
      sent: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
      confirmed: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-100',
      partially_received: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
      received: 'bg-green-100 text-green-800 hover:bg-green-100',
      cancelled: 'bg-red-100 text-red-800 hover:bg-red-100',
    };
    const labels: Record<string, string> = {
      draft: 'Draft',
      sent: 'Sent',
      confirmed: 'Confirmed',
      partially_received: 'Partially Received',
      received: 'Received',
      cancelled: 'Cancelled',
    };
    return <Badge className={styles[status] || 'bg-gray-100 text-gray-800'}>{labels[status] || status}</Badge>;
  };

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
            <Button variant="outline" onClick={exportToExcel} disabled={!purchaseOrders?.length}>
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create PO
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total POs</CardDescription>
              <CardTitle className="text-2xl">{stats?.total || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Draft</CardDescription>
              <CardTitle className="text-2xl">{stats?.draft || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending</CardDescription>
              <CardTitle className="text-2xl">{stats?.pending || 0}</CardTitle>
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
        <div className="flex gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="partially_received">Partially Received</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
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
        </div>

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
    </AdminLayout>
  );
}
