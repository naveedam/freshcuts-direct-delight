import { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, FileText, Pencil, Save, X, Share2 } from 'lucide-react';
import { ShareInvoiceDialog } from './ShareInvoiceDialog';
import { useAuth } from '@/context/AuthContext';
import { syncPOsFromWeightAdjustment } from '@/lib/po-lifecycle';

interface OrderItem {
  id: string;
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
  actual_weight: number | null;
  vendor_cost: number | null;
}

interface EditableItem {
  id: string;
  product_name: string;
  displayQty: number;
  originalQty: number;
  unitPrice: number;
  gstRate: number;
  gstType: string;
  hsnCode: string | null;
}

interface InvoiceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  orderItems: OrderItem[];
}

function normalizeGstType(raw: string): string {
  const lower = String(raw || '').toLowerCase();
  return lower === 'nil-rated' ? 'nil' : lower;
}

export function InvoiceEditDialog({ open, onOpenChange, order: orderProp, orderItems }: InvoiceEditDialogProps) {
  // Keep showing the last order while the window fades out after closing: the page clears the
  // order straight away, and reading it then crashed the whole Orders screen.
  const lastOrder = useRef(orderProp);
  if (orderProp) lastOrder.current = orderProp;
  const order = orderProp ?? lastOrder.current;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editMode, setEditMode] = useState(false);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (open && orderItems.length > 0) {
      setItems(orderItems.map(item => ({
        id: item.id,
        product_name: item.product_name,
        displayQty: item.actual_weight != null && item.actual_weight > 0 
          ? Number(item.actual_weight) 
          : Number(item.quantity),
        originalQty: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        gstRate: Number(item.gst_rate),
        gstType: item.gst_type,
        hsnCode: item.hsn_code,
      })));
      setEditMode(false);
    }
  }, [open, orderItems]);

  const isIGST = order?.is_igst || false;

  const calculations = useMemo(() => {
    return items.map(item => {
      const lineValue = item.displayQty * item.unitPrice;
      const nt = normalizeGstType(item.gstType);
      let taxableValue = 0, cgst = 0, sgst = 0, igst = 0;
      if (nt === 'taxable' && item.gstRate > 0) {
        taxableValue = lineValue;
        const totalGST = (taxableValue * item.gstRate) / 100;
        if (isIGST) { igst = totalGST; } 
        else { cgst = totalGST / 2; sgst = totalGST / 2; }
      }
      const taxAmount = cgst + sgst + igst;
      const total = lineValue + taxAmount;
      return { ...item, lineValue, taxableValue, cgst, sgst, igst, taxAmount, total };
    });
  }, [items, isIGST]);

  const totals = useMemo(() => {
    let subtotal = 0, totalTax = 0;
    calculations.forEach(c => {
      subtotal += c.lineValue;
      totalTax += c.taxAmount;
    });
    const discountAmount = Number(order?.discount_amount) || 0;
    return { subtotal, totalTax, discountAmount, grandTotal: subtotal + totalTax - discountAmount };
  }, [calculations, order]);

  const handleQtyChange = (id: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, displayQty: num } : i));
  };

  const handleRateChange = (id: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, unitPrice: num } : i));
  };

  const handleGstChange = (id: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 28) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, gstRate: num } : i));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Update each order item
      for (const calc of calculations) {
        const { error } = await supabase.from('order_items').update({
          actual_weight: calc.displayQty,
          unit_price: calc.unitPrice,
          total_price: calc.lineValue,
          gst_rate: calc.gstRate,
          taxable_value: calc.taxableValue,
          cgst_amount: calc.cgst,
          sgst_amount: calc.sgst,
          igst_amount: calc.igst,
          weight_adjusted_at: new Date().toISOString(),
        }).eq('id', calc.id);
        if (error) throw error;
      }

      // Update order total and recompute balance due against amount already paid
      const amountPaid = Number(order.amount_paid) || 0;
      const newBalanceDue = Math.max(0, totals.grandTotal - amountPaid);
      const newPaymentStatus = newBalanceDue <= 0.01 ? 'paid' : (amountPaid > 0 ? 'partial' : 'unpaid');
      const { error: orderError } = await supabase.from('orders').update({
        total_amount: totals.grandTotal,
        balance_due: newBalanceDue,
        payment_status: newPaymentStatus,
      }).eq('id', order.id);
      if (orderError) throw orderError;

      // Log audit trail
      const snapshotBefore = orderItems.map(i => ({
        id: i.id, product_name: i.product_name,
        quantity: i.quantity, actual_weight: i.actual_weight,
        unit_price: i.unit_price, gst_rate: i.gst_rate,
      }));
      const snapshotAfter = calculations.map(c => ({
        id: c.id, product_name: c.product_name,
        quantity: c.originalQty, actual_weight: c.displayQty,
        unit_price: c.unitPrice, gst_rate: c.gstRate,
      }));

      await supabase.from('order_edit_logs').insert({
        order_id: order.id,
        admin_user_id: user?.id || '',
        action: 'invoice_edit',
        snapshot_before: snapshotBefore,
        snapshot_after: snapshotAfter,
        changes: calculations.map(c => {
          const orig = orderItems.find(o => o.id === c.id);
          return {
            item_id: c.id, product_name: c.product_name,
            qty_before: orig?.actual_weight ?? orig?.quantity,
            qty_after: c.displayQty,
            rate_before: orig?.unit_price,
            rate_after: c.unitPrice,
            gst_before: orig?.gst_rate,
            gst_after: c.gstRate,
          };
        }),
      });

      // Resync linked vendor PO(s) with the corrected actual weights
      return await syncPOsFromWeightAdjustment(order.id);
    },
    onSuccess: (poSyncResult) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orderItems'] });
      toast.success('Invoice items updated successfully');
      if (poSyncResult && poSyncResult.success === false) {
        toast.warning('Invoice updated, but vendor PO sync failed: ' + (poSyncResult.error || 'unknown error') + '. Please check the purchase order manually.');
      }
      setEditMode(false);
    },
    onError: (error) => {
      toast.error('Failed to save: ' + error.message);
    },
  });

  const handleSave = () => {
    // Validate
    for (const item of items) {
      if (item.displayQty <= 0) {
        toast.error(`Quantity must be > 0 for ${item.product_name}`);
        return;
      }
      if (item.unitPrice <= 0) {
        toast.error(`Rate must be > 0 for ${item.product_name}`);
        return;
      }
      if (item.gstRate < 0 || item.gstRate > 28) {
        toast.error(`GST must be 0–28% for ${item.product_name}`);
        return;
      }
    }
    saveMutation.mutate();
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoice', {
        body: { orderId: order.id },
      });
      if (error) throw error;
      const blob = new Blob([data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      toast.success('Invoice generated');
    } catch (error: any) {
      toast.error('Failed to generate invoice: ' + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const formatCurrency = (n: number) => `₹${n.toFixed(2)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice Preview — #{order?.id?.slice(0, 8).toUpperCase()}
              {order?.invoice_number && (
                <Badge variant="secondary" className="ml-2">{order.invoice_number}</Badge>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2">
              {!editMode ? (
                <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit Invoice
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditMode(false);
                    // Reset items
                    setItems(orderItems.map(item => ({
                      id: item.id,
                      product_name: item.product_name,
                      displayQty: item.actual_weight != null && item.actual_weight > 0 
                        ? Number(item.actual_weight) : Number(item.quantity),
                      originalQty: Number(item.quantity),
                      unitPrice: Number(item.unit_price),
                      gstRate: Number(item.gst_rate),
                      gstType: item.gst_type,
                      hsnCode: item.hsn_code,
                    })));
                  }}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Save & Recalculate
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead className="text-center">Qty (kg)</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-center">GST %</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculations.map((calc, idx) => {
                const item = items.find(i => i.id === calc.id)!;
                const origItem = orderItems.find(o => o.id === calc.id);
                const qtyMismatch = origItem && item.displayQty !== Number(origItem.quantity);

                return (
                  <TableRow key={calc.id}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{calc.product_name}</span>
                        {qtyMismatch && (
                          <span className="block text-xs text-muted-foreground">
                            Ordered: {Number(origItem!.quantity).toFixed(3)} kg
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{calc.hsnCode || '-'}</TableCell>
                    <TableCell className="text-center">
                      {editMode ? (
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={item.displayQty}
                          onChange={(e) => handleQtyChange(item.id, e.target.value)}
                          className="w-24 h-8 text-center text-sm"
                        />
                      ) : (
                        <span>{item.displayQty.toFixed(3)}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editMode ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={item.unitPrice}
                          onChange={(e) => handleRateChange(item.id, e.target.value)}
                          className="w-24 h-8 text-right text-sm"
                        />
                      ) : (
                        formatCurrency(item.unitPrice)
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(calc.lineValue)}</TableCell>
                    <TableCell className="text-center">
                      {editMode ? (
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max="28"
                          value={item.gstRate}
                          onChange={(e) => handleGstChange(item.id, e.target.value)}
                          className="w-20 h-8 text-center text-sm"
                        />
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {normalizeGstType(item.gstType) === 'exempt' ? 'Exempt' : 
                           normalizeGstType(item.gstType) === 'nil' ? 'NIL' : `${item.gstRate}%`}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(calc.taxAmount)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(calc.total)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-72 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Tax</span>
              <span>{formatCurrency(totals.totalTax)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Discount</span>
                <span>-{formatCurrency(totals.discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>Grand Total</span>
              <span>{formatCurrency(totals.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" onClick={() => setShareOpen(true)} disabled={editMode}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button onClick={handleGenerate} disabled={generating || editMode}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Generate Invoice PDF
          </Button>
        </div>

        <ShareInvoiceDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          order={order}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
