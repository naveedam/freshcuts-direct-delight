import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/currency';
import { PurchaseOrder, Vendor, PurchaseOrderItem } from '@/types/vendor';
import { format } from 'date-fns';

interface POLineItem {
  product_id: string | null;
  product_name: string;
  ordered_quantity_kg: number; // Ordered quantity in kg (decimals allowed)
  unit_cost: number; // Cost per kg
  total_cost: number; // ordered_quantity_kg × unit_cost
}

interface PurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrder | null;
}

export function PurchaseOrderDialog({ open, onOpenChange, purchaseOrder }: PurchaseOrderDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!purchaseOrder;
  
  const [vendorId, setVendorId] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<POLineItem[]>([]);
  const [taxRate, setTaxRate] = useState(0);

  const { data: vendors } = useQuery({
    queryKey: ['admin', 'vendors-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data as Vendor[];
    }
  });

  const { data: products } = useQuery({
    queryKey: ['admin', 'products-for-po'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, category')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  const { data: vendorProducts } = useQuery({
    queryKey: ['admin', 'vendor-products', vendorId],
    enabled: !!vendorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_products')
        .select('*, product:products(id, name, category)')
        .eq('vendor_id', vendorId);
      if (error) throw error;
      return data;
    }
  });

  useEffect(() => {
    if (purchaseOrder) {
      setVendorId(purchaseOrder.vendor_id);
      setExpectedDelivery(purchaseOrder.expected_delivery_date || '');
      setNotes(purchaseOrder.notes || '');
      setTaxRate(purchaseOrder.subtotal > 0 ? (purchaseOrder.tax_amount / purchaseOrder.subtotal) * 100 : 0);
      if (purchaseOrder.items) {
        setItems(purchaseOrder.items.map(item => ({
          product_id: item.product_id,
          product_name: item.product_name,
          ordered_quantity_kg: item.quantity, // Map from DB field
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
        })));
      }
    } else {
      resetForm();
    }
  }, [purchaseOrder, open]);

  const resetForm = () => {
    setVendorId('');
    setExpectedDelivery('');
    setNotes('');
    setItems([]);
    setTaxRate(0);
  };

  const addItem = () => {
    setItems([...items, {
      product_id: null,
      product_name: '',
      ordered_quantity_kg: 1, // Default 1 kg
      unit_cost: 0,
      total_cost: 0,
    }]);
  };

  const updateItem = (index: number, updates: Partial<POLineItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    // Recalculate total: ordered_quantity_kg × unit_cost
    newItems[index].total_cost = newItems[index].ordered_quantity_kg * newItems[index].unit_cost;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const selectProduct = (index: number, productId: string) => {
    const product = products?.find(p => p.id === productId);
    const vendorProduct = vendorProducts?.find(vp => vp.product_id === productId);
    if (product) {
      updateItem(index, {
        product_id: productId,
        product_name: product.name,
        unit_cost: vendorProduct?.cost_price || 0,
      });
    }
  };

  const subtotal = items.reduce((sum, item) => sum + item.total_cost, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const createMutation = useMutation({
    mutationFn: async (status: 'draft' | 'sent') => {
      // Generate PO number
      const { data: poNumber, error: poError } = await supabase.rpc('generate_po_number');
      if (poError) throw poError;

      // Create PO
      const { data: po, error: insertError } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: poNumber,
          vendor_id: vendorId,
          status,
          order_date: new Date().toISOString().split('T')[0],
          expected_delivery_date: expectedDelivery || null,
          subtotal,
          tax_amount: taxAmount,
          total_amount: total,
          notes: notes || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Insert items
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(items.map(item => ({
            purchase_order_id: po.id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.ordered_quantity_kg, // Map to DB field
            unit_cost: item.unit_cost,
            total_cost: item.total_cost,
          })));
        if (itemsError) throw itemsError;
      }

      return po;
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
      toast.success(`Purchase order ${status === 'sent' ? 'created and sent' : 'saved as draft'}`);
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to create PO: ' + error.message);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (status: 'draft' | 'sent') => {
      if (!purchaseOrder) return;

      // Update PO
      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          vendor_id: vendorId,
          status,
          expected_delivery_date: expectedDelivery || null,
          subtotal,
          tax_amount: taxAmount,
          total_amount: total,
          notes: notes || null,
        })
        .eq('id', purchaseOrder.id);

      if (updateError) throw updateError;

      // Delete existing items and re-insert
      await supabase.from('purchase_order_items').delete().eq('purchase_order_id', purchaseOrder.id);
      
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(items.map(item => ({
            purchase_order_id: purchaseOrder.id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.ordered_quantity_kg, // Map to DB field
            unit_cost: item.unit_cost,
            total_cost: item.total_cost,
          })));
        if (itemsError) throw itemsError;
      }
    },
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
      toast.success(`Purchase order ${status === 'sent' ? 'updated and sent' : 'updated'}`);
      onOpenChange(false);
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to update PO: ' + error.message);
    }
  });

  const handleSave = (status: 'draft' | 'sent') => {
    if (!vendorId) {
      toast.error('Please select a vendor');
      return;
    }
    if (items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }
    if (items.some(item => !item.product_name)) {
      toast.error('All items must have a product name');
      return;
    }

    if (isEditing) {
      updateMutation.mutate(status);
    } else {
      createMutation.mutate(status);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Purchase Order' : 'Create Purchase Order'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Header Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vendor *</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors?.map(vendor => (
                    <SelectItem key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expected Delivery Date</Label>
              <Input
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>
            
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Product</TableHead>
                    <TableHead className="w-[15%]">Ordered Qty (kg)</TableHead>
                    <TableHead className="w-[20%]">Cost/kg</TableHead>
                    <TableHead className="w-[20%] text-right">Total</TableHead>
                    <TableHead className="w-[5%]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No items added yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Select
                            value={item.product_id || ''}
                            onValueChange={(v) => selectProduct(index, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select product">
                                {item.product_name || 'Select product'}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {(vendorId && vendorProducts?.length 
                                ? vendorProducts.map(vp => vp.product)
                                : products
                              )?.map(product => (
                                <SelectItem key={product?.id} value={product?.id || ''}>
                                  {product?.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.ordered_quantity_kg}
                            onChange={(e) => updateItem(index, { ordered_quantity_kg: parseFloat(e.target.value) || 0 })}
                            placeholder="0.00"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_cost}
                            onChange={(e) => updateItem(index, { unit_cost: parseFloat(e.target.value) || 0 })}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(item.total_cost)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-muted-foreground">Tax %</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                  className="w-20 text-right"
                />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax Amount</span>
                <span>{formatCurrency(taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes for this order..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleSave('draft')}
            disabled={isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Draft
          </Button>
          <Button onClick={() => handleSave('sent')} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Send className="h-4 w-4 mr-2" />
            {isEditing ? 'Update & Send' : 'Create & Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
