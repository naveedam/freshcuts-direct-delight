import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PackageCheck, Loader2, AlertCircle, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { PurchaseOrder } from '@/types/vendor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ReceivedItem {
  id: string;
  product_name: string;
  quantity: number; // Ordered quantity (kg)
  received_quantity: number; // Previously received (count)
  actual_received_weight: number | null; // Previously received actual weight
  receiving_now: number; // Actual weight being received now (kg)
  remarks: string;
}

interface ReceiveOrderDialogProps {
  purchaseOrder: PurchaseOrder | null;
  onClose: () => void;
}

export function ReceiveOrderDialog({ purchaseOrder, onClose }: ReceiveOrderDialogProps) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ReceivedItem[]>([]);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (purchaseOrder?.items) {
      setItems(purchaseOrder.items.map(item => ({
        id: item.id,
        product_name: item.product_name,
        quantity: item.quantity, // Ordered qty in kg
        received_quantity: item.received_quantity,
        actual_received_weight: item.actual_received_weight,
        receiving_now: item.quantity - (item.actual_received_weight || 0), // Default to remaining
        remarks: '',
      })));
      setReceivedDate(new Date().toISOString().split('T')[0]);
    }
  }, [purchaseOrder]);

  const updateReceivingWeight = (id: string, weight: number) => {
    setItems(items.map(item =>
      item.id === id
        ? { ...item, receiving_now: Math.max(0, weight) }
        : item
    ));
  };

  const updateRemarks = (id: string, remarks: string) => {
    setItems(items.map(item =>
      item.id === id ? { ...item, remarks } : item
    ));
  };

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!purchaseOrder) return;

      // Update each item's actual received weight
      for (const item of items) {
        if (item.receiving_now > 0) {
          const newActualWeight = (item.actual_received_weight || 0) + item.receiving_now;
          const newReceivedCount = item.received_quantity + 1; // Increment received count

          const { error } = await supabase
            .from('purchase_order_items')
            .update({
              actual_received_weight: newActualWeight,
              received_quantity: newReceivedCount,
              received_remarks: item.remarks || null,
              received_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          if (error) throw error;
        }
      }

      // Calculate new totals based on actual received weights
      const totalOrdered = items.reduce((sum, item) => sum + item.quantity, 0);
      const totalActualReceived = items.reduce((sum, item) =>
        sum + (item.actual_received_weight || 0) + item.receiving_now, 0);

      // Determine status based on actual received weights
      // If all items have been received (at least partially), mark as received
      const allItemsReceived = items.every(item =>
        ((item.actual_received_weight || 0) + item.receiving_now) > 0
      );

      let newStatus: string;
      if (totalActualReceived >= totalOrdered * 0.95) {
        // Within 5% tolerance, consider fully received
        newStatus = 'received';
      } else if (totalActualReceived > 0) {
        newStatus = 'partially_received';
      } else {
        newStatus = purchaseOrder.status;
      }

      const updates: Record<string, any> = {
        status: newStatus,
      };

      if (newStatus === 'received') {
        updates.received_date = receivedDate;
      }

      // Recalculate total based on actual received weight
      const actualTotalValue = items.reduce((sum, item) => {
        const actualWeight = (item.actual_received_weight || 0) + item.receiving_now;
        const itemFromPO = purchaseOrder.items?.find(i => i.id === item.id);
        const unitCost = itemFromPO?.unit_cost || 0;
        return sum + (actualWeight * unitCost);
      }, 0);

      updates.subtotal = actualTotalValue;
      updates.total_amount = actualTotalValue + (purchaseOrder.tax_amount || 0);

      const { error: poError } = await supabase
        .from('purchase_orders')
        .update(updates)
        .eq('id', purchaseOrder.id);

      if (poError) throw poError;

      return {
        status: newStatus,
        totalActualReceived,
        totalOrdered,
        variance: totalActualReceived - totalOrdered,
        variancePercent: ((totalActualReceived - totalOrdered) / totalOrdered * 100).toFixed(1)
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });

      if (result?.status === 'received') {
        const varianceMsg = result.variance !== 0
          ? ` (Variance: ${result.variance > 0 ? '+' : ''}${result.variance.toFixed(2)} kg / ${result.variancePercent}%)`
          : '';
        toast.success(`Order received! Actual: ${result.totalActualReceived.toFixed(2)} kg${varianceMsg}`);
      } else {
        toast.success(`Received ${result?.totalActualReceived.toFixed(2)} kg of ${result?.totalOrdered} kg ordered`);
      }
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to receive items: ' + error.message);
    }
  });

  const handleReceive = () => {
    const hasReceiving = items.some(item => item.receiving_now > 0);
    if (!hasReceiving) {
      toast.error('Please enter weight received for at least one item');
      return;
    }
    receiveMutation.mutate();
  };

  if (!purchaseOrder) return null;

  const allFullyReceived = items.every(item =>
    (item.actual_received_weight || 0) >= item.quantity
  );

  // Calculate totals for display
  const totalOrdered = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPreviouslyReceived = items.reduce((sum, item) => sum + (item.actual_received_weight || 0), 0);
  const totalReceivingNow = items.reduce((sum, item) => sum + item.receiving_now, 0);
  const totalAfterReceiving = totalPreviouslyReceived + totalReceivingNow;
  const variance = totalAfterReceiving - totalOrdered;
  const variancePercent = totalOrdered > 0 ? (variance / totalOrdered * 100) : 0;

  return (
    <Dialog open={!!purchaseOrder} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            Goods Received Note: {purchaseOrder.po_number}
          </DialogTitle>
          <DialogDescription>
            Record actual weights received for each item. Decimals allowed (e.g., 9.45 kg).
          </DialogDescription>
        </DialogHeader>

        {allFullyReceived ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              All items have been fully received for this order.
            </AlertDescription>
          </Alert>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pr-4">
              {/* Received Date */}
              <div className="flex items-center gap-4">
                <Label htmlFor="received-date" className="whitespace-nowrap">Received Date:</Label>
                <Input
                  id="received-date"
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className="w-48"
                />
              </div>

              {/* Items Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Product</TableHead>
                      <TableHead className="text-right w-[100px]">Ordered Qty (kg)</TableHead>
                      <TableHead className="text-right w-[100px]">Prev. Received (kg)</TableHead>
                      <TableHead className="text-right w-[100px]">Remaining (kg)</TableHead>
                      <TableHead className="text-right w-[120px]">Receiving Now (kg)</TableHead>
                      <TableHead className="w-[150px]">Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const previousActual = item.actual_received_weight || 0;
                      const remaining = item.quantity - previousActual;
                      const isComplete = remaining <= 0;
                      const itemVariance = item.receiving_now - remaining;

                      return (
                        <TableRow key={item.id} className={isComplete ? 'bg-muted/50' : ''}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-right">{Number(item.quantity).toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            {previousActual > 0 ? previousActual.toFixed(2) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={remaining > 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>
                              {remaining.toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {isComplete ? (
                              <span className="text-green-600 text-sm">Complete</span>
                            ) : (
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={item.receiving_now || ''}
                                onChange={(e) => updateReceivingWeight(item.id, parseFloat(e.target.value) || 0)}
                                className="w-24 text-right ml-auto"
                                placeholder="0.00"
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {!isComplete && (
                              <Input
                                type="text"
                                value={item.remarks}
                                onChange={(e) => updateRemarks(item.id, e.target.value)}
                                className="w-full text-sm"
                                placeholder="Shortage, excess..."
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Ordered:</span>
                    <p className="font-semibold">{totalOrdered.toFixed(2)} kg</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Previously Received:</span>
                    <p className="font-semibold">{totalPreviouslyReceived.toFixed(2)} kg</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Receiving Now:</span>
                    <p className="font-semibold text-primary">{totalReceivingNow.toFixed(2)} kg</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">After Receiving:</span>
                    <p className="font-semibold">{totalAfterReceiving.toFixed(2)} kg</p>
                  </div>
                </div>

                {totalReceivingNow > 0 && (
                  <div className="pt-2 border-t flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">Variance:</span>
                    <Badge
                      variant={variance === 0 ? 'secondary' : variance > 0 ? 'default' : 'destructive'}
                      className="flex items-center gap-1"
                    >
                      {variance > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : variance < 0 ? (
                        <TrendingDown className="h-3 w-3" />
                      ) : (
                        <Minus className="h-3 w-3" />
                      )}
                      {variance > 0 ? '+' : ''}{variance.toFixed(2)} kg ({variancePercent > 0 ? '+' : ''}{variancePercent.toFixed(1)}%)
                    </Badge>
                    {variance < 0 && (
                      <span className="text-sm text-destructive">Shortage</span>
                    )}
                    {variance > 0 && (
                      <span className="text-sm text-green-600">Excess</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {!allFullyReceived && (
            <Button onClick={handleReceive} disabled={receiveMutation.isPending}>
              {receiveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <PackageCheck className="h-4 w-4 mr-2" />
              Confirm Receipt
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
