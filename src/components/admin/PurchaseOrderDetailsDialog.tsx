import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Send, XCircle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/currency';
import { PurchaseOrder } from '@/types/vendor';
import { format } from 'date-fns';

interface PurchaseOrderDetailsDialogProps {
  purchaseOrder: PurchaseOrder | null;
  onClose: () => void;
}

export function PurchaseOrderDetailsDialog({ purchaseOrder, onClose }: PurchaseOrderDetailsDialogProps) {
  const queryClient = useQueryClient();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, any> = { status };
      if (status === 'received') {
        updates.received_date = new Date().toISOString().split('T')[0];
      }
      const { error } = await supabase
        .from('purchase_orders')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
      toast.success('Status updated');
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to update status: ' + error.message);
    }
  });

  if (!purchaseOrder) return null;

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      confirmed: 'bg-indigo-100 text-indigo-800',
      partially_received: 'bg-amber-100 text-amber-800',
      received: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
      draft: 'Draft',
      sent: 'Sent',
      confirmed: 'Confirmed',
      partially_received: 'Partially Received',
      received: 'Received',
      cancelled: 'Cancelled',
    };
    return <Badge className={styles[status]}>{labels[status] || status}</Badge>;
  };

  const canSend = purchaseOrder.status === 'draft';
  const canConfirm = purchaseOrder.status === 'sent';
  const canCancel = ['draft', 'sent'].includes(purchaseOrder.status);

  return (
    <Dialog open={!!purchaseOrder} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Purchase Order: {purchaseOrder.po_number}</span>
            {getStatusBadge(purchaseOrder.status)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Info */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-sm text-muted-foreground mb-1">Vendor</h4>
              <p className="font-medium">{purchaseOrder.vendor?.name || 'Unknown'}</p>
              {purchaseOrder.vendor?.contact_person && (
                <p className="text-sm text-muted-foreground">{purchaseOrder.vendor.contact_person}</p>
              )}
              {purchaseOrder.vendor?.email && (
                <p className="text-sm text-muted-foreground">{purchaseOrder.vendor.email}</p>
              )}
              {purchaseOrder.vendor?.phone && (
                <p className="text-sm text-muted-foreground">{purchaseOrder.vendor.phone}</p>
              )}
            </div>
            <div className="space-y-2">
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Order Date</h4>
                <p>{format(new Date(purchaseOrder.order_date), 'dd MMM yyyy')}</p>
              </div>
              {purchaseOrder.expected_delivery_date && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground">Expected Delivery</h4>
                  <p>{format(new Date(purchaseOrder.expected_delivery_date), 'dd MMM yyyy')}</p>
                </div>
              )}
              {purchaseOrder.received_date && (
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground">Received Date</h4>
                  <p>{format(new Date(purchaseOrder.received_date), 'dd MMM yyyy')}</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Line Items */}
          <div>
            <h4 className="font-medium mb-3">Order Items</h4>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty Ordered</TableHead>
                    <TableHead className="text-right">Qty Received</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrder.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">
                        <span className={item.received_quantity < item.quantity ? 'text-amber-600' : 'text-green-600'}>
                          {item.received_quantity}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(item.unit_cost)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(item.total_cost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(purchaseOrder.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCurrency(purchaseOrder.tax_amount)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total</span>
                <span>{formatCurrency(purchaseOrder.total_amount)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span className="text-green-600">{formatCurrency(purchaseOrder.paid_amount)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span className="text-muted-foreground">Balance Due</span>
                <span className="text-destructive">
                  {formatCurrency(purchaseOrder.total_amount - purchaseOrder.paid_amount)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {purchaseOrder.notes && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium text-sm text-muted-foreground mb-1">Notes</h4>
                <p className="text-sm">{purchaseOrder.notes}</p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {canCancel && (
            <Button
              variant="destructive"
              onClick={() => updateStatusMutation.mutate({ id: purchaseOrder.id, status: 'cancelled' })}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <XCircle className="h-4 w-4 mr-2" />
              Cancel PO
            </Button>
          )}
          {canSend && (
            <Button
              onClick={() => updateStatusMutation.mutate({ id: purchaseOrder.id, status: 'sent' })}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" />
              Send to Vendor
            </Button>
          )}
          {canConfirm && (
            <Button
              onClick={() => updateStatusMutation.mutate({ id: purchaseOrder.id, status: 'confirmed' })}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CheckCircle className="h-4 w-4 mr-2" />
              Mark Confirmed
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
