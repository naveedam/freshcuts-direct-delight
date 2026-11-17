import { useMemo } from 'react';
import { formatIST } from '@/lib/ist';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabase-paginate';
import { groupPayments } from '@/lib/vendor-payments';
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
      const pos = await fetchAllRows<any>(() => supabase
        .from('purchase_orders')
        .select('id, po_number, order_date, total_amount, paid_amount, status, notes')
        .eq('vendor_id', vendorId)
        .neq('status', 'cancelled')
        .order('order_date', { ascending: true })
        .order('id', { ascending: true }));
      const rows = await fetchAllRows<any>(() => (supabase as any)
        .from('vendor_payments')
        .select('id, amount, payment_date, payment_method, reference_number, notes, batch_id, purchase_order_id')
        .eq('vendor_id', vendorId)
        .order('payment_date', { ascending: true })
        .order('id', { ascending: true }));
      // One line per payment made, even when it was shared across several POs.
      return { pos, payments: groupPayments(rows) };
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
    // Outstanding = what's still owed on each PO, as on every vendor tab; paid beyond that is advance.
    const applied = (data?.pos || []).reduce((s, po) => s + Math.min(Number(po.paid_amount) || 0, Number(po.total_amount) || 0), 0);
    const outstanding = Math.round((purchased - applied) * 100) / 100;
    const advance = Math.max(0, Math.round((paid - applied) * 100) / 100);
    return { purchased, paid, outstanding, advance, poCount: data?.pos?.length || 0 };
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
          {totals.advance > 0.5 && <Stat label="Paid in advance" value={formatCurrency(totals.advance)} />}
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
                    <TableCell className="text-xs whitespace-nowrap">{formatIST(r.date, 'dd MMM yyyy')}</TableCell>
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