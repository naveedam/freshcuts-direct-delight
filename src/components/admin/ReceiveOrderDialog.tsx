import { useState, useEffect, useMemo } from 'react';
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

interface OrderItemRef {
  order_item_id: string;
  order_id: string;
  flat_number: string;
  building_name: string;
  ordered_qty: number;
  product_name: string;
}

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
  // Order-level breakdown
  orderBreakdown: OrderBreakdownItem[];
}

interface OrderBreakdownItem {
  order_item_id: string;
  order_id: string;
  flat_number: string;
  building_name: string;
  ordered_qty: number;
  current_actual: number;
  receiving_now: number;
}

interface ReceiveOrderDialogProps {
  purchaseOrder: PurchaseOrder | null;
  onClose: () => void;
}

export function ReceiveOrderDialog({ purchaseOrder, onClose }: ReceiveOrderDialogProps) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ReceivedItem[]>([]);
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

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

  // Fetch order items linked to this PO's products to show per-order/flat breakdown
  const { data: linkedOrderItems } = useQuery({
    queryKey: ['admin', 'po-linked-order-items', purchaseOrder?.id],
    queryFn: async () => {
      if (!purchaseOrder?.items) return [];
      const productIds = purchaseOrder.items.map(i => i.product_id).filter(Boolean);
      if (productIds.length === 0) return [];

      // Get order items with matching products from pending/processing orders
      const { data: orderItems, error } = await supabase
        .from('order_items')
        .select('id, order_id, product_id, product_name, quantity, actual_weight, billed_weight')
        .in('product_id', productIds as string[]);
      if (error) throw error;

      if (!orderItems || orderItems.length === 0) return [];

      // Get order details for flat/building info
      const orderIds = [...new Set(orderItems.map(i => i.order_id))];
      const { data: orders } = await supabase
        .from('orders')
        .select('id, flat_number, building_name, status')
        .in('id', orderIds)
        .in('status', ['pending', 'processing']);

      if (!orders) return [];
      const orderMap = new Map(orders.map(o => [o.id, o]));

      return orderItems
        .filter(oi => orderMap.has(oi.order_id))
        .map(oi => {
          const order = orderMap.get(oi.order_id)!;
          return {
            order_item_id: oi.id,
            order_id: oi.order_id,
            product_id: oi.product_id,
            product_name: oi.product_name,
            ordered_qty: Number(oi.quantity),
            current_actual: Number(oi.actual_weight || 0),
            flat_number: order.flat_number || '',
            building_name: order.building_name || '',
          };
        });
    },
    enabled: !!purchaseOrder?.items,
  });

  useEffect(() => {
    if (purchaseOrder?.items && products) {
      setItems(purchaseOrder.items.map(item => {
        const product = products?.find(p => p.id === item.product_id);
        const pricingModel = product?.pricing_model || 'weight_based';
        const unitLabel = pricingModel === 'unit_based' ? (product?.unit || 'units') : 'kg';

        // Build order-level breakdown for this product
        const breakdown: OrderBreakdownItem[] = (linkedOrderItems || [])
          .filter(oi => oi.product_id === item.product_id)
          .map(oi => ({
            order_item_id: oi.order_item_id,
            order_id: oi.order_id,
            flat_number: oi.flat_number,
            building_name: oi.building_name,
            ordered_qty: oi.ordered_qty,
            current_actual: oi.current_actual,
            receiving_now: oi.ordered_qty - oi.current_actual, // default to remaining
          }));

        const totalRemaining = item.quantity - (item.actual_received_weight || 0);

        return {
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          received_quantity: item.received_quantity,
          actual_received_weight: item.actual_received_weight,
          receiving_now: breakdown.length > 0
            ? breakdown.reduce((s, b) => s + Math.max(0, b.receiving_now), 0)
            : Math.max(0, totalRemaining),
          remarks: '',
          pricing_model: pricingModel,
          unit_label: unitLabel,
          orderBreakdown: breakdown,
        };
      }));
      setReceivedDate(new Date().toISOString().split('T')[0]);
      // Auto-expand products that have breakdown
      const expanded = new Set<string>();
      purchaseOrder.items.forEach(item => {
        const hasBreakdown = (linkedOrderItems || []).some(oi => oi.product_id === item.product_id);
        if (hasBreakdown) expanded.add(item.id);
      });
      setExpandedProducts(expanded);
    }
  }, [purchaseOrder, products, linkedOrderItems]);

  const updateBreakdownReceiving = (itemId: string, orderItemId: string, value: number) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const newBreakdown = item.orderBreakdown.map(b =>
        b.order_item_id === orderItemId ? { ...b, receiving_now: Math.max(0, value) } : b
      );
      return {
        ...item,
        orderBreakdown: newBreakdown,
        receiving_now: newBreakdown.reduce((s, b) => s + b.receiving_now, 0),
      };
    }));
  };

  const updateReceivingWeight = (id: string, weight: number) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, receiving_now: Math.max(0, weight) } : item
    ));
  };

  const updateRemarks = (id: string, remarks: string) => {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, remarks } : item
    ));
  };

  const toggleExpand = (itemId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
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

          // Update per-order actual_weight and billed_weight
          for (const bd of item.orderBreakdown) {
            if (bd.receiving_now > 0) {
              const newActual = bd.current_actual + bd.receiving_now;
              const { error: oiErr } = await supabase
                .from('order_items')
                .update({
                  actual_weight: newActual,
                  billed_weight: newActual, // default billed = actual
                })
                .eq('id', bd.order_item_id);
              if (oiErr) console.error('Failed to update order item', oiErr);
            }
          }
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orderItems'] });
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
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            Goods Received Note: {purchaseOrder.po_number}
          </DialogTitle>
          <DialogDescription>
            Record actual quantities received for each item. Expand products to enter per-order/flat quantities.
          </DialogDescription>
        </DialogHeader>

        {allFullyReceived ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>All items have been fully received for this order.</AlertDescription>
          </Alert>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pr-4">
              <div className="flex items-center gap-4">
                <Label htmlFor="received-date" className="whitespace-nowrap">Received Date:</Label>
                <Input id="received-date" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="w-48" />
              </div>

              <div className="space-y-3">
                {items.map((item) => {
                  const previousActual = item.actual_received_weight || 0;
                  const remaining = item.quantity - previousActual;
                  const isComplete = remaining <= 0;
                  const isUnitBased = item.pricing_model === 'unit_based';
                  const unit = item.unit_label;
                  const hasBreakdown = item.orderBreakdown.length > 0;
                  const isExpanded = expandedProducts.has(item.id);

                  return (
                    <div key={item.id} className={`border rounded-lg ${isComplete ? 'bg-muted/50' : ''}`}>
                      {/* Product header row */}
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
                        onClick={() => hasBreakdown && !isComplete && toggleExpand(item.id)}
                      >
                        <div className="flex items-center gap-3">
                          {hasBreakdown && !isComplete && (
                            <span className="text-xs text-muted-foreground">{isExpanded ? '▼' : '▶'}</span>
                          )}
                          <div>
                            <span className="font-medium text-sm">{item.product_name}</span>
                            <span className="text-xs text-muted-foreground ml-1">({unit})</span>
                            {hasBreakdown && (
                              <Badge variant="outline" className="ml-2 text-xs">{item.orderBreakdown.length} orders</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="text-right">
                            <span className="text-muted-foreground">Ordered: </span>
                            <span className="font-medium">{Number(item.quantity).toFixed(2)} {unit}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-muted-foreground">Prev: </span>
                            <span>{previousActual > 0 ? `${previousActual.toFixed(2)} ${unit}` : '-'}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-muted-foreground">Remaining: </span>
                            <span className={remaining > 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>
                              {remaining.toFixed(2)} {unit}
                            </span>
                          </div>
                          {!hasBreakdown && !isComplete && (
                            <div className="flex items-center gap-2">
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
                                className="w-24 text-right"
                                placeholder="0.00"
                                onClick={e => e.stopPropagation()}
                              />
                              <Input
                                type="text"
                                value={item.remarks}
                                onChange={(e) => updateRemarks(item.id, e.target.value)}
                                className="w-28 text-sm"
                                placeholder="Remarks"
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                          )}
                          {isComplete && (
                            <Badge variant="secondary" className="text-green-600">Complete</Badge>
                          )}
                          {hasBreakdown && !isComplete && (
                            <div className="text-right">
                              <span className="text-muted-foreground">Receiving: </span>
                              <span className="font-bold text-primary">{item.receiving_now.toFixed(2)} {unit}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Per-order breakdown */}
                      {hasBreakdown && isExpanded && !isComplete && (
                        <div className="border-t px-3 pb-3">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Order</TableHead>
                                <TableHead className="text-xs">Building</TableHead>
                                <TableHead className="text-xs">Flat</TableHead>
                                <TableHead className="text-right text-xs">Ordered ({unit})</TableHead>
                                <TableHead className="text-right text-xs">Prev. Received</TableHead>
                                <TableHead className="text-right text-xs">Receiving Now</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {item.orderBreakdown.map(bd => {
                                const bdRemaining = bd.ordered_qty - bd.current_actual;
                                const mismatch = bd.receiving_now > 0 && Math.abs(bd.receiving_now - bdRemaining) > 0.01;
                                return (
                                  <TableRow key={bd.order_item_id} className={mismatch ? 'bg-amber-50' : ''}>
                                    <TableCell className="text-xs font-mono">#{bd.order_id.slice(0, 8)}</TableCell>
                                    <TableCell className="text-sm font-medium">{bd.building_name || '-'}</TableCell>
                                    <TableCell className="text-sm font-medium">{bd.flat_number || '-'}</TableCell>
                                    <TableCell className="text-right text-sm">{bd.ordered_qty.toFixed(2)}</TableCell>
                                    <TableCell className="text-right text-sm">{bd.current_actual > 0 ? bd.current_actual.toFixed(2) : '-'}</TableCell>
                                    <TableCell className="text-right">
                                      <Input
                                        type="number"
                                        step={isUnitBased ? "1" : "0.01"}
                                        min="0"
                                        value={bd.receiving_now || ''}
                                        onChange={(e) => updateBreakdownReceiving(
                                          item.id,
                                          bd.order_item_id,
                                          isUnitBased ? Math.max(0, parseInt(e.target.value) || 0) : parseFloat(e.target.value) || 0
                                        )}
                                        className="w-24 text-right ml-auto"
                                        placeholder="0.00"
                                      />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          <div className="mt-1">
                            <Input
                              type="text"
                              value={item.remarks}
                              onChange={(e) => updateRemarks(item.id, e.target.value)}
                              className="w-full text-sm"
                              placeholder="Remarks for this product (shortage, excess...)"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
