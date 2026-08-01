import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vendorId: string | null;
  vendorName?: string;
}

export function VendorLedgerSheet({ open, onOpenChange, vendorId, vendorName }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['vendor-ledger-sheet', vendorId],
    queryFn: async () => {
      if (!vendorId) return { pos: [], payments: [] };
      const { data: pos, error } = await supabase
        .from('purchase_orders')
        .select('id, po_number, order_date, total_amount, status, notes')
        .eq('vendor_id', vendorId)
        .neq('status', 'cancelled')
        .order('order_date', { ascending: true });
      if (error) throw error;
      const { data: payments, error: pErr } = await supabase
        .from('vendor_payments')
        .select('id, amount, payment_date, payment_method, reference_number, notes')
        .eq('vendor_id', vendorId)
        .order('payment_date', { ascending: true });
      if (pErr) throw pErr;
      return { pos: pos || [], payments: payments || [] };
    },
    enabled: open && !!vendorId,
  });

  const rows = useMemo(() => {
    if (!data) return [] as any[];
    type Row = { date: string; type: 'po' | 'payment'; ref: string; debit: number; credit: number; balance: number };
    const events: Omit<Row, 'balance'>[] = [];
    for (const po of data.pos) {
      events.push({
        date: po.order_date,
        type: 'po',
        ref: po.po_number,
        debit: Number(po.total_amount) || 0,
        credit: 0,
      });
    }
    for (const p of data.payments) {
      events.push({
        date: p.payment_date,
        type: 'payment',
        ref: `${p.payment_method}${p.reference_number ? ` · ${p.reference_number}` : ''}`,
        debit: 0,
        credit: Number(p.amount) || 0,
      });
    }
    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let bal = 0;
    return events.map((e) => {
      bal += e.debit - e.credit;
      return { ...e, balance: bal } as Row;
    });
  }, [data]);

  const totals = useMemo(() => {
    const purchased = (data?.pos || []).reduce((s, po) => s + (Number(po.total_amount) || 0), 0);
    const paid = (data?.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { purchased, paid, outstanding: purchased - paid, poCount: data?.pos?.length || 0 };
  }, [data]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Vendor Ledger — {vendorName || ''}
          </SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <Stat label="POs" value={String(totals.poCount)} />
          <Stat label="Purchased" value={formatCurrency(totals.purchased)} />
          <Stat label="Paid" value={formatCurrency(totals.paid)} tone="green" />
          <Stat label="Outstanding" value={formatCurrency(totals.outstanding)} tone={totals.outstanding > 0 ? 'red' : 'green'} />
        </div>

        <div className="border rounded-lg overflow-hidden mt-4">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No transactions</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Ref</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(r.date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>
                      {r.type === 'po' ? (
                        <Badge variant="outline" className="text-[10px]">Purchase</Badge>
                      ) : (
                        <Badge className="bg-green-600 text-[10px]">Payment</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{r.ref}</TableCell>
                    <TableCell className="text-right text-xs">{r.debit ? formatCurrency(r.debit) : '—'}</TableCell>
                    <TableCell className="text-right text-xs text-green-700">{r.credit ? formatCurrency(r.credit) : '—'}</TableCell>
                    <TableCell className={`text-right text-xs font-semibold ${r.balance > 0 ? 'text-destructive' : 'text-foreground'}`}>{formatCurrency(r.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const color = tone === 'green' ? 'text-green-600' : tone === 'red' ? 'text-destructive' : 'text-foreground';
  return (
    <div className="border rounded-md p-2 text-center">
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}