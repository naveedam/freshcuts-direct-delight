import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface OrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  hsn_code: string | null;
  gst_type: string;
  gst_rate: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
}

interface EditableItem {
  id: string | null; // null = newly added
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  vendor_cost: number;
  hsn_code: string;
  gst_type: string;
  gst_rate: number;
  vendor_id: string | null;
  _removed?: boolean;
}

interface EditOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: {
    id: string;
    total_amount: number;
    is_igst: boolean;
    converted_to_sale: boolean | null;
    status: string;
    weight_finalized: boolean | null;
  } | null;
  orderItems: OrderItem[];
}

function isOrderLocked(order: EditOrderDialogProps['order']): string | null {
  if (!order) return 'No order selected';
  if (order.converted_to_sale) return 'This order has been invoiced and cannot be edited';
  if (order.status === 'delivered') return 'Delivered orders cannot be edited';
  if (order.status === 'cancelled') return 'Cancelled orders cannot be edited';
  return null;
}

function calculateLineGST(item: EditableItem, isIGST: boolean) {
  const taxableValue = item.quantity * item.unit_price;
  if (item.gst_type === 'Exempt' || item.gst_type === 'Nil-rated') {
    return { taxableValue, cgst: 0, sgst: 0, igst: 0, total: taxableValue };
  }
  const gstAmount = (taxableValue * item.gst_rate) / 100;
  if (isIGST) {
    return { taxableValue, cgst: 0, sgst: 0, igst: gstAmount, total: taxableValue + gstAmount };
  }
  const halfGst = gstAmount / 2;
  return { taxableValue, cgst: halfGst, sgst: halfGst, igst: 0, total: taxableValue + gstAmount };
}

