import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  product_id: string | null;
  product_name: string;
  quantity: number;
  received_quantity: number;
  actual_received_weight: number | null;
  receiving_now: number;
  remarks: string;
  pricing_model: string;
  unit_label: string;
}

interface ReceiveOrderDialogProps {
  purchaseOrder: PurchaseOrder | null;
  onClose: () => void;
}

export function ReceiveOrderDialog({ purchaseOrder, onClose }: ReceiveOrderDialogProps) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ReceivedItem[]>([]);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);

  // Fetch products for pricing model
  const { data: products } = useQuery({
    queryKey: ['admin', 'products-for-receive'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, pricing_model, unit');
      if (error) throw error;
      return data;
    }
  });

  useEffect(() => {
    if (purchaseOrder?.items && products) {
      setItems(purchaseOrder.items.map(item => {
        const product = products?.find(p => p.id === item.product_id);
        const pricingModel = product?.pricing_model || 'weight_based';
        const unitLabel = pricingModel === 'unit_based' ? (product?.unit || 'units') : 'kg';
        return {
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          received_quantity: item.received_quantity,
          actual_received_weight: item.actual_received_weight,
          receiving_now: item.quantity - (item.actual_received_weight || 0),
          remarks: '',
          pricing_model: pricingModel,
          unit_label: unitLabel,
        };
      }));
      setReceivedDate(new Date().toISOString().split('T')[0]);
    }
  }, [purchaseOrder, products]);

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

      for (const item of items) {
        if (item.receiving_now > 0) {
          const newActualWeight = (item.actual_received_weight || 0) + item.receiving_now;
          const newReceivedCount = item.received_quantity + 1;

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

      const totalOrdered = items.reduce((sum, item) => sum + item.quantity, 0);
      const totalActualReceived = items.reduce((sum, item) =>
        sum + (item.actual_received_weight || 0) + item.receiving_now, 0);

      let newStatus: string;
      if (totalActualReceived >= totalOrdered * 0.95) {
        newStatus = 'received';
      } else if (totalActualReceived > 0) {
        newStatus = 'partially_received';
      } else {
        newStatus = purchaseOrder.status;
      }

      const updates: Record<string, any> = { status: newStatus };
      if (newStatus === 'received') {
        updates.received_date = receivedDate;
      }

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

      return { status: newStatus, totalActualReceived, totalOrdered };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
      toast.success(result?.status === 'received' ? 'Order fully received!' : 'Receipt recorded.');
      onClose();
    },
    onError: (error) => {
      toast.error('Failed to receive items: ' + error.message);
    }
  });

  const handleReceive = () => {
    const hasReceiving = items.some(item => item.receiving_now > 0);
    if (!hasReceiving) {
      toast.error('Please enter quantity received for at least one item');
      return;
    }
    receiveMutation.mutate();
  };

  if (!purchaseOrder) return null;

  const allFullyReceived = items.every(item =>
    (item.actual_received_weight || 0) >= item.quantity
  );

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
            Record actual quantities received for each item.
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

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Product</TableHead>
                      <TableHead className="text-right w-[100px]">Ordered</TableHead>
                      <TableHead className="text-right w-[100px]">Prev. Received</TableHead>
                      <TableHead className="text-right w-[100px]">Remaining</TableHead>
                      <TableHead className="text-right w-[120px]">Receiving Now</TableHead>
                      <TableHead className="w-[150px]">Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const previousActual = item.actual_received_weight || 0;
                      const remaining = item.quantity - previousActual;
                      const isComplete = remaining <= 0;
                      const isUnitBased = item.pricing_model === 'unit_based';
                      const unit = item.unit_label;

                      return (
                        <TableRow key={item.id} className={isComplete ? 'bg-muted/50' : ''}>
                          <TableCell className="font-medium">
                            {item.product_name}
                            <span className="text-xs text-muted-foreground ml-1">({unit})</span>
                          </TableCell>
                          <TableCell className="text-right">{Number(item.quantity).toFixed(2)} {unit}</TableCell>
                          <TableCell className="text-right">
                            {previousActual > 0 ? `${previousActual.toFixed(2)} ${unit}` : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={remaining > 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>
                              {remaining.toFixed(2)} {unit}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {isComplete ? (
                              <span className="text-green-600 text-sm">Complete</span>
                            ) : (
                              <Input
                                type="number"
                                step={isUnitBased ? "1" : "0.01"}
                                min="0"
                                value={item.receiving_now || ''}
                                onChange={(e) => updateReceivingWeight(item.id, 
                                  isUnitBased 
                                    ? Math.max(0, parseInt(e.target.value) || 0)
                                    : parseFloat(e.target.value) || 0
                                )}
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
                    <p className="font-semibold">{totalOrdered.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Previously Received:</span>
                    <p className="font-semibold">{totalPreviouslyReceived.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Receiving Now:</span>
                    <p className="font-semibold text-primary">{totalReceivingNow.toFixed(2)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">After Receiving:</span>
                    <p className="font-semibold">{totalAfterReceiving.toFixed(2)}</p>
                  </div>
                </div>

                {totalReceivingNow > 0 && (
                  <div className="pt-2 border-t flex items-center gap-2">
                    <span className="text-muted-foreground text-sm">Variance:</span>
                    <Badge
                      variant={variance === 0 ? 'secondary' : variance > 0 ? 'default' : 'destructive'}
                      className="flex items-center gap-1"
                    >
                      {variance > 0 ? <TrendingUp className="h-3 w-3" /> : variance < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      {variance > 0 ? '+' : ''}{variance.toFixed(2)} ({variancePercent > 0 ? '+' : ''}{variancePercent.toFixed(1)}%)
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
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
