import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import type { PartyKey } from './PartyLedgerSheet';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  party: PartyKey | null;
  title?: string;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
];

export function PartyBulkPaymentDialog({ open, onOpenChange, party, title }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('upi'); // nearly all payments come by UPI
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch the party's FULL non-cancelled order history (not just unpaid ones).
  // We need the full list so any payment exceeding what's outstanding has a
  // real, most-recent order to carry forward as credit against — rather than
  // silently discarding the excess, which is what happened before this fix.
  const { data: allOrders } = useQuery({
    queryKey: ['party-bulk-payment-orders', party],
    queryFn: async () => {
      if (!party) return [];
      let q = supabase
        .from('orders')
        .select('id, invoice_number, total_amount, amount_paid, balance_due, created_at, status, invoice_cancelled')
        .neq('status', 'cancelled')
        .eq('invoice_cancelled', false)
        .order('created_at', { ascending: true });
      if (party.type === 'building') q = q.eq('building_name', party.value);
      else if (party.type === 'phone') q = q.eq('phone', party.value);
      else if (party.type === 'email') q = q.eq('customer_email', party.value);
      else if (party.type === 'flat') {
        q = q.eq('flat_number', party.flat);
        if (party.building) q = q.ilike('building_name', party.building);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!party,
  });

  const outstandingOrders = (allOrders || []).filter((o: any) => (Number(o.balance_due) || 0) > 0.01);
  const totalOutstanding = outstandingOrders.reduce((s: number, o: any) => s + (Number(o.balance_due) || 0), 0);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payAmount = parseFloat(amount);
      if (isNaN(payAmount) || payAmount <= 0) throw new Error('Invalid amount');
      if (!allOrders || allOrders.length === 0) throw new Error('No orders found for this party');

      // Keep a working copy of each order's current amount_paid/balance_due,
      // since the anchor order used for any leftover below may be one we
      // already updated earlier in this same loop.
      const state = new Map<string, { amount_paid: number; total_amount: number }>();
      for (const o of allOrders) {
        state.set(o.id, { amount_paid: Number(o.amount_paid) || 0, total_amount: Number(o.total_amount) || 0 });
      }

      let remaining = payAmount;
      let ordersUpdated = 0;
      // One payment, possibly split over several invoices: the records share this id so the
      // ledger shows a single payment of the full amount.
      const batchId = crypto.randomUUID();

      const applyToOrder = async (orderId: string, applied: number) => {
        const { error: payErr } = await supabase.from('customer_payments').insert({
          order_id: orderId,
          amount: applied,
          payment_method: method,
          reference_number: reference || null,
          notes: notes || null,
          recorded_by: user?.id || null,
          payment_batch_id: batchId,
        } as any);
        if (payErr) throw payErr;

        const cur = state.get(orderId)!;
        const newPaid = cur.amount_paid + applied;
        const newBalance = cur.total_amount - newPaid;
        const newStatus = newBalance <= 0.01 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
        const { error: orderErr } = await supabase.from('orders').update({
          amount_paid: newPaid,
          balance_due: newBalance,
          payment_status: newStatus,
        }).eq('id', orderId);
        if (orderErr) throw orderErr;
        state.set(orderId, { ...cur, amount_paid: newPaid });
      };

      // Step 1: settle outstanding orders oldest-first, as before.
      for (const o of allOrders) {
        if (remaining <= 0.001) break;
        const cur = state.get(o.id)!;
        const outstanding = cur.total_amount - cur.amount_paid;
        if (outstanding <= 0.001) continue;
        const applied = Math.min(remaining, outstanding);
        await applyToOrder(o.id, applied);
        remaining -= applied;
        ordersUpdated++;
      }

      // Step 2: any leftover isn't discarded — it's recorded as extra payment
      // on the party's most recent order, which pushes that order's balance
      // negative. This is the same pattern already used for prior manual
      // credit corrections today, and the Credit badge (fixed earlier) now
      // correctly nets this into the party's true outstanding balance
      // everywhere it's shown.
      let carriedForward = 0;
      if (remaining > 0.01) {
        const anchor = allOrders[allOrders.length - 1];
        await applyToOrder(anchor.id, remaining);
        carriedForward = remaining;
        if (!outstandingOrders.some((o: any) => o.id === anchor.id)) {
          ordersUpdated++;
        }
        remaining = 0;
      }

      return { ordersUpdated, carriedForward };
    },
    onSuccess: ({ ordersUpdated, carriedForward }: { ordersUpdated: number; carriedForward: number }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'all-customer-payments'] });
      queryClient.invalidateQueries({ queryKey: ['party-ledger'] });
      if (carriedForward > 0.01) {
        toast.success(`Payment recorded across ${ordersUpdated} order(s). ₹${carriedForward.toFixed(2)} carried forward as credit on their most recent invoice.`);
      } else {
        toast.success(`Payment recorded across ${ordersUpdated} order(s).`);
      }
      setAmount(''); setReference(''); setNotes('');
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record Payment — {title || ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="bg-muted rounded-lg p-3 text-center">
            <p className="text-muted-foreground text-xs">Total Outstanding</p>
            <p className="font-bold text-destructive">{formatCurrency(totalOutstanding)}</p>
            <p className="text-xs text-muted-foreground mt-1">{outstandingOrders?.length || 0} unpaid order(s)</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Amount (₹)</Label>
              <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
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
          <p className="text-xs text-muted-foreground">
            Applied across this party's outstanding orders, oldest first. Any excess is carried forward as credit on their most recent invoice — never lost.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || !amount}>
              {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Record Payment
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}