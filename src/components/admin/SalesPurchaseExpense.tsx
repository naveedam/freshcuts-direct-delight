import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRowsFast } from '@/lib/supabase-paginate';
import { addDays, istDateOf, istDayEnd, istDayStart, istToday, formatIST } from '@/lib/ist';
import { formatCurrency } from '@/lib/currency';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

// Sales, purchases and expenses for a chosen period, on the same basis as the rest of the app:
//  · Sales     — invoiced orders (converted to sale, not cancelled), by order date (IST)
//  · Purchase  — purchase orders (not cancelled), by PO date, as on the vendor tabs
//  · Expense   — as counted in profit on the Expenses page: daily costs on their date, packaging and
//                overheads shared out over their month, capital purchases left out

type Preset =
  | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter'
  | 'this_fy' | 'last_fy' | 'last_12_months' | 'last_30_days' | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'this_quarter', label: 'This quarter' },
  { value: 'last_quarter', label: 'Last quarter' },
  { value: 'this_fy', label: 'This financial year' },
  { value: 'last_fy', label: 'Last financial year' },
  { value: 'last_12_months', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom dates' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-12
const monthEnd = (y: number, m: number) => `${y}-${pad(m)}-${pad(lastDayOf(y, m))}`;
const shiftMonth = (y: number, m: number, by: number) => {
  const t = y * 12 + (m - 1) + by;
  return { y: Math.floor(t / 12), m: (t % 12) + 1 };
};

function rangeFor(p: Preset): { from: string; to: string } | null {
  const today = istToday();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  switch (p) {
    case 'this_month': return { from: `${y}-${pad(m)}-01`, to: today };
    case 'last_month': { const l = shiftMonth(y, m, -1); return { from: `${l.y}-${pad(l.m)}-01`, to: monthEnd(l.y, l.m) }; }
    case 'last_30_days': return { from: addDays(today, -29), to: today };
    case 'this_quarter': { // financial quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar
      const qStart = m >= 4 ? 4 + Math.floor((m - 4) / 3) * 3 : 1;
      return { from: `${y}-${pad(qStart)}-01`, to: today };
    }
    case 'last_quarter': {
      const qStart = m >= 4 ? 4 + Math.floor((m - 4) / 3) * 3 : 1;
      const s = shiftMonth(y, qStart, -3);
      const e = shiftMonth(s.y, s.m, 2);
      return { from: `${s.y}-${pad(s.m)}-01`, to: monthEnd(e.y, e.m) };
    }
    case 'this_fy': { const fy = m >= 4 ? y : y - 1; return { from: `${fy}-04-01`, to: today }; }
    case 'last_fy': { const fy = (m >= 4 ? y : y - 1) - 1; return { from: `${fy}-04-01`, to: `${fy + 1}-03-31` }; }
    case 'last_12_months': { const s = shiftMonth(y, m, -11); return { from: `${s.y}-${pad(s.m)}-01`, to: today }; }
    default: return null;
  }
}

const daysBetween = (a: string, b: string) =>
  Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
              Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

type Grain = 'day' | 'month';
const bucketOf = (day: string, grain: Grain) => (grain === 'day' ? day : day.slice(0, 7));
const bucketLabel = (key: string, grain: Grain) =>
  grain === 'day' ? formatIST(`${key}T12:00:00+05:30`, 'dd MMM') : formatIST(`${key}-15T12:00:00+05:30`, 'MMM yy');

function bucketsBetween(from: string, to: string, grain: Grain): string[] {
  const out: string[] = [];
  if (grain === 'day') {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  } else {
    let y = +from.slice(0, 4), m = +from.slice(5, 7);
    const endKey = to.slice(0, 7);
    for (;;) {
      const k = `${y}-${pad(m)}`;
      out.push(k);
      if (k >= endKey) break;
      ({ y, m } = shiftMonth(y, m, 1));
    }
  }
  return out;
}

export function SalesPurchaseExpense() {
  const [preset, setPreset] = useState<Preset>('this_fy');
  const [custom, setCustom] = useState(() => rangeFor('this_month')!);
  const [excludeRecon, setExcludeRecon] = useState(false);
  const range = preset === 'custom' ? custom : rangeFor(preset)!;
  const valid = range.from && range.to && range.from <= range.to;
  const grain: Grain = valid && daysBetween(range.from, range.to) <= 45 ? 'day' : 'month';

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['exec-spe', range.from, range.to],
    enabled: !!valid,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const db = supabase as any;
      const [orders, pos, reconLines, expenses] = await Promise.all([
        fetchAllRowsFast<any>(() => db.from('orders')
          .select('id, total_amount, created_at, status, converted_to_sale, invoice_cancelled')
          .gte('created_at', istDayStart(range.from)).lte('created_at', istDayEnd(range.to))
          .order('id')),
        fetchAllRowsFast<any>(() => db.from('purchase_orders')
          .select('id, total_amount, order_date')
          .neq('status', 'cancelled')
          .gte('order_date', istDayStart(range.from)).lte('order_date', istDayEnd(range.to))
          .order('id')),
        // Reconciliation lines added by hand when matching vendor workbooks (catch-up from earlier periods).
        fetchAllRowsFast<any>(() => db.from('purchase_order_items')
          .select('id, total_cost, tax_amount, purchase_orders!inner(order_date, status)')
          .ilike('product_name', 'Reconciliation%')
          .neq('purchase_orders.status', 'cancelled')
          .gte('purchase_orders.order_date', istDayStart(range.from))
          .lte('purchase_orders.order_date', istDayEnd(range.to))
          .order('id')),
        // Spread expenses cover the month of their date, so look a month either side.
        fetchAllRowsFast<any>(() => db.from('expenses')
          .select('id, amount, category, expense_date, expense_type, spread_from, spread_to')
          .neq('expense_type', 'capital')
          .gte('expense_date', addDays(range.from, -40)).lte('expense_date', addDays(range.to, 40))
          .order('id')),
      ]);
      return { orders, pos, reconLines, expenses };
    },
  });

  const view = useMemo(() => {
    if (!data || !valid) return null;
    const keys = bucketsBetween(range.from, range.to, grain);
    const rows = new Map(keys.map((k) => [k, { key: k, sales: 0, purchase: 0, expense: 0, orders: 0 }]));
    const add = (day: string, field: 'sales' | 'purchase' | 'expense', amt: number) => {
      const r = rows.get(bucketOf(day, grain));
      if (r) r[field] += amt;
    };

    for (const o of data.orders) {
      if (!o.converted_to_sale || o.invoice_cancelled || o.status === 'cancelled') continue;
      const day = istDateOf(o.created_at);
      add(day, 'sales', Number(o.total_amount) || 0);
      const r = rows.get(bucketOf(day, grain)); if (r) r.orders += 1;
    }

    let reconTotal = 0;
    for (const l of data.reconLines) {
      const amt = (Number(l.total_cost) || 0) + (Number(l.tax_amount) || 0);
      reconTotal += amt;
      if (excludeRecon) add(istDateOf(l.purchase_orders.order_date), 'purchase', -amt);
    }
    for (const p of data.pos) add(istDateOf(p.order_date), 'purchase', Number(p.total_amount) || 0);

    // Expenses: daily ones on their date; spread ones shared out evenly per day of their span.
    const byCategory = new Map<string, number>();
    for (const e of data.expenses) {
      const amt = Number(e.amount) || 0;
      if (!e.spread_from) {
        if (e.expense_date >= range.from && e.expense_date <= range.to) {
          add(e.expense_date, 'expense', amt);
          byCategory.set(e.category, (byCategory.get(e.category) || 0) + amt);
        }
        continue;
      }
      const span = daysBetween(e.spread_from, e.spread_to) + 1;
      const from = e.spread_from > range.from ? e.spread_from : range.from;
      const to = e.spread_to < range.to ? e.spread_to : range.to;
      for (let d = from; d <= to; d = addDays(d, 1)) {
        add(d, 'expense', amt / span);
        byCategory.set(e.category, (byCategory.get(e.category) || 0) + amt / span);
      }
    }

    const series = keys.map((k) => {
      const r = rows.get(k)!;
      const net = r.sales - r.purchase - r.expense;
      return { ...r, label: bucketLabel(k, grain), gross: r.sales - r.purchase, net };
    });
    const sum = (f: 'sales' | 'purchase' | 'expense' | 'orders') => series.reduce((s, r) => s + r[f], 0);
    const sales = sum('sales'), purchase = sum('purchase'), expense = sum('expense');
    return {
      series,
      totals: { sales, purchase, expense, orders: sum('orders'), gross: sales - purchase, net: sales - purchase - expense },
      reconTotal,
      categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [data, valid, range.from, range.to, grain, excludeRecon]);

  const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '—');
  const t = view?.totals;

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Sales, Purchase & Expense</CardTitle>
            <CardDescription>
              {valid ? `${formatIST(`${range.from}T12:00:00+05:30`, 'dd MMM yyyy')} – ${formatIST(`${range.to}T12:00:00+05:30`, 'dd MMM yyyy')}` : 'Pick a valid date range'}
              {' · '}by {grain === 'day' ? 'day' : 'month'}
              {isFetching && !isLoading && <Loader2 className="inline h-3 w-3 ml-2 animate-spin" />}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Period</Label>
              <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
                <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {preset === 'custom' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={custom.from} max={custom.to || undefined}
                    onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="w-[160px]" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={custom.to} min={custom.from || undefined}
                    onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="w-[160px]" />
                </div>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {isLoading || !view || !t ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            {valid ? <><Loader2 className="inline h-4 w-4 mr-2 animate-spin" />Loading…</> : 'Pick a valid date range'}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="Sales" value={formatCurrency(t.sales)} sub={`${t.orders} invoice(s)`} />
              <Stat label="Purchase" value={formatCurrency(t.purchase)} sub={`${pct(t.purchase, t.sales)} of sales`} />
              <Stat label="Expense" value={formatCurrency(t.expense)} sub={`${pct(t.expense, t.sales)} of sales`} />
              <Stat label="Gross margin" value={formatCurrency(t.gross)} sub={`${pct(t.gross, t.sales)} · sales − purchase`}
                tone={t.gross < 0 ? 'red' : 'green'} />
              <Stat label="Net profit" value={formatCurrency(t.net)} sub={`${pct(t.net, t.sales)} · after expenses`}
                tone={t.net < 0 ? 'red' : 'green'} />
            </div>

            {view.reconTotal > 0.5 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">
                  Purchases in this period include {formatCurrency(view.reconTotal)} of vendor reconciliation adjustments
                  (catch-up for earlier months, booked on the reconciliation date).
                </span>
                <label className="flex items-center gap-2">
                  <Switch checked={excludeRecon} onCheckedChange={setExcludeRecon} />
                  <span>Leave them out</span>
                </label>
              </div>
            )}

            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={view.series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (Math.abs(v) >= 100000 ? `${(v / 100000).toFixed(1)}L` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} />
                  <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} />
                  <Legend />
                  <Bar dataKey="sales" name="Sales" fill="hsl(142 71% 35%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="purchase" name="Purchase" fill="hsl(217 70% 50%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expense" name="Expense" fill="hsl(32 90% 50%)" radius={[3, 3, 0, 0]} />
                  <Line dataKey="net" name="Net profit" stroke="hsl(0 0% 20%)" strokeWidth={2} dot={false} type="monotone" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{grain === 'day' ? 'Day' : 'Month'}</TableHead>
                      <TableHead className="text-right">Sales</TableHead>
                      <TableHead className="text-right">Purchase</TableHead>
                      <TableHead className="text-right">Expense</TableHead>
                      <TableHead className="text-right">Net profit</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...view.series].reverse().map((r) => (
                      <TableRow key={r.key}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.sales)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.purchase)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.expense)}</TableCell>
                        <TableCell className={`text-right ${r.net < 0 ? 'text-destructive' : ''}`}>{formatCurrency(r.net)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{pct(r.net, r.sales)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(t.sales)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(t.purchase)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(t.expense)}</TableCell>
                      <TableCell className={`text-right font-semibold ${t.net < 0 ? 'text-destructive' : ''}`}>{formatCurrency(t.net)}</TableCell>
                      <TableCell className="text-right font-semibold">{pct(t.net, t.sales)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Expense by category</p>
                {view.categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No expenses in this period.</p>
                ) : (
                  <Table>
                    <TableBody>
                      {view.categories.map(([cat, amt]) => (
                        <TableRow key={cat}>
                          <TableCell>{cat}</TableCell>
                          <TableCell className="text-right">{formatCurrency(amt)}</TableCell>
                          <TableCell className="text-right text-muted-foreground w-16">{pct(amt, t.expense)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  Sales: invoiced orders by order date. Purchase: purchase orders by PO date (as on the vendor tabs).
                  Expense: as counted in profit on the Expenses page (overheads shared over their month, capital purchases left out).
                </p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'red' | 'green' }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${tone === 'red' ? 'text-destructive' : tone === 'green' ? 'text-green-700' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
