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
import { Plus, Loader2, CreditCard, Wallet, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/currency';
import { Vendor, VendorPayment } from '@/types/vendor';
import { format } from 'date-fns';

interface VendorPaymentsDialogProps {
  vendor: Vendor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VendorPaymentsDialog({ vendor, open, onOpenChange }: VendorPaymentsDialogProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

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

  const { data: paymentStats } = useQuery({
    queryKey: ['vendor-payment-stats', vendor.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_payments')
        .select('amount')
        .eq('vendor_id', vendor.id);
      
      if (error) throw error;

      const totalPaid = data.reduce((sum, p) => sum + Number(p.amount), 0);
      return { totalPaid, paymentCount: data.length };
    },
    enabled: open
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('vendor_payments').insert({
        vendor_id: vendor.id,
        amount: parseFloat(amount),
        payment_method: paymentMethod,
        reference_number: referenceNumber || null,
        notes: notes || null
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-payments', vendor.id] });
      queryClient.invalidateQueries({ queryKey: ['vendor-payment-stats', vendor.id] });
      toast.success('Payment recorded successfully');
      resetAddForm();
    },
    onError: (error) => {
      toast.error('Failed to record payment: ' + error.message);
    }
  });

  const resetAddForm = () => {
    setIsAdding(false);
    setAmount('');
    setPaymentMethod('bank_transfer');
    setReferenceNumber('');
    setNotes('');
  };

  const getPaymentMethodBadge = (method: string) => {
    const methods: Record<string, { label: string; className: string }> = {
      bank_transfer: { label: 'Bank Transfer', className: 'bg-blue-100 text-blue-800' },
      cash: { label: 'Cash', className: 'bg-green-100 text-green-800' },
      cheque: { label: 'Cheque', className: 'bg-yellow-100 text-yellow-800' },
      upi: { label: 'UPI', className: 'bg-purple-100 text-purple-800' },
      other: { label: 'Other', className: 'bg-gray-100 text-gray-800' }
    };
    const config = methods[method] || methods.other;
    return <Badge className={`${config.className} hover:${config.className}`}>{config.label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payments to {vendor.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                <IndianRupee className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(paymentStats?.totalPaid || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{paymentStats?.paymentCount || 0}</div>
              </CardContent>
            </Card>
          </div>

          {/* Add Payment Form */}
          {isAdding ? (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount (₹) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reference Number</Label>
                <Input
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Transaction ID, Cheque No., etc."
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Additional notes..."
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetAddForm}>
                  Cancel
                </Button>
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

          {/* Payments Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
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
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    </TableRow>
                  ))
                ) : payments && payments.length > 0 ? (
                  payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {format(new Date(payment.payment_date), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>{getPaymentMethodBadge(payment.payment_method)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {payment.reference_number || '-'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {payment.notes || '-'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
