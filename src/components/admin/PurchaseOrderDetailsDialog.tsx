import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Send, XCircle, CheckCircle, Loader2, TrendingDown, TrendingUp, Minus, AlertTriangle, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/currency';
import { PurchaseOrder } from '@/types/vendor';
import { format } from 'date-fns';
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
  const items = poItems || items || [];
  const orderShortId = purchaseOrder?.notes?.match(/Order #([a-f0-9]{8})/i)?.[1] || null;
  const linkedOrderId = (items || []).map((i: any) => i.order_id).find(Boolean) || null;
  const { data: linkedOrder } = useQuery({
    queryKey: ['po-linked-order', purchaseOrder?.id, linkedOrderId],
    enabled: !!purchaseOrder && !!linkedOrderId,
    queryFn: async () => {
      const { data } = await supabase
        .from('orders')
        .select('id, invoice_number, flat_number, building_name')
        .eq('id', linkedOrderId)
        .maybeSingle();
      return data;
    },
  });

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
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-right">
                            {Number(item.quantity).toFixed(2)} {unitLabel}
                          </TableCell>
                          <TableCell className="text-right">
                            {actualWeight > 0 ? (
                              <span className="font-medium">{actualWeight.toFixed(2)} {unitLabel}</span>
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
                                {itemVariance > 0 ? '+' : ''}{itemVariance.toFixed(2)} {unitLabel}
                                <span className="text-xs">({itemVariancePercent > 0 ? '+' : ''}{itemVariancePercent.toFixed(1)}%)</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unit_cost)}/{unitLabel}</TableCell>
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
