import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { History, Download, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { istDateString, priceFromRate } from '@/lib/live-rate';
import { fetchAllRows } from '@/lib/supabase-paginate';
import { COMMODITIES, type CommodityConfig, type MultRow, type RateRow, multRowOn, rateOn } from '@/lib/daily-rate';
import { fetchSeafoodPrices, fetchSeafoodProducts, priceInForce } from '@/lib/seafood-rate';
import { writeExcelFile } from '@/lib/excel-utils';

const db = supabase as any;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (d: string) => { const [y, m, day] = d.split('-'); return `${day}-${MONTHS[Number(m) - 1]}-${y.slice(2)}`; };
const MAX_DAYS = 92;
const SHOW_ROWS = 500;

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Kind = 'Chicken' | 'Mutton' | 'Seafood';
interface HistoryRow { date: string; kind: Kind; item: string; selling: number | null; buying: string; note: string }

async function loadCommodity(cfg: CommodityConfig) {
  const [rates, cutsRes, mults] = await Promise.all([
    fetchAllRows<RateRow>(() => db.from(cfg.ratesTable).select('rate_date, rate, source').order('rate_date')),
    db.from(cfg.cutsTable).select('id, name, product_id, sort_order').order('sort_order'),
    fetchAllRows<MultRow>(() => {
      let q = db.from(cfg.multTable).select('*').order('effective_date');
      if (cfg.vendorScoped && cfg.fixedVendorId) q = q.eq('vendor_id', cfg.fixedVendorId);
      return q;
    }),
  ]);
  if (cutsRes.error) throw cutsRes.error;
  return { rates, cuts: (cutsRes.data || []) as any[], mults };
}

export default function PriceHistoryAdmin() {
  const today = istDateString();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['price-history-source'],
    queryFn: async () => {
      const [chicken, mutton, seafoodProducts, selling, buying, productsRes, vendorsRes] = await Promise.all([
        loadCommodity(COMMODITIES.chicken),
        loadCommodity(COMMODITIES.mutton).catch(() => ({ rates: [], cuts: [], mults: [] })), // before the mutton migration
        fetchSeafoodProducts('id, name'),
        fetchSeafoodPrices('seafood_selling_prices'),
        fetchSeafoodPrices('seafood_buying_prices'),
        supabase.from('products').select('id, name'),
        supabase.from('vendors').select('id, name'),
      ]);
      return {
        chicken, mutton, seafoodProducts, selling, buying,
        productNames: new Map(((productsRes.data || []) as any[]).map((p) => [p.id, p.name])),
        vendorNames: new Map(((vendorsRes.data || []) as any[]).map((v) => [v.id, v.name])),
      };
    },
    staleTime: 60 * 1000,
  });

  const rangeError = from > to ? 'The start date is after the end date'
    : addDays(from, MAX_DAYS - 1) < to ? `Pick a range of ${MAX_DAYS} days or less` : null;

  const rows = useMemo<HistoryRow[]>(() => {
    if (!data || rangeError) return [];
    const out: HistoryRow[] = [];
    const days: string[] = [];
    for (let d = to; d >= from; d = addDays(d, -1)) days.push(d);

    const liveRows = (k: Kind, c: { rates: RateRow[]; cuts: any[]; mults: MultRow[] }) => {
      for (const d of days) {
        const r = rateOn(c.rates, d);
        if (!r) continue;
        for (const cut of c.cuts) {
          const m = multRowOn(c.mults, cut.id, d);
          if (!m) continue;
          const sell = m.selling_multiplier != null ? priceFromRate(Number(r.rate), Number(m.selling_multiplier)) : null;
          const buy = m.multiplier != null ? priceFromRate(Number(r.rate), Number(m.multiplier)) : null;
          if (sell == null && buy == null) continue;
          out.push({
            date: d, kind: k,
            item: (cut.product_id && data.productNames.get(cut.product_id)) || cut.name,
            selling: sell,
            buying: buy != null ? `₹${buy}` : '',
            note: `Rate ₹${r.rate}${r.rate_date !== d ? ` (from ${fmtDate(r.rate_date)})` : ''}`,
          });
        }
      }
    };
    if (kind === 'all' || kind === 'Chicken') liveRows('Chicken', data.chicken);
    if (kind === 'all' || kind === 'Mutton') liveRows('Mutton', data.mutton);

    if (kind === 'all' || kind === 'Seafood') {
      const pairs = new Map<string, Set<string>>();
      data.buying.forEach((b) => {
        if (!pairs.has(b.product_id)) pairs.set(b.product_id, new Set());
        pairs.get(b.product_id)!.add(b.vendor_id!);
      });
      for (const d of days) {
        for (const p of data.seafoodProducts) {
          const sell = priceInForce(data.selling, p.id, d);
          const buys = Array.from(pairs.get(p.id) || [])
            .map((v) => ({ v, hit: priceInForce(data.buying, p.id, d, v) }))
            .filter((x) => x.hit);
          if (!sell && buys.length === 0) continue;
          out.push({
            date: d, kind: 'Seafood', item: p.name,
            selling: sell ? sell.price : null,
            buying: buys.map((x) => `${data.vendorNames.get(x.v) || 'Supplier'} ₹${x.hit!.price}`).join(', '),
            note: sell && sell.effective_date !== d ? `Price from ${fmtDate(sell.effective_date)}` : sell ? 'Set this day' : '',
          });
        }
      }
    }

    const q = search.trim().toLowerCase();
    return out
      .filter((r) => !q || r.item.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind) || a.item.localeCompare(b.item));
  }, [data, from, to, kind, search, rangeError]);

  const exportExcel = async () => {
    try {
      await writeExcelFile(`price-history-${from}-to-${to}.xlsx`, [{
        name: 'Price history',
        data: rows.map((r) => ({
          Date: r.date, Type: r.kind, Item: r.item,
          'Selling price (₹)': r.selling ?? '', 'Buying price': r.buying, Note: r.note,
        })),
      }]);
    } catch (e: any) {
      toast.error('Export failed: ' + e.message);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><History className="h-6 w-6" /> Price History</h1>
          <p className="text-sm text-muted-foreground">
            The price in force each day for chicken, mutton and seafood, worked out from the saved daily rates, multipliers and seafood prices.
          </p>
        </div>

        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" className="h-9 w-40" value={from} max={today} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" className="h-9 w-40" value={to} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={kind} onValueChange={(v: any) => setKind(v)}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="Chicken">Chicken</SelectItem>
                    <SelectItem value="Mutton">Mutton</SelectItem>
                    <SelectItem value="Seafood">Seafood</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="h-9 w-56 pl-8" placeholder="Search item" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button variant="outline" className="ml-auto" onClick={exportExcel} disabled={rows.length === 0}>
                <Download className="h-4 w-4 mr-2" />Export to Excel
              </Button>
            </div>

            {rangeError ? (
              <p className="text-sm text-destructive">{rangeError}</p>
            ) : isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : error ? (
              <p className="text-sm text-destructive">Couldn't load prices: {(error as Error).message}</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No prices in this range.</p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Selling</TableHead>
                      <TableHead>Buying</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, SHOW_ROWS).map((r, i) => (
                      <TableRow key={`${r.date}-${r.kind}-${r.item}-${i}`}>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                        <TableCell>{r.kind}</TableCell>
                        <TableCell className="font-medium">{r.item}</TableCell>
                        <TableCell className="text-right">{r.selling != null ? `₹${r.selling}` : '-'}</TableCell>
                        <TableCell className="text-xs">{r.buying || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {rows.length > SHOW_ROWS && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Showing the first {SHOW_ROWS} of {rows.length} rows. Narrow the range or export to Excel for all of them.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
