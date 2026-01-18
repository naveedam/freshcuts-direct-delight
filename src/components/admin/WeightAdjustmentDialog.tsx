import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Scale, Check, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { Badge } from '@/components/ui/badge';

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  actual_weight: number | null;
  weight_adjusted_at: string | null;
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

  // Initialize with current values when dialog opens
  useEffect(() => {
    if (open && orderItems) {
      const initial: Record<string, { weight: string; price: string }> = {};
      orderItems.forEach(item => {
        initial[item.id] = {
          weight: item.actual_weight?.toString() || item.quantity.toString(),
          price: item.unit_price.toString()
        };
      });
      setAdjustedItems(initial);
    }
  }, [open, orderItems]);

  const updateItemsMutation = useMutation({
    mutationFn: async () => {
      if (!order) return;

      // Update each item
      for (const item of orderItems) {
        const adjusted = adjustedItems[item.id];
        if (!adjusted) continue;

        const actualWeight = parseFloat(adjusted.weight) || item.quantity;
        const unitPrice = parseFloat(adjusted.price) || item.unit_price;
        const totalPrice = actualWeight * unitPrice;
        
        // Calculate tax based on GST type
        let taxableValue = totalPrice;
        let cgst = 0, sgst = 0, igst = 0;
        
        if (item.gst_type === 'taxable' && item.gst_rate > 0) {
          // For inclusive pricing, calculate taxable value
          taxableValue = totalPrice / (1 + item.gst_rate / 100);
          const totalTax = totalPrice - taxableValue;
          
          // Determine if IGST or CGST/SGST based on place of supply
          // For now, assume same state (CGST/SGST)
          cgst = totalTax / 2;
          sgst = totalTax / 2;
        }

        const { error } = await supabase
          .from('order_items')
          .update({
            actual_weight: actualWeight,
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

      // Calculate new order total
      const newTotal = orderItems.reduce((sum, item) => {
        const adjusted = adjustedItems[item.id];
        const weight = parseFloat(adjusted?.weight || '0') || item.quantity;
        const price = parseFloat(adjusted?.price || '0') || item.unit_price;
        return sum + (weight * price);
      }, 0);

      // Update order total and mark as finalized
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          total_amount: newTotal,
          weight_finalized: true,
          weight_finalized_at: new Date().toISOString()
        })
        .eq('id', order.id);

      if (orderError) throw orderError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orderItems'] });
      toast.success('Weights and prices updated successfully');
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

  const calculateItemTotal = (itemId: string, item: OrderItem) => {
    const adjusted = adjustedItems[itemId];
    const weight = parseFloat(adjusted?.weight || '0') || item.quantity;
    const price = parseFloat(adjusted?.price || '0') || item.unit_price;
    return weight * price;
  };

  const calculateNewTotal = () => {
    return orderItems.reduce((sum, item) => sum + calculateItemTotal(item.id, item), 0);
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Adjust Weights & Prices
          </DialogTitle>
          <DialogDescription>
            Update actual weights after weighing products. Final prices will be recalculated.
          </DialogDescription>
        </DialogHeader>

        {order.weight_finalized && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800">
            <Check className="h-4 w-4" />
            <span className="text-sm">Weights have been finalized for this order</span>
          </div>
        )}

        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Ordered Qty</TableHead>
                <TableHead>Actual Weight (kg)</TableHead>
                <TableHead>Unit Price (₹)</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{item.product_name}</p>
                      {item.hsn_code && (
                        <p className="text-xs text-muted-foreground">HSN: {item.hsn_code}</p>
                      )}
                      <Badge variant="outline" className="text-xs mt-1">
                        {item.gst_type === 'taxable' ? `GST ${item.gst_rate}%` : item.gst_type}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">{item.quantity} kg</span>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={adjustedItems[item.id]?.weight || ''}
                      onChange={(e) => handleWeightChange(item.id, e.target.value)}
                      className="w-24"
                      disabled={order.weight_finalized}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={adjustedItems[item.id]?.price || ''}
                      onChange={(e) => handlePriceChange(item.id, e.target.value)}
                      className="w-24"
                      disabled={order.weight_finalized}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(calculateItemTotal(item.id, item))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Original Total</p>
              <p className="font-medium">{formatCurrency(order.total_amount)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">New Total</p>
              <p className="text-xl font-bold text-primary">{formatCurrency(calculateNewTotal())}</p>
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
            {!order.weight_finalized && (
              <Button 
                onClick={() => updateItemsMutation.mutate()}
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
                    Finalize Weights
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
