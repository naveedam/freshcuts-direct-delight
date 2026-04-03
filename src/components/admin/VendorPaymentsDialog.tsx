import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Loader2, IndianRupee, Wallet, AlertTriangle, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/currency';
import { Vendor, VendorPayment } from '@/types/vendor';
import { format } from 'date-fns';

interface VendorPaymentsDialogProps {
  vendor: Vendor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedPoId?: string | null;
}

export function VendorPaymentsDialog({ vendor, open, onOpenChange, preselectedPoId }: VendorPaymentsDialogProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedPoId, setSelectedPoId] = useState<string>(preselectedPoId || '');

  // Fetch payments
  const { data: payments, isLoading } = useQuery({
    queryKey: ['vendor-payments', vendor.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_payments')
        .select('*')
        .eq('vendor_id', vendor.id)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data as VendorPayment[];
    },
    enabled: open
  });

  // Fetch vendor POs for linkage
  const { data: vendorPOs } = useQuery({
    queryKey: ['vendor-pos', vendor.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, total_amount, paid_amount, payment_status, status')
        .eq('vendor_id', vendor.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open
  });

  // Compute financial stats
  const stats = (() => {
    const totalPayable = vendorPOs?.reduce((sum, po) => sum + Number(po.total_amount), 0) || 0;
    const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
    const balance = totalPayable - totalPaid;
    return { totalPayable, totalPaid, balance };
  })();

  // Get max payable for selected PO
  const getMaxPayableForPO = (poId: string) => {
    if (!poId || !vendorPOs || !payments) return Infinity;
    const po = vendorPOs.find(p => p.id === poId);
    if (!po) return Infinity;
    const paidForPO = payments
      .filter(p => p.purchase_order_id === poId)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    return Math.max(0, Number(po.total_amount) - paidForPO);
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const payAmount = parseFloat(amount);
      
      // Overpayment check
      if (selectedPoId) {
        const maxPayable = getMaxPayableForPO(selectedPoId);
        if (payAmount > maxPayable) {
          throw new Error(`Amount exceeds outstanding balance of ${formatCurrency(maxPayable)} for this PO`);
        }
      }

      const { error } = await supabase.from('vendor_payments').insert({
        vendor_id: vendor.id,
        purchase_order_id: selectedPoId || null,
        amount: payAmount,
        payment_method: paymentMethod,
        reference_number: referenceNumber || null,
        notes: notes || null
      });
      if (error) throw error;

      // Update PO payment status if linked
      if (selectedPoId) {
        const po = vendorPOs?.find(p => p.id === selectedPoId);
        if (po) {
          const currentPaid = payments
            ?.filter(p => p.purchase_order_id === selectedPoId)
            .reduce((sum, p) => sum + Number(p.amount), 0) || 0;
          const newPaid = currentPaid + payAmount;
          const poTotal = Number(po.total_amount);
          const newStatus = newPaid >= poTotal ? 'paid' : newPaid > 0 ? 'partial' : 'pending';
          
          await supabase.from('purchase_orders').update({
            paid_amount: newPaid,
            payment_status: newStatus
          }).eq('id', selectedPoId);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-payments', vendor.id] });
      queryClient.invalidateQueries({ queryKey: ['vendor-pos', vendor.id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendor-financial-stats'] });
      toast.success('Payment recorded successfully');
      resetAddForm();
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const resetAddForm = () => {
    setIsAdding(false);
    setAmount('');
    setPaymentMethod('bank_transfer');
    setReferenceNumber('');
    setNotes('');
    setSelectedPoId(preselectedPoId || '');
  };

  const getPaymentMethodBadge = (method: string) => {
    const methods: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      bank_transfer: { label: 'Bank Transfer', variant: 'default' },
      cash: { label: 'Cash', variant: 'secondary' },
      cheque: { label: 'Cheque', variant: 'outline' },
      upi: { label: 'UPI', variant: 'default' },
      other: { label: 'Other', variant: 'outline' }
    };
    const config = methods[method] || methods.other;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const maxPayable = selectedPoId ? getMaxPayableForPO(selectedPoId) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payments — {vendor.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Financial Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats.totalPayable)}</div>
                <p className="text-xs text-muted-foreground">From {vendorPOs?.length || 0} POs</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                <IndianRupee className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalPaid)}</div>
                <p className="text-xs text-muted-foreground">{payments?.length || 0} transactions</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${stats.balance > 0 ? 'text-destructive' : 'text-green-600'}`}>
                  {formatCurrency(Math.max(0, stats.balance))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Add Payment Form */}
          {isAdding ? (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Link to Purchase Order</Label>
                  <Select value={selectedPoId} onValueChange={setSelectedPoId}>
                    <SelectTrigger>
                      <SelectValue placeholder="General payment (no PO)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">General Payment</SelectItem>
                      {vendorPOs?.map(po => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.po_number} — {formatCurrency(po.total_amount)}
                          {po.payment_status === 'paid' ? ' ✓' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (₹) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={maxPayable !== undefined && maxPayable !== Infinity ? maxPayable : undefined}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                  {maxPayable !== undefined && maxPayable !== Infinity && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Max payable: {formatCurrency(maxPayable)}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reference Number</Label>
                  <Input
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="Transaction ID, Cheque No."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Additional notes..." />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetAddForm}>Cancel</Button>
                <Button
                  onClick={() => addMutation.mutate()}
                  disabled={!amount || parseFloat(amount) <= 0 || addMutation.isPending}
                >
                  {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Record Payment
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          )}

          {/* Payment History */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>PO</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-20" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : payments && payments.length > 0 ? (
                  payments.map((payment) => {
                    const linkedPO = vendorPOs?.find(po => po.id === payment.purchase_order_id);
                    return (
                      <TableRow key={payment.id}>
                        <TableCell>{format(new Date(payment.payment_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {linkedPO?.po_number || '-'}
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(payment.amount)}</TableCell>
                        <TableCell>{getPaymentMethodBadge(payment.payment_method)}</TableCell>
                        <TableCell className="font-mono text-sm">{payment.reference_number || '-'}</TableCell>
                        <TableCell className="max-w-[150px] truncate">{payment.notes || '-'}</TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No payments recorded for this vendor.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
