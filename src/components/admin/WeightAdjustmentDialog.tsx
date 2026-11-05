import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Scale, Check, AlertCircle, Percent, IndianRupee } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { Badge } from '@/components/ui/badge';
import { syncPOsFromWeightAdjustment } from '@/lib/po-lifecycle';
import { istDateString } from '@/lib/live-rate';
import { fetchSeafoodPrices, priceInForce, fmtSeafoodDate } from '@/lib/seafood-rate';

interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  actual_weight: number | null;
  weight_adjusted_at: string | null;
  vendor_supplied_weight?: number | null;
  vendor_id?: string | null;
  vendor_cost?: number | null;
  gst_rate: number;
  gst_type: string;
  hsn_code: string | null;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
}

interface WeightAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    total_amount: number;
    weight_finalized: boolean;
    place_of_supply: string | null;
    is_igst: boolean;
    discount_type?: string;
    discount_value?: number;
    discount_amount?: number;
  } | null;
  orderItems: OrderItem[];
}

export function WeightAdjustmentDialog({ 
  open, 
  onOpenChange, 
  order, 
  orderItems 
}: WeightAdjustmentDialogProps) {
  const queryClient = useQueryClient();
  const [adjustedItems, setAdjustedItems] = useState<Record<string, { weight: string; price: string }>>({});
  const [vendorWeights, setVendorWeights] = useState<Record<string, string>>({});
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'flat'>('none');
  const [discountValue, setDiscountValue] = useState('0');
  const [correctionMode, setCorrectionMode] = useState(false);

  // Fetch product pricing models for the items
  const productIds = orderItems.map(i => i.product_id).filter(Boolean) as string[];
  const { data: products } = useQuery({
    queryKey: ['products-pricing', productIds],
    queryFn: async () => {
      if (productIds.length === 0) return [];
      const { data, error } = await supabase
        .from('products')
        .select('id, pricing_model, unit')
        .in('id', productIds);
      if (error) throw error;
      return data;
    },
    enabled: open && productIds.length > 0,
  });

  const productMap = useMemo(() => {
    const map: Record<string, { pricing_model: string; unit: string }> = {};
    products?.forEach(p => { map[p.id] = { pricing_model: p.pricing_model, unit: p.unit }; });
    return map;
  }, [products]);

  // Seafood Rate: on first finalization, seafood lines take the prices in force today
  // (carried forward from the last day they were set). Correction mode never re-prices.
  const today = istDateString();
  const repriceEnabled = open && !!order && !order.weight_finalized && productIds.length > 0;
  const seafoodQuery = useQuery({
    queryKey: ['finalize-seafood-prices', productIds, today],
    queryFn: async () => {
      const [selling, buying, pub] = await Promise.all([
        fetchSeafoodPrices('seafood_selling_prices', { productIds, onOrBefore: today }),
        fetchSeafoodPrices('seafood_buying_prices', { productIds, onOrBefore: today }),
        (supabase as any).from('seafood_price_publications').select('publish_date').eq('publish_date', today).maybeSingle(),
      ]);
      return { selling, buying, publishedToday: !!pub?.data };
    },
    enabled: repriceEnabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  // Don't fill the inputs until seafood prices are known (or failed: then the order's own prices stay).
  const seafoodReady = !repriceEnabled || seafoodQuery.isSuccess || seafoodQuery.isError;

  type SeafoodQuote = { from: number; to: number; date: string; vendorCost: number | null };
  const seafoodQuotes = useMemo<Record<string, SeafoodQuote>>(() => {
    const quotes: Record<string, SeafoodQuote> = {};
    const data = repriceEnabled ? seafoodQuery.data : undefined;
    if (!data) return quotes;
    orderItems.forEach((item) => {
      if (!item.product_id) return;
      const sell = priceInForce(data.selling, item.product_id, today);
      if (!sell) return;
      const buy = item.vendor_id ? priceInForce(data.buying, item.product_id, today, item.vendor_id) : null;
      quotes[item.id] = { from: Number(item.unit_price), to: sell.price, date: sell.effective_date, vendorCost: buy ? buy.price : null };
    });
    return quotes;
  }, [repriceEnabled, seafoodQuery.data, orderItems, today]);

  const seafoodNotPublished = repriceEnabled && !!seafoodQuery.data && !seafoodQuery.data.publishedToday
    && Object.keys(seafoodQuotes).length > 0;
  const latestSeafoodDate = Object.values(seafoodQuotes).reduce((d: string, q: SeafoodQuote) => (q.date > d ? q.date : d), '');

  const getItemPricingModel = (item: OrderItem): 'weight_based' | 'unit_based' => {
    if (item.product_id && productMap[item.product_id]) {
      return productMap[item.product_id].pricing_model === 'unit_based' ? 'unit_based' : 'weight_based';
    }
    return 'weight_based';
  };

  // Initialize with current values when dialog opens
  useEffect(() => {
    if (open && orderItems && seafoodReady) {
      const initial: Record<string, { weight: string; price: string }> = {};
      const initialVendor: Record<string, string> = {};
      orderItems.forEach(item => {
        initial[item.id] = {
          weight: item.actual_weight?.toString() || item.quantity.toString(),
          price: (seafoodQuotes[item.id]?.to ?? item.unit_price).toString()
        };
        initialVendor[item.id] = (item.vendor_supplied_weight ?? item.actual_weight)?.toString() || item.quantity.toString();
      });
      setAdjustedItems(initial);
      setVendorWeights(initialVendor);
      setDiscountType((order?.discount_type as any) || 'none');
      setDiscountValue(order?.discount_value?.toString() || '0');
      setCorrectionMode(false);
    }
  }, [open, orderItems, order, seafoodReady, seafoodQuotes]);

  const calculateItemTotal = (itemId: string, item: OrderItem) => {
    const adjusted = adjustedItems[itemId];
    const qty = parseFloat(adjusted?.weight || '0') || item.quantity;
    const price = parseFloat(adjusted?.price || '0') || item.unit_price;
    return qty * price;
  };

  const subtotal = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + calculateItemTotal(item.id, item), 0);
  }, [orderItems, adjustedItems]);

  const discountAmount = useMemo(() => {
    const val = parseFloat(discountValue) || 0;
    if (discountType === 'percentage') return Math.min((subtotal * val) / 100, subtotal);
    if (discountType === 'flat') return Math.min(val, subtotal);
    return 0;
  }, [discountType, discountValue, subtotal]);

  const totalGST = useMemo(() => {
    return orderItems.reduce((sum, item) => {
      const adjusted = adjustedItems[item.id];
      const totalPrice = adjusted
        ? (parseFloat(adjusted.weight) || item.quantity) * (parseFloat(adjusted.price) || item.unit_price)
        : item.quantity * item.unit_price;
      if ((item.gst_type === 'taxable' || item.gst_type === 'Taxable') && item.gst_rate > 0) {
        return sum + (totalPrice * item.gst_rate) / 100;
      }
      return sum;
    }, 0);
  }, [orderItems, adjustedItems]);
  const newTotal = subtotal - discountAmount + totalGST;

  const updateItemsMutation = useMutation({
    mutationFn: async () => {
      if (!order) return;

      const isIGST = order.is_igst;

      for (const item of orderItems) {
        const adjusted = adjustedItems[item.id];
        if (!adjusted) continue;

        const actualWeight = parseFloat(adjusted.weight) || item.quantity;
        const unitPrice = parseFloat(adjusted.price) || item.unit_price;
        const totalPrice = actualWeight * unitPrice;
        const vendorRaw = vendorWeights[item.id];
        const vendorWeightParsed = vendorRaw !== undefined && vendorRaw !== '' ? parseFloat(vendorRaw) : NaN;
        const vendorSuppliedWeight = isFinite(vendorWeightParsed) && vendorWeightParsed > 0 ? vendorWeightParsed : actualWeight;
        
        let taxableValue = totalPrice;
        let cgst = 0, sgst = 0, igst = 0;
        
        if ((item.gst_type === 'taxable' || item.gst_type === 'Taxable') && item.gst_rate > 0) {
          const gstAmount = (taxableValue * item.gst_rate) / 100;
          if (isIGST) {
            igst = gstAmount;
          } else {
            cgst = gstAmount / 2;
            sgst = gstAmount / 2;
          }
        }

        // Seafood lines also take today's buying price from their supplier.
        const seafoodVendorCost = !order.weight_finalized ? seafoodQuotes[item.id]?.vendorCost ?? null : null;

        const { error } = await supabase
          .from('order_items')
          .update({
            ...(seafoodVendorCost != null ? { vendor_cost: seafoodVendorCost } : {}),
            actual_weight: actualWeight,
            vendor_supplied_weight: vendorSuppliedWeight,
            unit_price: unitPrice,
            total_price: totalPrice,
            taxable_value: taxableValue,
            cgst_amount: cgst,
            sgst_amount: sgst,
            igst_amount: igst,
            weight_adjusted_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (error) throw error;
      }

      const { error: orderError } = await supabase
        .from('orders')
        .update({
          total_amount: newTotal,
          weight_finalized: true,
          weight_finalized_at: new Date().toISOString(),
          discount_type: discountType,
          discount_value: parseFloat(discountValue) || 0,
          discount_amount: discountAmount,
        })
        .eq('id', order.id);

      if (orderError) throw orderError;

      // Sync linked purchase orders with the finalized actuals (additive — no
      // change to order/invoice logic).
      return await syncPOsFromWeightAdjustment(order.id);
    },
    onSuccess: (poSyncResult) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orderItems'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
      if (poSyncResult && poSyncResult.success === false) {
        toast.warning('Weights saved, but vendor PO sync failed: ' + (poSyncResult.error || 'unknown error') + '. Please check the purchase order manually.');
      }
      toast.success('Weights, prices and discount updated successfully');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error('Failed to update: ' + error.message);
    }
  });

  const handleWeightChange = (itemId: string, weight: string) => {
    setAdjustedItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], weight }
    }));
  };

  const handlePriceChange = (itemId: string, price: string) => {
    setAdjustedItems(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], price }
    }));
  };

  const handleVendorWeightChange = (itemId: string, weight: string) => {
    setVendorWeights(prev => ({ ...prev, [itemId]: weight }));
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto overflow-x-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Adjust Weights & Prices
          </DialogTitle>
          <DialogDescription>
            Update actual weights/quantities after verification. Final prices will be recalculated.
          </DialogDescription>
        </DialogHeader>

        {order.weight_finalized && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800">
            <Check className="h-4 w-4" />
            <span className="text-sm">{correctionMode ? 'Correction mode — edit and save to resync PO' : 'Weights have been finalized for this order'}</span>
          </div>
        )}

        {seafoodNotPublished && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <p className="text-sm">
              Today's seafood prices aren't published yet, so seafood lines use the latest prices (set {latestSeafoodDate ? fmtSeafoodDate(latestSeafoodDate) : 'earlier'}).
              Publish them under Seafood Rate first if they've changed.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div className="overflow-x-auto">
            <Table className="table-fixed w-full min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%] px-2 py-2">Product</TableHead>
                  <TableHead className="w-24 px-2 py-2 text-center">Ordered</TableHead>
                  <TableHead className="w-28 px-2 py-2 text-center">Actual</TableHead>
                  <TableHead className="w-28 px-2 py-2 text-center">Vendor Wt</TableHead>
                  <TableHead className="w-28 px-2 py-2 text-center">Unit Price</TableHead>
                  <TableHead className="w-24 px-2 py-2 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orderItems.map((item) => {
                  const pm = getItemPricingModel(item);
                  const isUnit = pm === 'unit_based';
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="px-2 py-2">
                        <div>
                          <p className="font-medium text-sm">{item.product_name}</p>
                          {item.hsn_code && (
                            <p className="text-xs text-muted-foreground">HSN: {item.hsn_code}</p>
                          )}
                          <Badge variant="outline" className="text-xs mt-1">
                            {(item.gst_type === 'taxable' || item.gst_type === 'Taxable') ? `GST ${item.gst_rate}%` : item.gst_type}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-2 text-center">
                        <span className="text-muted-foreground text-sm">
                          {item.quantity} {isUnit ? (item.quantity === 1 ? 'unit' : 'units') : 'kg'}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Input
                            type="number"
                            step={isUnit ? '1' : '0.001'}
                            min={isUnit ? '1' : '0.001'}
                            value={adjustedItems[item.id]?.weight || ''}
                            onChange={(e) => {
                              let val = e.target.value;
                              if (isUnit) {
                                const parsed = parseInt(val, 10);
                                val = isNaN(parsed) || parsed < 1 ? '1' : parsed.toString();
                              }
                              handleWeightChange(item.id, val);
                            }}
                            className="w-20 px-1"
                            disabled={order.weight_finalized && !correctionMode}
                          />
                          <span className="text-xs text-muted-foreground w-8">
                            {isUnit ? 'unit' : 'kg'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Input
                            type="number"
                            step={isUnit ? '1' : '0.001'}
                            min="0"
                            placeholder={adjustedItems[item.id]?.weight || ''}
                            value={vendorWeights[item.id] ?? ''}
                            onChange={(e) => handleVendorWeightChange(item.id, e.target.value)}
                            className="w-20 px-1"
                            disabled={order.weight_finalized && !correctionMode}
                          />
                          <span className="text-xs text-muted-foreground w-8">
                            {isUnit ? 'unit' : 'kg'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-2 py-2">
                        <div className="flex justify-center">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={adjustedItems[item.id]?.price || ''}
                            onChange={(e) => handlePriceChange(item.id, e.target.value)}
                            className="w-20 px-1"
                            disabled={order.weight_finalized && !correctionMode}
                          />
                        </div>
                        {seafoodQuotes[item.id] && (
                          <p className="text-[11px] text-center text-muted-foreground mt-1 leading-tight">
                            Seafood rate {seafoodQuotes[item.id].date === today ? 'today' : `from ${fmtSeafoodDate(seafoodQuotes[item.id].date)}`}
                            {seafoodQuotes[item.id].from !== seafoodQuotes[item.id].to && (
                              <> · was ₹{seafoodQuotes[item.id].from}</>
                            )}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="px-2 py-2 text-right font-medium text-sm">
                        {formatCurrency(calculateItemTotal(item.id, item))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Discount Section */}
          {!order.weight_finalized && (
            <div className="p-4 bg-muted/30 rounded-lg space-y-3">
              <Label className="font-medium">Order Discount</Label>
              <div className="flex items-center gap-3">
                <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Discount</SelectItem>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="flat">Flat Amount (₹)</SelectItem>
                  </SelectContent>
                </Select>
                {discountType !== 'none' && (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      max={discountType === 'percentage' ? '100' : undefined}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      className="w-24"
                    />
                    {discountType === 'percentage' ? <Percent className="h-4 w-4 text-muted-foreground" /> : <IndianRupee className="h-4 w-4 text-muted-foreground" />}
                  </div>
                )}
                {discountAmount > 0 && (
                  <span className="text-sm text-destructive font-medium">
                    −{formatCurrency(discountAmount)}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Original Total</p>
              <p className="font-medium">{formatCurrency(order.total_amount)}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Subtotal</p>
              <p className="font-medium">{formatCurrency(subtotal)}</p>
            </div>
            {discountAmount > 0 && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Discount</p>
                <p className="font-medium text-destructive">−{formatCurrency(discountAmount)}</p>
              </div>
            )}
            <div className="text-right">
              <p className="text-sm text-muted-foreground">New Total</p>
              <p className="text-xl font-bold text-primary">{formatCurrency(newTotal)}</p>
            </div>
          </div>

          {!order.weight_finalized && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                Once finalized, you can convert this order to a sale and generate the invoice with the actual weights.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {order.weight_finalized && !correctionMode && (
              <Button variant="outline" onClick={() => setCorrectionMode(true)}>
                <Scale className="h-4 w-4 mr-2" />
                Correct Weights
              </Button>
            )}
            {(!order.weight_finalized || correctionMode) && (
              <Button 
                onClick={() => {
                  if (correctionMode) {
                    const confirmed = window.confirm(
                      'This order has already been finalized and may have been invoiced to the customer. Saving this correction will update the order total and resync the linked vendor PO. Continue?'
                    );
                    if (!confirmed) return;
                  }
                  updateItemsMutation.mutate();
                }}
                disabled={updateItemsMutation.isPending}
              >
                {updateItemsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {order.weight_finalized ? 'Save Correction' : 'Finalize Weights'}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
