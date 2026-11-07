import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Plus, IndianRupee, CreditCard } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

interface OrderPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
];

export function OrderPaymentDialog({ open, onOpenChange, order }: OrderPaymentDialogProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const { data: payments, isLoading } = useQuery({
    queryKey: ['customer_payments', order?.id],
    queryFn: async () => {
      if (!order) return [];
      const { data, error } = await supabase
        .from('customer_payments')
        .select('*')
        .eq('order_id', order.id)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!order && open,
  });

  const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
  const orderTotal = Number(order?.total_amount) || 0;
  const balanceDue = orderTotal - totalPaid;

  // Open straight into the payment form with the balance filled in, so a full payment is one click.
  useEffect(() => {
    if (!open || isLoading || !payments) return;
    if (balanceDue > 0.01) {
      setAmount(balanceDue.toFixed(2));
      setShowForm(true);
    } else {
      setShowForm(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading, order?.id]);

  const addPaymentMutation = useMutation({
    mutationFn: async () => {
      const payAmount = parseFloat(amount);
      if (isNaN(payAmount) || payAmount <= 0) throw new Error('Invalid amount');
      // Excess payments allowed — will show as credit (negative balance)

      const { error: payError } = await supabase.from('customer_payments').insert({
        order_id: order.id,
        amount: payAmount,
        payment_method: method,
        reference_number: reference || null,
        notes: notes || null,
        recorded_by: user?.id || null,
      });
      if (payError) throw payError;

      const newTotalPaid = totalPaid + payAmount;
      const newBalance = orderTotal - newTotalPaid;
      const newStatus = newBalance <= 0.01 ? 'paid' : newTotalPaid > 0 ? 'partial' : 'unpaid';

      const { error: orderErr } = await supabase.from('orders').update({
        amount_paid: newTotalPaid,
        balance_due: newBalance,
        payment_status: newStatus,
      }).eq('id', order.id);
      if (orderErr) throw orderErr;
      return newStatus;
    },
    onSuccess: (newStatus) => {
      queryClient.invalidateQueries({ queryKey: ['customer_payments', order?.id] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      // Paid badges, invoice dues and Party Due are worked out from all payments: refresh them too.
      queryClient.invalidateQueries({ queryKey: ['admin', 'all-customer-payments'] });
      queryClient.invalidateQueries({ queryKey: ['party-ledger'] });
      toast.success('Payment recorded');
      setShowForm(false);
      setAmount('');
      setReference('');
      setNotes('');
      // Fully paid: nothing left to do here.
      if (newStatus === 'paid') onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge className="bg-green-600 text-xs">Paid</Badge>;
      case 'partial': return <Badge className="bg-yellow-500 text-xs">Partial</Badge>;
      default: return <Badge variant="destructive" className="text-xs">Unpaid</Badge>;
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payments — #{order.id.slice(0, 8).toUpperCase()}
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-muted rounded-lg p-3 text-center">
            <p className="text-muted-foreground text-xs">Order Total</p>
            <p className="font-bold">{formatCurrency(orderTotal)}</p>
          </div>
          <div className="bg-muted rounded-lg p-3 text-center">
            <p className="text-muted-foreground text-xs">Paid</p>
            <p className="font-bold text-green-600">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="bg-muted rounded-lg p-3 text-center">
            <p className="text-muted-foreground text-xs">Balance Due</p>
            <p className={`font-bold ${balanceDue > 0 ? 'text-destructive' : 'text-green-600'}`}>
              {formatCurrency(Math.max(0, balanceDue))}
            </p>
          </div>
        </div>

        <div className="text-center">
          {getStatusBadge(balanceDue <= 0.01 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid')}
        </div>

        {/* Payment History */}
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : payments && payments.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{new Date(p.payment_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">{p.payment_method.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.reference_number || '-'}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(p.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">No payments recorded yet</p>
        )}

        {/* Add Payment Form */}
        {showForm ? (
          <div className="space-y-3 border rounded-lg p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={balanceDue}
                  placeholder={`Max: ${balanceDue.toFixed(2)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Reference Number (optional)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI ID / Txn ref" />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={() => addPaymentMutation.mutate()} disabled={addPaymentMutation.isPending || !amount}>
                {addPaymentMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Record Payment
              </Button>
            </div>
          </div>
        ) : balanceDue > 0.01 ? (
          <Button variant="outline" onClick={() => setShowForm(true)} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Payment
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
