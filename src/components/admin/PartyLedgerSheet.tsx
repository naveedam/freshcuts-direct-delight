import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

export type PartyKey =
  | { type: 'building'; value: string }
  | { type: 'flat'; building?: string | null; flat: string }
  | { type: 'phone'; value: string }
  | { type: 'email'; value: string };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  party: PartyKey | null;
  title?: string;
}

export function PartyLedgerSheet({ open, onOpenChange, party, title }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['party-ledger', party],
    queryFn: async () => {
      if (!party) return { orders: [], payments: [] };
      let q = supabase
        .from('orders')
        .select('id, created_at, invoice_number, total_amount, amount_paid, balance_due, payment_status, status, invoice_cancelled, building_name, flat_number, phone, customer_email');
      if (party.type === 'building') q = q.eq('building_name', party.value);
      else if (party.type === 'phone') q = q.eq('phone', party.value);
      else if (party.type === 'email') q = q.eq('customer_email', party.value);
      else if (party.type === 'flat') {
        q = q.eq('flat_number', party.flat);
        if (party.building) q = q.ilike('building_name', party.building);
      }
      const { data: orders, error } = await q.order('created_at', { ascending: true });
      if (error) throw error;
      const ids = (orders || []).map((o) => o.id);
      let payments: any[] = [];
      if (ids.length) {
        const { data: pays, error: pErr } = await supabase
          .from('customer_payments')
          .select('*')
          .in('order_id', ids)
          .order('payment_date', { ascending: true });
        if (pErr) throw pErr;
        payments = pays || [];
      }
      return { orders: orders || [], payments };
    },
    enabled: open && !!party,
  });

  const rows = useMemo(() => {
    if (!data) return [] as any[];
    type Row = { date: string; type: 'invoice' | 'payment'; ref: string; note?: string | null; split?: number; debit: number; credit: number; balance: number; cancelled?: boolean };
    const events: Omit<Row, 'balance'>[] = [];
    for (const o of data.orders) {
      if (o.invoice_cancelled) continue;
      events.push({
        date: o.created_at,
        type: 'invoice',
        ref: o.invoice_number || `#${o.id.slice(0, 8).toUpperCase()}`,
        debit: Number(o.total_amount) || 0,
        credit: 0,
      });
    }
    // A payment recorded for the party is saved split across the invoices it settles; those
    // records share a payment_batch_id and are shown here as the one payment that was made.
    const batches = new Map<string, any[]>();
    for (const p of data.payments) {
      const key = p.payment_batch_id || p.id;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key)!.push(p);
    }
    for (const list of batches.values()) {
      const p = list[0];
      events.push({
        date: list.reduce((d: string, x: any) => (x.payment_date < d ? x.payment_date : d), p.payment_date),
        type: 'payment',
        ref: `${String(p.payment_method).replace('_', ' ')}${p.reference_number ? ` · ${p.reference_number}` : ''}`,
        note: list.map((x: any) => x.notes).find(Boolean) || null,
        split: list.length,
        debit: 0,
        credit: list.reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0),
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
    const billed = (data?.orders || [])
      .filter((o) => !o.invoice_cancelled)
      .reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const paid = (data?.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return { billed, paid, outstanding: billed - paid, orderCount: data?.orders?.length || 0 };
  }, [data]);

  // Ageing buckets based on order created_at, only outstanding portion per order
  const ageing = useMemo(() => {
    const buckets = { '0-7': 0, '8-15': 0, '16-30': 0, '30+': 0 } as Record<string, number>;
    if (!data) return buckets;
    const now = Date.now();
    const paidByOrder = new Map<string, number>();
    for (const p of data.payments) {
      paidByOrder.set(p.order_id, (paidByOrder.get(p.order_id) || 0) + (Number(p.amount) || 0));
    }
    // Advances (payment beyond an invoice's own total) are pooled and applied to
    // the party's shortfalls oldest-first, so ageing reflects what is truly owed.
    const sorted = [...data.orders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let pool = 0;
    const shortfalls: { created_at: string; amount: number }[] = [];
    for (const o of sorted) {
      const total = o.invoice_cancelled ? 0 : (Number(o.total_amount) || 0);
      const paid = paidByOrder.get(o.id) || 0;
      if (paid - total > 0.005) pool += paid - total;
      else if (total - paid > 0.005) shortfalls.push({ created_at: o.created_at, amount: total - paid });
    }
    for (const s of shortfalls) {
      const applied = Math.min(s.amount, pool);
      pool -= applied;
      const out = s.amount - applied;
      if (out <= 0.01) continue;
      const days = Math.floor((now - new Date(s.created_at).getTime()) / 86400000);
      if (days <= 7) buckets['0-7'] += out;
      else if (days <= 15) buckets['8-15'] += out;
      else if (days <= 30) buckets['16-30'] += out;
      else buckets['30+'] += out;
    }
    return buckets;
  }, [data]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Ledger — {title || (party && 'value' in party ? party.value : party?.type)}
          </SheetTitle>
        </SheetHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <Stat label="Orders" value={String(totals.orderCount)} />
          <Stat label="Billed" value={formatCurrency(totals.billed)} />
          <Stat label="Paid" value={formatCurrency(totals.paid)} tone="green" />
          <Stat label="Outstanding" value={formatCurrency(totals.outstanding)} tone={totals.outstanding > 0 ? 'red' : 'green'} />
        </div>

        <div className="grid grid-cols-4 gap-2 mt-3">
          {Object.entries(ageing).map(([k, v]) => (
            <div key={k} className="border rounded-md p-2 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">{k} days</p>
              <p className="text-sm font-semibold">{formatCurrency(v)}</p>
            </div>
          ))}
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
                      {r.type === 'invoice' ? (
                        <Badge variant="outline" className="text-[10px]">Invoice</Badge>
                      ) : (
                        <Badge className="bg-green-600 text-[10px]">Payment</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono">{r.ref}</span>
                      {r.note && <span className="block text-muted-foreground whitespace-normal">{r.note}</span>}
                      {r.split > 1 && <span className="block text-[10px] text-muted-foreground">Settled {r.split} invoices</span>}
                    </TableCell>
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