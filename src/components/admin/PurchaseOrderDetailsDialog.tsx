import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Send, XCircle, CheckCircle, Loader2, TrendingDown, TrendingUp, Minus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/currency';
import { PurchaseOrder } from '@/types/vendor';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

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

  // Calculate totals for GRN summary
  const totalOrdered = purchaseOrder.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const totalActualReceived = purchaseOrder.items?.reduce((sum, item) => sum + (item.actual_received_weight || 0), 0) || 0;
  const hasGRNData = purchaseOrder.items?.some(item => item.actual_received_weight !== null);
  const variance = totalActualReceived - totalOrdered;
  const variancePercent = totalOrdered > 0 ? (variance / totalOrdered * 100) : 0;

  // Calculate actual value based on received weights
  const actualValue = purchaseOrder.items?.reduce((sum, item) => {
    const weight = item.actual_received_weight || 0;
    return sum + (weight * item.unit_cost);
  }, 0) || 0;

  const orderedValue = purchaseOrder.items?.reduce((sum, item) => sum + item.total_cost, 0) || 0;
  const valueVariance = actualValue - orderedValue;

  return (
    <Dialog open={!!purchaseOrder} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Purchase Order: {purchaseOrder.po_number}</span>
            {getStatusBadge(purchaseOrder.status)}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
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

            {/* Line Items with GRN columns */}
            <div>
              <h4 className="font-medium mb-3">Order Items</h4>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Ordered (kg)</TableHead>
                      <TableHead className="text-right">Actual Received</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Ordered Value</TableHead>
                      <TableHead className="text-right">Actual Value</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrder.items?.map((item) => {
                      const actualWeight = item.actual_received_weight || 0;
                      const itemVariance = actualWeight - item.quantity;
                      const itemVariancePercent = item.quantity > 0 ? (itemVariance / item.quantity * 100) : 0;
                      const actualItemValue = actualWeight * item.unit_cost;

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">
                            {actualWeight > 0 ? (
                              <span className="font-medium">{actualWeight.toFixed(2)} kg</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {actualWeight > 0 ? (
                              <span className={`flex items-center justify-end gap-1 ${
                                itemVariance > 0 ? 'text-green-600' : 
                                itemVariance < 0 ? 'text-destructive' : 'text-muted-foreground'
                              }`}>
                                {itemVariance > 0 ? (
                                  <TrendingUp className="h-3 w-3" />
                                ) : itemVariance < 0 ? (
                                  <TrendingDown className="h-3 w-3" />
                                ) : (
                                  <Minus className="h-3 w-3" />
                                )}
                                {itemVariance > 0 ? '+' : ''}{itemVariance.toFixed(2)} kg
                                <span className="text-xs">({itemVariancePercent > 0 ? '+' : ''}{itemVariancePercent.toFixed(1)}%)</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unit_cost)}/kg</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.total_cost)}</TableCell>
                          <TableCell className="text-right">
                            {actualWeight > 0 ? (
                              <span className={actualItemValue !== item.total_cost ? 'font-medium' : ''}>
                                {formatCurrency(actualItemValue)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                            {item.received_remarks || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* GRN Summary */}
            {hasGRNData && (
              <>
                <Separator />
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Goods Received Summary
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total Ordered:</span>
                      <p className="font-semibold">{totalOrdered.toFixed(2)} kg</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Actual Received:</span>
                      <p className="font-semibold">{totalActualReceived.toFixed(2)} kg</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Weight Variance:</span>
                      <p className={`font-semibold flex items-center gap-1 ${
                        variance > 0 ? 'text-green-600' : variance < 0 ? 'text-destructive' : ''
                      }`}>
                        {variance > 0 ? <TrendingUp className="h-3 w-3" /> : variance < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                        {variance > 0 ? '+' : ''}{variance.toFixed(2)} kg ({variancePercent > 0 ? '+' : ''}{variancePercent.toFixed(1)}%)
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Value Variance:</span>
                      <p className={`font-semibold ${
                        valueVariance > 0 ? 'text-green-600' : valueVariance < 0 ? 'text-destructive' : ''
                      }`}>
                        {valueVariance > 0 ? '+' : ''}{formatCurrency(valueVariance)}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-72 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Ordered Subtotal</span>
                  <span>{formatCurrency(orderedValue)}</span>
                </div>
                {hasGRNData && actualValue !== orderedValue && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Actual Subtotal</span>
                    <span className="font-medium">{formatCurrency(actualValue)}</span>
                  </div>
                )}
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
        </ScrollArea>

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
