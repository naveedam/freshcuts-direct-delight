import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Fish, CheckCircle2, AlertTriangle, Search } from 'lucide-react';
import { istDateString } from '@/lib/live-rate';
import {
  fetchSeafoodProducts, SEAFOOD_CUTOFF_HOUR, istHour, priceInForce,
  useSeafoodPublication, useSeafoodSellingPrices, useSeafoodBuyingPrices,
} from '@/lib/seafood-rate';

const db = supabase as any;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}-${MONTHS[Number(m) - 1]}-${y.slice(2)}`;
}
function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso));
}

interface SupplierLink { product_id: string; vendor_id: string; vendor_name: string }

export default function SeafoodRateAdmin() {
  const queryClient = useQueryClient();
  const today = istDateString();
  const afterCutoff = istHour() >= SEAFOOD_CUTOFF_HOUR;

  const { data: publication } = useSeafoodPublication(today);
  const { data: sellingRows } = useSeafoodSellingPrices();
  const { data: buyingRows } = useSeafoodBuyingPrices();

  const [selling, setSelling] = useState<Record<string, string>>({});
  const [buying, setBuying] = useState<Record<string, string>>({});
  const [inCatch, setInCatch] = useState<Record<string, boolean>>({});
  const [month, setMonth] = useState(today.slice(0, 7));
  const [search, setSearch] = useState('');
  // Inputs load once; background refetches (e.g. on window focus) must not wipe edits in progress.
  const [loaded, setLoaded] = useState(false);

  const { data: products } = useQuery({
    queryKey: ['seafood-rate-products'],
    queryFn: () => fetchSeafoodProducts('id, name, unit, price, is_published, awaiting_daily_price'),
  });

  const productIds = useMemo(() => (products || []).map((p) => p.id), [products]);

  const { data: suppliers } = useQuery({
    queryKey: ['seafood-rate-suppliers', productIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_products')
        .select('product_id, vendor_id, vendors(name)')
        .in('product_id', productIds);
      if (error) throw error;
      return ((data || []) as any[]).map((r): SupplierLink => ({
        product_id: r.product_id, vendor_id: r.vendor_id, vendor_name: r.vendors?.name || 'Supplier',
      }));
    },
    enabled: productIds.length > 0,
  });

  const { data: todaysCatch } = useQuery({
    queryKey: ['todays-catch-existing'],
    queryFn: async () => {
      const { data, error } = await supabase.from('todays_catch').select('*').eq('catch_date', today);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const suppliersFor = (productId: string) =>
    (suppliers || [])
      .filter((s) => s.product_id === productId)
      .sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));

  // Load the prices in force today (carried forward) into the inputs.
  useEffect(() => {
    const suppliersReady = productIds.length === 0 || suppliers !== undefined;
    if (loaded || !products || !sellingRows || !buyingRows || !suppliersReady || !todaysCatch) return;
    const s: Record<string, string> = {};
    const b: Record<string, string> = {};
    products.forEach((p) => {
      const hit = priceInForce(sellingRows, p.id, today);
      s[p.id] = hit ? String(hit.price) : '';
    });
    (suppliers || []).forEach((l) => {
      const hit = priceInForce(buyingRows, l.product_id, today, l.vendor_id);
      b[`${l.product_id}:${l.vendor_id}`] = hit ? String(hit.price) : '';
    });
    const c: Record<string, boolean> = {};
    todaysCatch.forEach((r) => { c[r.product_id] = true; });
    setSelling(s);
    setBuying(b);
    setInCatch(c);
    setLoaded(true);
  }, [loaded, products, productIds, suppliers, sellingRows, buyingRows, todaysCatch, today]);

  // What publishing would write: only prices that differ from the carried value.
  const pending = useMemo(() => {
    const sell: { product_id: string; price: number }[] = [];
    const buy: { product_id: string; vendor_id: string; price: number }[] = [];
    const errors: string[] = [];
    (products || []).forEach((p) => {
      const raw = (selling[p.id] ?? '').trim();
      const carried = priceInForce(sellingRows, p.id, today);
      if (raw === '') {
        if (carried) errors.push(`Selling price for ${p.name} can't be blank`);
        return;
      }
      const v = Number(raw);
      if (!(v > 0)) { errors.push(`Enter a selling price above 0 for ${p.name}`); return; }
      if (!carried || carried.price !== v) sell.push({ product_id: p.id, price: v });
    });
    (suppliers || []).forEach((l) => {
      const key = `${l.product_id}:${l.vendor_id}`;
      const raw = (buying[key] ?? '').trim();
      const carried = priceInForce(buyingRows, l.product_id, today, l.vendor_id);
      const name = (products || []).find((p) => p.id === l.product_id)?.name || 'fish';
      if (raw === '') {
        if (carried) errors.push(`Buying price from ${l.vendor_name} for ${name} can't be blank`);
        return;
      }
      const v = Number(raw);
      if (!(v > 0)) { errors.push(`Enter a buying price above 0 from ${l.vendor_name} for ${name}`); return; }
      if (!carried || carried.price !== v) buy.push({ product_id: l.product_id, vendor_id: l.vendor_id, price: v });
    });
    return { sell, buy, errors };
  }, [products, suppliers, selling, buying, sellingRows, buyingRows, today]);

  const changedCount = pending.sell.length + pending.buy.length;

  const publish = useMutation({
    mutationFn: async () => {
      if (pending.errors.length) throw new Error(pending.errors[0]);
      const { data: { user } } = await supabase.auth.getUser();
      const by = user?.id ?? null;

      if (pending.sell.length) {
        const { error } = await db.from('seafood_selling_prices').upsert(
          pending.sell.map((r) => ({ ...r, effective_date: today, created_by: by })),
          { onConflict: 'product_id,effective_date' },
        );
        if (error) throw error;
        // The catalog price is what the storefront and new orders read.
        for (const r of pending.sell) {
          const { error: pErr } = await supabase.from('products').update({ price: r.price, awaiting_daily_price: false } as any).eq('id', r.product_id);
          if (pErr) throw pErr;
        }
      }

      if (pending.buy.length) {
        const { error } = await db.from('seafood_buying_prices').upsert(
          pending.buy.map((r) => ({ ...r, effective_date: today, created_by: by })),
          { onConflict: 'product_id,vendor_id,effective_date' },
        );
        if (error) throw error;
        // Keep the supplier's standing cost current too: Edit Order, manual POs and the
        // dashboard margins read it.
        for (const r of pending.buy) {
          const { error: vErr } = await supabase
            .from('vendor_products')
            .update({ cost_price: r.price })
            .eq('vendor_id', r.vendor_id)
            .eq('product_id', r.product_id);
          if (vErr) throw vErr;
        }
      }

      // Today's Catch: add newly ticked fish, remove unticked ones; keep notes and vendors on the rest.
      const existing = new Set((todaysCatch || []).map((r) => r.product_id));
      const toAdd = (products || []).filter((p) => inCatch[p.id] && !existing.has(p.id));
      const toRemove = (todaysCatch || []).filter((r) => !inCatch[r.product_id]).map((r) => r.product_id);
      if (toRemove.length) {
        const { error } = await supabase.from('todays_catch').delete().eq('catch_date', today).in('product_id', toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const start = (todaysCatch || []).length;
        const { error } = await supabase.from('todays_catch').insert(
          toAdd.map((p, i) => ({ catch_date: today, product_id: p.id, display_order: start + i })),
        );
        if (error) throw error;
      }

      const { error: pubErr } = await db.from('seafood_price_publications').upsert(
        { publish_date: today, published_at: new Date().toISOString(), published_by: by, changed_count: changedCount },
        { onConflict: 'publish_date' },
      );
      if (pubErr) throw pubErr;
    },
    onSuccess: async () => {
      // Wait for fresh data before reloading the inputs, so they don't reload stale prices.
      await Promise.all([
        'seafood-publication', 'seafood-selling-prices', 'seafood-buying-prices', 'seafood-rate-products',
        'products', 'todays-catch-existing', 'todays-catch-home', 'vendor-products-all',
      ].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
      setLoaded(false);
      toast.success(changedCount ? `Published: ${changedCount} price${changedCount === 1 ? '' : 's'} changed` : "Published: no changes, yesterday's prices continue");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Month history: every price change entered in the month.
  const history = useMemo(() => {
    const inMonth = (d: string) => d.startsWith(month);
    const byDate = new Map<string, Map<string, { selling?: number; buying: { vendor: string; price: number }[] }>>();
    const entry = (date: string, pid: string) => {
      if (!byDate.has(date)) byDate.set(date, new Map());
      const m = byDate.get(date)!;
      if (!m.has(pid)) m.set(pid, { buying: [] });
      return m.get(pid)!;
    };
    (sellingRows || []).filter((r) => inMonth(r.effective_date)).forEach((r) => {
      entry(r.effective_date, r.product_id).selling = Number(r.price);
    });
    (buyingRows || []).filter((r) => inMonth(r.effective_date)).forEach((r) => {
      const vendor = (suppliers || []).find((s) => s.vendor_id === r.vendor_id)?.vendor_name || 'Supplier';
      entry(r.effective_date, r.product_id).buying.push({ vendor, price: Number(r.price) });
    });
    const nameOf = (pid: string) => (products || []).find((p) => p.id === pid)?.name || 'Removed product';
    return Array.from(byDate.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .flatMap(([date, m]) =>
        Array.from(m.entries())
          .map(([pid, v]) => ({ date, name: nameOf(pid), ...v }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
  }, [sellingRows, buyingRows, suppliers, products, month]);

  const loading = !loaded;
  // Search only filters what's shown; hidden rows keep their edits and still publish.
  const visibleProducts = (products || []).filter((p) =>
    !search.trim() || String(p.name).toLowerCase().includes(search.trim().toLowerCase()));

  const sinceLabel = (hit: { effective_date: string } | null) =>
    !hit ? 'no price yet' : hit.effective_date === today ? 'set today' : `since ${fmtDate(hit.effective_date)}`;

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Fish className="h-6 w-6" /> Seafood Rate
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Enter today's prices each morning. Unchanged prices carry forward from the last day they were set,
              so only change what moved, then Publish. Prices show on the website from publishing until 6 PM.
            </p>
          </div>
          <Button onClick={() => publish.mutate()} disabled={publish.isPending || loading}>
            {publish.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {changedCount ? `Publish today's prices (${changedCount} changed)` : 'Publish: no change today'}
          </Button>
        </div>

        {publication ? (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            Published today at {fmtTime(publication.published_at)}.
            {afterCutoff ? ' It is past 6 PM, so the website now shows the next-morning message.' : ' Seafood prices are live on the website until 6 PM.'}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Today's prices aren't published yet, so the website hides seafood prices. Customers can still order.
          </div>
        )}
        {pending.errors.length > 0 && (
          <p className="text-sm text-destructive">{pending.errors[0]}</p>
        )}

        <Card>
          <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Today's prices · {fmtDate(today)}</CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-8 w-56 pl-8" placeholder="Search fish" value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fish</TableHead>
                    <TableHead>Selling price</TableHead>
                    <TableHead>Buying price by supplier</TableHead>
                    <TableHead className="text-center">Today's Catch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleProducts.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-sm text-muted-foreground">No fish match "{search}".</TableCell></TableRow>
                  )}
                  {visibleProducts.map((p) => {
                    const carried = priceInForce(sellingRows, p.id, today);
                    const sellChanged = pending.sell.some((r) => r.product_id === p.id);
                    const links = suppliersFor(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium align-top">
                          {p.name}
                          {!p.is_published && <Badge variant="outline" className="ml-2 text-xs">Unpublished</Badge>}
                          {p.awaiting_daily_price && <Badge variant="outline" className="ml-2 text-xs text-amber-700">Hidden until priced</Badge>}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex items-center gap-1">
                            <span className="text-sm">₹</span>
                            <Input
                              type="number" min="0" step="1" inputMode="decimal"
                              className={`h-8 w-24 ${sellChanged ? 'border-primary ring-1 ring-primary' : ''}`}
                              value={selling[p.id] ?? ''}
                              onChange={(e) => setSelling((s) => ({ ...s, [p.id]: e.target.value }))}
                            />
                            <span className="text-xs text-muted-foreground">/{p.unit}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{sinceLabel(carried)}</p>
                        </TableCell>
                        <TableCell className="align-top">
                          {links.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No supplier linked (add one under Vendors)</span>
                          ) : (
                            <div className="space-y-2">
                              {links.map((l) => {
                                const key = `${l.product_id}:${l.vendor_id}`;
                                const hit = priceInForce(buyingRows, l.product_id, today, l.vendor_id);
                                const changed = pending.buy.some((r) => r.product_id === l.product_id && r.vendor_id === l.vendor_id);
                                return (
                                  <div key={key} className="flex items-center gap-2">
                                    <Label className="w-32 truncate text-xs">{l.vendor_name}</Label>
                                    <span className="text-sm">₹</span>
                                    <Input
                                      type="number" min="0" step="1" inputMode="decimal"
                                      className={`h-8 w-24 ${changed ? 'border-primary ring-1 ring-primary' : ''}`}
                                      value={buying[key] ?? ''}
                                      onChange={(e) => setBuying((b) => ({ ...b, [key]: e.target.value }))}
                                    />
                                    <span className="text-xs text-muted-foreground">{sinceLabel(hit)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center align-top">
                          <Checkbox
                            checked={!!inCatch[p.id]}
                            onCheckedChange={(v) => setInCatch((c) => ({ ...c, [p.id]: !!v }))}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Highlighted boxes will be saved as today's price. Notes and vendor for Today's Catch are still edited on the Today's Catch page.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Price changes</CardTitle>
            <Input type="month" className="h-8 w-40" value={month} onChange={(e) => setMonth(e.target.value)} />
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No price changes this month.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Fish</TableHead>
                    <TableHead>Selling</TableHead>
                    <TableHead>Buying</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h, i) => (
                    <TableRow key={`${h.date}-${h.name}-${i}`}>
                      <TableCell>{fmtDate(h.date)}</TableCell>
                      <TableCell>{h.name}</TableCell>
                      <TableCell>{h.selling != null ? `₹${h.selling}` : '-'}</TableCell>
                      <TableCell className="text-xs">
                        {h.buying.length ? h.buying.map((b) => `${b.vendor} ₹${b.price}`).join(', ') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
