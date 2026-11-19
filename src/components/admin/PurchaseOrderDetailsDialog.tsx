import { useState } from 'react';
import { formatIST, fmtQty } from '@/lib/ist';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Send, XCircle, CheckCircle, Loader2, TrendingDown, TrendingUp, Minus, AlertTriangle, CreditCard, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/currency';
import { PurchaseOrder } from '@/types/vendor';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VendorPaymentsDialog } from '@/components/admin/VendorPaymentsDialog';
import { PO_STATUS_LABELS, PO_STATUS_STYLES } from '@/lib/po-lifecycle';

interface PurchaseOrderDetailsDialogProps {
  purchaseOrder: PurchaseOrder | null;
  onClose: () => void;
}

export function PurchaseOrderDetailsDialog({ purchaseOrder, onClose }: PurchaseOrderDetailsDialogProps) {
  const queryClient = useQueryClient();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editedCost, setEditedCost] = useState('');

  // Fetch products for pricing model info
  const { data: products } = useQuery({
    queryKey: ['admin', 'products-for-po-details'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, pricing_model, unit');
      if (error) throw error;
      return data;
    }
  });

  // Fetch the customer order linked via PO items' order_id (populated when
  // weight adjustment syncs) or via the notes short-id fallback.
  // Fetch PO items separately since list query no longer embeds them
  const { data: poItems } = useQuery({
    queryKey: ['po-items', purchaseOrder?.id],
    queryFn: async () => {
      if (!purchaseOrder?.id) return [];
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', purchaseOrder.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!purchaseOrder?.id,
  });
  // A daily PO holds lines from several customer orders: each line is shown with its own
  // invoice, apartment and flat (found from the line's order, or its order line).
  const { data: lineOrders } = useQuery({
    queryKey: ['po-line-orders', purchaseOrder?.id, (poItems || []).length],
    enabled: !!purchaseOrder && (poItems || []).length > 0,
    queryFn: async () => {
      const lines = poItems || [];
      const viaItem = lines.filter((i: any) => !i.order_id && i.order_item_id).map((i: any) => i.order_item_id);
      const itemToOrder = new Map<string, string>();
      if (viaItem.length) {
        const { data } = await supabase.from('order_items').select('id, order_id').in('id', viaItem);
        (data || []).forEach((r: any) => itemToOrder.set(r.id, r.order_id));
      }
      const lineOrder = new Map<string, string>();
      lines.forEach((i: any) => {
        const oid = i.order_id || (i.order_item_id && itemToOrder.get(i.order_item_id));
        if (oid) lineOrder.set(i.id, oid);
      });
      const ids = [...new Set(lineOrder.values())];
      const orders = new Map<string, any>();
      if (ids.length) {
        const { data } = await supabase.from('orders')
          .select('id, invoice_number, flat_number, building_name').in('id', ids);
        (data || []).forEach((o: any) => orders.set(o.id, o));
      }
      return { lineOrder, orders };
    },
  });
  const orderOfLine = (lineId: string) => {
    const oid = lineOrders?.lineOrder.get(lineId);
    return oid ? lineOrders?.orders.get(oid) : undefined;
  };
  const linkedOrders = lineOrders ? [...lineOrders.orders.values()] : [];
  const linkedOrder = linkedOrders.length === 1 ? linkedOrders[0] : null;
  const orderShortId = linkedOrder ? String(linkedOrder.id).slice(0, 8) : null;
  // Lines grouped by customer order (apartment, flat), so each invoice's items sit together.
  const placeKey = (o: any) => o ? `${o.building_name || ''} ${o.flat_number || ''} ${o.invoice_number || ''}` : '~';
  const items = [...(poItems || [])].sort((a: any, b: any) =>
    placeKey(orderOfLine(a.id)).localeCompare(placeKey(orderOfLine(b.id))) || String(a.product_name).localeCompare(String(b.product_name)));

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, any> = { status };
      if (status === 'received') {
        updates.received_date = new Date().toISOString();
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

  // Settlement-time price correction — updates only this line item's cost
  // (never order_item_id/order_id/received_* fields, so it never breaks the
  // link back to the customer order or reintroduces duplicate PO items on a
  // future sync), then rolls up the parent PO's totals.
  const updateItemCostMutation = useMutation({
    mutationFn: async ({ itemId, newUnitCost }: { itemId: string; newUnitCost: number }) => {
      const item = items.find((i: any) => i.id === itemId);
      if (!item) throw new Error('Item not found');
      const basisQty = item.actual_received_weight && item.actual_received_weight > 0
        ? item.actual_received_weight
        : item.quantity;
      const newTotalCost = Math.round(basisQty * newUnitCost * 100) / 100;
      let newTaxAmount = 0;
      if (item.product_id) {
        const { data: product } = await supabase
          .from('products')
          .select('gst_rate, gst_type')
          .eq('id', item.product_id)
          .maybeSingle();
        const nt = String(product?.gst_type || '').toLowerCase();
        const gstRate = (nt === 'taxable' && Number(product?.gst_rate) > 0) ? Number(product?.gst_rate) : 0;
        newTaxAmount = Math.round(newTotalCost * gstRate) / 100;
      }
      const { error: itemError } = await supabase
        .from('purchase_order_items')
        .update({ unit_cost: newUnitCost, total_cost: newTotalCost, tax_amount: newTaxAmount })
        .eq('id', itemId);
      if (itemError) throw itemError;
      const { data: allItems } = await supabase
        .from('purchase_order_items')
        .select('total_cost, tax_amount')
        .eq('purchase_order_id', purchaseOrder!.id);
      const subtotal = (allItems || []).reduce((s, i: any) => s + Number(i.total_cost || 0), 0);
      const taxAmount = (allItems || []).reduce((s, i: any) => s + Number(i.tax_amount || 0), 0);
      const { error: poError } = await supabase
        .from('purchase_orders')
        .update({ subtotal, tax_amount: taxAmount, total_amount: subtotal + taxAmount })
        .eq('id', purchaseOrder!.id);
      if (poError) throw poError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['po-items', purchaseOrder?.id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
      toast.success('Price updated');
      setEditingItemId(null);
    },
    onError: (error: Error) => {
      toast.error('Failed to update price: ' + error.message);
    }
  });
  if (!purchaseOrder) return null;

  const getProductInfo = (productId: string | null) => {
    if (!productId) return { pricing_model: 'weight_based', unit: 'kg' };
    const product = products?.find(p => p.id === productId);
    return {
      pricing_model: product?.pricing_model || 'weight_based',
      unit: product?.unit || 'kg',
    };
  };

  const getUnitLabel = (productId: string | null) => {
    const info = getProductInfo(productId);
    return info.pricing_model === 'unit_based' ? (info.unit || 'units') : 'kg';
  };

  const getStatusBadge = (status: string) => (
    <Badge className={PO_STATUS_STYLES[status] || 'bg-gray-100 text-gray-800'}>
      {PO_STATUS_LABELS[status] || status}
    </Badge>
  );

  const canSend = purchaseOrder.status === 'draft';
  const canConfirm = purchaseOrder.status === 'sent';
  const canCancel = ['draft', 'sent'].includes(purchaseOrder.status);

  const totalOrdered = items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const totalActualReceived = items?.reduce((sum, item) => sum + (item.actual_received_weight || 0), 0) || 0;
  const hasGRNData = items?.some(item => item.actual_received_weight !== null);

  const actualValue = items?.reduce((sum, item) => {
    const received = item.actual_received_weight || 0;
    return sum + (received * item.unit_cost);
  }, 0) || 0;

  const orderedValue = items?.reduce((sum, item) => sum + item.total_cost, 0) || 0;
  const valueVariance = actualValue - orderedValue;

  return (
    <>
    <Dialog open={!!purchaseOrder} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>Purchase Order: {purchaseOrder.po_number}</span>
            {getStatusBadge(purchaseOrder.status)}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-4">
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
                  <p>{formatIST(purchaseOrder.order_date, 'dd MMM yyyy')}</p>
                </div>
                {purchaseOrder.expected_delivery_date && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Expected Delivery</h4>
                    <p>{formatIST(purchaseOrder.expected_delivery_date, 'dd MMM yyyy')}</p>
                  </div>
                )}
                {purchaseOrder.received_date && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Received Date</h4>
                    <p>{formatIST(purchaseOrder.received_date, 'dd MMM yyyy')}</p>
                  </div>
                )}
              </div>
            </div>

            {linkedOrders.length > 1 && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="text-xs text-muted-foreground mb-1">Customer orders on this PO ({linkedOrders.length})</p>
                <p className="font-medium">
                  {linkedOrders
                    .sort((a: any, b: any) => placeKey(a).localeCompare(placeKey(b)))
                    .map((o: any) => `${o.building_name || '—'} ${o.flat_number || ''}${o.invoice_number ? ` (${o.invoice_number})` : ''}`)
                    .join(' · ')}
                </p>
              </div>
            )}
            {linkedOrder && (
              <div className="rounded-lg border bg-muted/30 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Customer Order</p>
                  <p className="font-mono">{orderShortId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Invoice</p>
                  <p className="font-medium">{linkedOrder.invoice_number || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Apartment</p>
                  <p className="font-medium">{linkedOrder.building_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Flat</p>
                  <p className="font-medium">{linkedOrder.flat_number || '—'}</p>
                </div>
              </div>
            )}

            <Separator />

            {/* Line Items */}
            <div>
              <h4 className="font-medium mb-3">Order Items</h4>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Ordered Qty</TableHead>
                      <TableHead className="text-right">Actual Received</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead className="text-right">Cost/Unit</TableHead>
                      <TableHead className="text-right">Ordered Value</TableHead>
                      <TableHead className="text-right">Actual Value</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items?.map((item) => {
                      const unitLabel = getUnitLabel(item.product_id);
                      const actualWeight = item.actual_received_weight || 0;
                      const itemVariance = actualWeight - item.quantity;
                      const itemVariancePercent = item.quantity > 0 ? (itemVariance / item.quantity * 100) : 0;
                      const actualItemValue = actualWeight * item.unit_cost;

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.product_name}
                            {(() => {
                              const o = orderOfLine(item.id);
                              return (
                                <span className="block text-xs font-normal text-muted-foreground">
                                  {o
                                    ? [o.invoice_number, [o.building_name, o.flat_number].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
                                    : 'Added by hand (no customer order)'}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmtQty(item.quantity)} {unitLabel}
                          </TableCell>
                          <TableCell className="text-right">
                            {actualWeight > 0 ? (
                              <span className="font-medium">{fmtQty(actualWeight)} {unitLabel}</span>
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
                                {itemVariance > 0 ? <TrendingUp className="h-3 w-3" /> : itemVariance < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                                {itemVariance > 0 ? '+' : ''}{fmtQty(itemVariance)} {unitLabel}
                                <span className="text-xs">({itemVariancePercent > 0 ? '+' : ''}{itemVariancePercent.toFixed(1)}%)</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingItemId === item.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  autoFocus
                                  value={editedCost}
                                  onChange={(e) => setEditedCost(e.target.value)}
                                  className="w-24 h-8 text-right"
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  disabled={updateItemCostMutation.isPending}
                                  onClick={() => {
                                    const parsed = parseFloat(editedCost);
                                    if (isNaN(parsed) || parsed < 0) {
                                      toast.error('Enter a valid cost');
                                      return;
                                    }
                                    updateItemCostMutation.mutate({ itemId: item.id, newUnitCost: parsed });
                                  }}
                                >
                                  {updateItemCostMutation.isPending
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Check className="h-3.5 w-3.5 text-green-600" />}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => setEditingItemId(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                {formatCurrency(item.unit_cost)}/{unitLabel}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  title="Correct vendor price at settlement"
                                  onClick={() => {
                                    setEditingItemId(item.id);
                                    setEditedCost(String(item.unit_cost));
                                  }}
                                >
                                  <Pencil className="h-3 w-3 text-muted-foreground" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
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
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Ordered Value:</span>
                      <p className="font-semibold">{formatCurrency(orderedValue)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Actual Value:</span>
                      <p className="font-semibold">{formatCurrency(actualValue)}</p>
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
          <Button variant="outline" onClick={onClose}>Close</Button>
          {purchaseOrder.payment_status !== 'paid' && purchaseOrder.vendor && (
            <Button variant="secondary" onClick={() => setPaymentDialogOpen(true)}>
              <CreditCard className="h-4 w-4 mr-2" /> Pay Vendor
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" onClick={() => updateStatusMutation.mutate({ id: purchaseOrder.id, status: 'cancelled' })} disabled={updateStatusMutation.isPending}>
              {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <XCircle className="h-4 w-4 mr-2" /> Cancel PO
            </Button>
          )}
          {canSend && (
            <Button onClick={() => updateStatusMutation.mutate({ id: purchaseOrder.id, status: 'sent' })} disabled={updateStatusMutation.isPending}>
              {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-4 w-4 mr-2" /> Send to Vendor
            </Button>
          )}
          {canConfirm && (
            <Button onClick={() => updateStatusMutation.mutate({ id: purchaseOrder.id, status: 'confirmed' })} disabled={updateStatusMutation.isPending}>
              {updateStatusMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <CheckCircle className="h-4 w-4 mr-2" /> Mark Confirmed
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Vendor Payment Dialog */}
    {purchaseOrder.vendor && (
      <VendorPaymentsDialog
        vendor={purchaseOrder.vendor}
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        preselectedPoId={purchaseOrder.id}
      />
    )}
    </>
  );
}