export function EditOrderDialog({ open, onOpenChange, order, orderItems }: EditOrderDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [items, setItems] = useState<EditableItem[]>([]);

  // Fetch products for dropdown
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch vendors
  const { data: vendors } = useQuery({
    queryKey: ['vendors-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('*').eq('status', 'active').order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch vendor-product mappings
  const { data: vendorProducts } = useQuery({
    queryKey: ['vendor-products-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendor_products').select('*').order('is_preferred_vendor', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Initialize items from orderItems
  useEffect(() => {
    if (open && orderItems.length > 0) {
      setItems(
        orderItems.map((oi) => {
          const preferredVp = oi.product_id ? vendorProducts?.find(vp => vp.product_id === oi.product_id && vp.is_preferred_vendor) : null;
          const anyVp = oi.product_id ? vendorProducts?.find(vp => vp.product_id === oi.product_id) : null;
          return {
            id: oi.id,
            product_id: oi.product_id,
            product_name: oi.product_name,
            quantity: Number(oi.quantity),
            unit_price: Number(oi.unit_price),
            vendor_cost: Number((oi as any).vendor_cost) || preferredVp?.cost_price || anyVp?.cost_price || 0,
            hsn_code: oi.hsn_code || '',
            gst_type: oi.gst_type,
            gst_rate: Number(oi.gst_rate),
            vendor_id: preferredVp?.vendor_id || anyVp?.vendor_id || null,
          };
        })
      );
    }
  }, [open, orderItems, vendorProducts]);

  const lockReason = isOrderLocked(order);
  const isIGST = order?.is_igst ?? false;

  const activeItems = useMemo(() => items.filter((i) => !i._removed), [items]);

  const totals = useMemo(() => {
    return activeItems.reduce(
      (acc, item) => {
        const gst = calculateLineGST(item, isIGST);
        return {
          taxableValue: acc.taxableValue + gst.taxableValue,
          cgst: acc.cgst + gst.cgst,
          sgst: acc.sgst + gst.sgst,
          igst: acc.igst + gst.igst,
          total: acc.total + gst.total,
        };
      },
      { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
    );
  }, [activeItems, isIGST]);

  const updateItem = (index: number, field: keyof EditableItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      // find the nth active item
      let activeIdx = -1;
      for (let i = 0; i < next.length; i++) {
        if (!next[i]._removed) activeIdx++;
        if (activeIdx === index) {
          next[i] = { ...next[i], [field]: value };
          break;
        }
      }
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      const next = [...prev];
      let activeIdx = -1;
      for (let i = 0; i < next.length; i++) {
        if (!next[i]._removed) activeIdx++;
        if (activeIdx === index) {
          if (next[i].id) {
            next[i] = { ...next[i], _removed: true };
          } else {
            next.splice(i, 1);
          }
          break;
        }
      }
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: null,
        product_id: null,
        product_name: '',
        quantity: 1,
        unit_price: 0,
        vendor_cost: 0,
        hsn_code: '',
        gst_type: 'Exempt',
        gst_rate: 0,
        vendor_id: null,
      },
    ]);
  };

  const selectProduct = (index: number, productId: string) => {
    const product = products?.find((p) => p.id === productId);
    if (!product) return;
    const preferredVp = vendorProducts?.find(vp => vp.product_id === productId && vp.is_preferred_vendor);
    const anyVp = vendorProducts?.find(vp => vp.product_id === productId);
    const autoVendorId = preferredVp?.vendor_id || anyVp?.vendor_id || null;
    setItems((prev) => {
      const next = [...prev];
      let activeIdx = -1;
      for (let i = 0; i < next.length; i++) {
        if (!next[i]._removed) activeIdx++;
        if (activeIdx === index) {
          next[i] = {
            ...next[i],
            product_id: product.id,
            product_name: product.name,
            unit_price: Number(product.price),
            hsn_code: product.hsn_code || '',
            gst_type: product.gst_type || 'Exempt',
            gst_rate: Number(product.gst_rate) || 0,
            vendor_id: autoVendorId,
          };
          break;
        }
      }
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!order || !user) throw new Error('Missing order or user');
      if (activeItems.filter((i) => i.product_name).length === 0) {
        throw new Error('Order must have at least one item');
      }

      // Build before snapshot
      const snapshotBefore = {
        total_amount: order.total_amount,
        items: orderItems.map((oi) => ({
          id: oi.id,
          product_name: oi.product_name,
          quantity: Number(oi.quantity),
          unit_price: Number(oi.unit_price),
          total_price: Number(oi.total_price),
        })),
      };

      // Delete removed items
      const removedIds = items.filter((i) => i._removed && i.id).map((i) => i.id!);
      if (removedIds.length > 0) {
        // We can't delete order_items (no DELETE RLS), so set quantity to 0 and total to 0
        for (const rid of removedIds) {
          const { error } = await supabase
            .from('order_items')
            .update({ quantity: 0, unit_price: 0, total_price: 0, taxable_value: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0 })
            .eq('id', rid);
          if (error) throw error;
        }
      }

      // Update existing items
      for (const item of activeItems.filter((i) => i.id)) {
        const gst = calculateLineGST(item, isIGST);
        const { error } = await supabase
          .from('order_items')
          .update({
            product_id: item.product_id || null,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: gst.total,
            hsn_code: item.hsn_code || null,
            gst_type: item.gst_type,
            gst_rate: item.gst_rate,
            taxable_value: gst.taxableValue,
            cgst_amount: gst.cgst,
            sgst_amount: gst.sgst,
            igst_amount: gst.igst,
          })
          .eq('id', item.id!);
        if (error) throw error;
      }

      // Insert new items
      const newItems = activeItems.filter((i) => !i.id && i.product_name);
      if (newItems.length > 0) {
        const rows = newItems.map((item) => {
          const gst = calculateLineGST(item, isIGST);
          return {
            order_id: order.id,
            product_id: item.product_id || null,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: gst.total,
            hsn_code: item.hsn_code || null,
            gst_type: item.gst_type,
            gst_rate: item.gst_rate,
            taxable_value: gst.taxableValue,
            cgst_amount: gst.cgst,
            sgst_amount: gst.sgst,
            igst_amount: gst.igst,
          };
        });
        const { error } = await supabase.from('order_items').insert(rows);
        if (error) throw error;
      }

      // Update order total
      const { error: orderErr } = await supabase
        .from('orders')
        .update({ total_amount: totals.total })
        .eq('id', order.id);
      if (orderErr) throw orderErr;

      // Build after snapshot
      const snapshotAfter = {
        total_amount: totals.total,
        items: activeItems
          .filter((i) => i.product_name)
          .map((i) => {
            const gst = calculateLineGST(i, isIGST);
            return {
              id: i.id,
              product_name: i.product_name,
              quantity: i.quantity,
              unit_price: i.unit_price,
              total_price: gst.total,
            };
          }),
      };

      // Build changes array
      const changes: any[] = [];
      // Removed items
      for (const rid of removedIds) {
        const orig = orderItems.find((oi) => oi.id === rid);
        if (orig) changes.push({ type: 'item_removed', product_name: orig.product_name, before: { quantity: Number(orig.quantity), unit_price: Number(orig.unit_price) } });
      }
      // New items
      for (const ni of newItems) {
        changes.push({ type: 'item_added', product_name: ni.product_name, after: { quantity: ni.quantity, unit_price: ni.unit_price } });
      }
      // Modified existing
      for (const item of activeItems.filter((i) => i.id)) {
        const orig = orderItems.find((oi) => oi.id === item.id);
        if (!orig) continue;
        const diffs: Record<string, { before: any; after: any }> = {};
        if (Number(orig.quantity) !== item.quantity) diffs.quantity = { before: Number(orig.quantity), after: item.quantity };
        if (Number(orig.unit_price) !== item.unit_price) diffs.unit_price = { before: Number(orig.unit_price), after: item.unit_price };
        if (orig.product_name !== item.product_name) diffs.product_name = { before: orig.product_name, after: item.product_name };
        if (Object.keys(diffs).length > 0) {
          changes.push({ type: 'item_modified', product_name: item.product_name, item_id: item.id, diffs });
        }
      }
      if (order.total_amount !== totals.total) {
        changes.push({ type: 'total_changed', before: order.total_amount, after: totals.total });
      }

      // Write audit log
      if (changes.length > 0) {
        const { error: logErr } = await supabase.from('order_edit_logs' as any).insert({
          order_id: order.id,
          admin_user_id: user.id,
          action: 'edit',
          changes,
          snapshot_before: snapshotBefore,
          snapshot_after: snapshotAfter,
        });
        if (logErr) console.error('Audit log failed:', logErr);
      }

      // Auto-generate purchase orders grouped by vendor
      const vendorItemsMap = activeItems
        .filter(item => item.product_name && item.vendor_id)
        .reduce((acc, item) => {
          const vid = item.vendor_id!;
          if (!acc[vid]) acc[vid] = [];
          acc[vid].push(item);
          return acc;
        }, {} as Record<string, EditableItem[]>);

      for (const [vendorId, vItems] of Object.entries(vendorItemsMap)) {
        try {
          const { data: poNumber } = await supabase.rpc('generate_po_number');
          const subtotal = vItems.reduce((sum, it) => sum + (it.quantity * it.unit_price), 0);
          const taxAmount = vItems.reduce((sum, it) => {
            const gst = calculateLineGST(it, isIGST);
            return sum + gst.cgst + gst.sgst + gst.igst;
          }, 0);

          const { data: po, error: poError } = await supabase
            .from('purchase_orders')
            .insert({
              po_number: poNumber || `PO-AUTO-${Date.now()}`,
              vendor_id: vendorId,
              status: 'draft',
              subtotal,
              tax_amount: taxAmount,
              total_amount: subtotal + taxAmount,
              notes: `Auto-generated from Order #${order.id.slice(0, 8)}`,
            })
            .select()
            .single();

          if (poError) { console.error('Failed to create PO', poError); continue; }

          const poItems = vItems.map(it => ({
            purchase_order_id: po.id,
            product_id: it.product_id || null,
            product_name: it.product_name,
            quantity: it.quantity,
            unit_cost: it.unit_price,
            total_cost: it.quantity * it.unit_price,
          }));

          await supabase.from('purchase_order_items').insert(poItems);
        } catch (e) {
          console.error('PO generation error:', e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orderItems'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
      toast.success('Order updated. Purchase orders generated for assigned vendors.');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Failed to update order: ' + error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Edit Order {order ? `#${order.id.slice(0, 8)}` : ''}
          </DialogTitle>
        </DialogHeader>

        {lockReason ? (
          <div className="flex items-center gap-3 p-4 bg-destructive/10 text-destructive rounded-lg">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{lockReason}</p>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-4">
                {/* Summary */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Current Total: ₹{Number(order?.total_amount || 0).toFixed(2)}</span>
                  <span>→</span>
                  <span className="font-semibold text-foreground">New Total: ₹{totals.total.toFixed(2)}</span>
                  {isIGST ? (
                    <Badge variant="outline" className="text-xs">IGST</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">CGST/SGST</Badge>
                  )}
                </div>

                {/* Items table */}
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Product</TableHead>
                        <TableHead className="w-[130px]">Vendor</TableHead>
                        <TableHead className="w-[80px]">Qty</TableHead>
                        <TableHead className="w-[90px]">Price</TableHead>
                        <TableHead className="w-[70px]">HSN</TableHead>
                        <TableHead className="w-[80px]">GST</TableHead>
                        <TableHead className="w-[80px] text-right">Total</TableHead>
                        <TableHead className="w-[40px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeItems.map((item, idx) => {
                        const gst = calculateLineGST(item, isIGST);
                        return (
                          <TableRow key={item.id || `new-${idx}`}>
                            <TableCell>
                              {item.id ? (
                                <span className="text-sm">{item.product_name}</span>
                              ) : (
                                <Select onValueChange={(v) => selectProduct(idx, v)}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select product" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {products?.map((p) => (
                                      <SelectItem key={p.id} value={p.id} className="text-xs">
                                        {p.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={item.vendor_id || 'none'}
                                onValueChange={(v) => updateItem(idx, 'vendor_id', v === 'none' ? null : v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="No vendor" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none" className="text-xs">No vendor</SelectItem>
                                  {vendors?.map((v) => (
                                    <SelectItem key={v.id} value={v.id} className="text-xs">
                                      {v.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="h-8 w-20 text-xs"
                                value={item.quantity}
                                min={0.0001}
                                step="any"
                                onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                className="h-8 w-20 text-xs"
                                value={item.unit_price}
                                min={0}
                                step="any"
                                onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              />
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">{item.hsn_code || '—'}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs">
                                {item.gst_type === 'Exempt' || item.gst_type === 'Nil-rated'
                                  ? item.gst_type
                                  : `${item.gst_rate}%`}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-medium text-sm">
                              ₹{gst.total.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                                onClick={() => removeItem(idx)}
                                disabled={activeItems.length <= 1}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>

                {/* Totals */}
                <div className="border rounded-lg p-4 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Taxable Value</span>
                    <span>₹{totals.taxableValue.toFixed(2)}</span>
                  </div>
                  {isIGST ? (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">IGST</span>
                      <span>₹{totals.igst.toFixed(2)}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">CGST</span>
                        <span>₹{totals.cgst.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SGST</span>
                        <span>₹{totals.sgst.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between font-bold border-t pt-1">
                    <span>Total</span>
                    <span>₹{totals.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
