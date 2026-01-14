import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PackageCheck, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { PurchaseOrder, PurchaseOrderItem } from '@/types/vendor';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ReceivedItem {
  id: string;
  product_name: string;
  quantity: number;
  received_quantity: number;
  receiving_now: number;
}

interface ReceiveOrderDialogProps {
  purchaseOrder: PurchaseOrder | null;
  onClose: () => void;
}

export function ReceiveOrderDialog({ purchaseOrder, onClose }: ReceiveOrderDialogProps) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<ReceivedItem[]>([]);

  useEffect(() => {
    if (purchaseOrder?.items) {
      setItems(purchaseOrder.items.map(item => ({
        id: item.id,
        product_name: item.product_name,
        quantity: item.quantity,
        received_quantity: item.received_quantity,
        receiving_now: item.quantity - item.received_quantity, // Default to remaining quantity
      })));
    }
  }, [purchaseOrder]);

  const updateReceivingQty = (id: string, qty: number) => {
    setItems(items.map(item => 
      item.id === id 
        ? { ...item, receiving_now: Math.max(0, Math.min(qty, item.quantity - item.received_quantity)) }
        : item
    ));
  };

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!purchaseOrder) return;

      // Update each item's received quantity
      for (const item of items) {
        if (item.receiving_now > 0) {
          const newReceivedQty = item.received_quantity + item.receiving_now;
          const { error } = await supabase
            .from('purchase_order_items')
            .update({ received_quantity: newReceivedQty })
            .eq('id', item.id);
          if (error) throw error;
        }
      }

      // Check if fully received or partially received
      const totalOrdered = items.reduce((sum, item) => sum + item.quantity, 0);
      const totalReceived = items.reduce((sum, item) => sum + item.received_quantity + item.receiving_now, 0);
      
      const newStatus = totalReceived >= totalOrdered ? 'received' : 'partially_received';
      
      const updates: Record<string, any> = { status: newStatus };
      if (newStatus === 'received') {
        updates.received_date = new Date().toISOString().split('T')[0];
      }

      const { error: poError } = await supabase
        .from('purchase_orders')
        .update(updates)
        .eq('id', purchaseOrder.id);
      
      if (poError) throw poError;

      return { status: newStatus, totalReceived, totalOrdered };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
      
      if (result?.status === 'received') {
        toast.success('Order fully received!');
      } else {
        toast.success(`Received ${result?.totalReceived} of ${result?.totalOrdered} items`);
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
      toast.error('Please enter quantity to receive for at least one item');
      return;
    }
    receiveMutation.mutate();
  };

  if (!purchaseOrder) return null;

  const allFullyReceived = items.every(item => item.received_quantity >= item.quantity);

  return (
    <Dialog open={!!purchaseOrder} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            Receive Order: {purchaseOrder.po_number}
          </DialogTitle>
          <DialogDescription>
            Enter the quantity received for each item
          </DialogDescription>
        </DialogHeader>

        {allFullyReceived ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              All items have already been fully received.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Previously Received</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right w-32">Receiving Now</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const remaining = item.quantity - item.received_quantity;
                    const isComplete = remaining === 0;
                    
                    return (
                      <TableRow key={item.id} className={isComplete ? 'bg-muted/50' : ''}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">{item.received_quantity}</TableCell>
                        <TableCell className="text-right">
                          <span className={remaining > 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>
                            {remaining}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {isComplete ? (
                            <span className="text-green-600 text-sm">Complete</span>
                          ) : (
                            <Input
                              type="number"
                              min="0"
                              max={remaining}
                              value={item.receiving_now}
                              onChange={(e) => updateReceivingQty(item.id, parseInt(e.target.value) || 0)}
                              className="w-20 text-right ml-auto"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2 text-sm">
              <span className="text-muted-foreground">
                Total receiving: {items.reduce((sum, item) => sum + item.receiving_now, 0)} items
              </span>
            </div>
          </div>
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
