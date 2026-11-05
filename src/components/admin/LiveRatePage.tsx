import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, TrendingUp, Plus } from 'lucide-react';
import { istDateString, priceFromRate } from '@/lib/live-rate';
import {
  type CommodityConfig, multRowOn, rateOn, syncSellingPrices,
  useCommodityCuts, useCommodityMultipliers, useCommodityRates, useCommodityVendor,
} from '@/lib/daily-rate';

const db = supabase as any;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}-${MONTHS[Number(m) - 1]}-${y.slice(2)}`;
}

type EditValues = Record<string, { buy: string; sell: string }>;

export function LiveRatePage({ cfg }: { cfg: CommodityConfig }) {
  const queryClient = useQueryClient();
  const today = istDateString();
  const { data: ratesData } = useCommodityRates(cfg);
  const { data: cutsData } = useCommodityCuts(cfg);
  const { data: multData } = useCommodityMultipliers(cfg);
  const { data: vendorId } = useCommodityVendor(cfg);
  const rates = ratesData || [];
  const cuts = cutsData || [];
  const multipliers = multData || [];

  const [rateDate, setRateDate] = useState(today);
  const [rate, setRate] = useState('');
  const [source, setSource] = useState(cfg.defaultSource);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [viewDate, setViewDate] = useState<string | null>(null); // set being viewed
  const [editing, setEditing] = useState<string | null>(null); // a set's date, or 'NEW'
  const [newSetDate, setNewSetDate] = useState(today);
  const [editValues, setEditValues] = useState<EditValues>({});
  const [newCutName, setNewCutName] = useState('');

  const invalidateAll = () => {
    [
      'daily-rates', 'daily-rate-cuts', 'daily-rate-mults', 'daily-rate-vendor', 'products', 'vendor-products-all',
      // Chicken's original hooks (order pricing) use these keys.
      'chicken-cuts', 'chicken-multipliers', 'live-chicken-rate',
    ].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  };

  const afterPriceChange = async (label: string) => {
    let changed = 0;
    try { changed = await syncSellingPrices(cfg); } catch (e: any) {
      toast.error('Saved, but website prices could not be updated: ' + e.message);
    }
    invalidateAll();
    toast.success(changed ? `${label} · ${changed} website price${changed === 1 ? '' : 's'} updated` : label);
  };

  const { data: products } = useQuery({
    queryKey: ['daily-rate-products', cfg.key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products').select('id, name, price, awaiting_daily_price' as any).or(cfg.productOr).order('name');
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: vendors } = useQuery({
    queryKey: ['daily-rate-vendors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('id, name').eq('status', 'active').order('name');
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !cfg.fixedVendorId,
  });
  const vendorName = cfg.fixedVendorId ? 'M N Broilers' : (vendors || []).find((v) => v.id === vendorId)?.name;

  // Load the chosen day's saved rate into the entry fields.
  useEffect(() => {
    const row = rates.find((r) => r.rate_date === rateDate);
    setRate(row ? String(row.rate) : '');
    setSource(row?.source || cfg.defaultSource);
  }, [rateDate, ratesData, cfg.defaultSource]);

  const todayRate = rates.find((r) => r.rate_date === today) || null;
  const latestRate = rateOn(rates, today);

  // Multiplier sets, oldest first.
  const setDates = useMemo(
    () => Array.from(new Set(multipliers.map((r) => r.effective_date))).sort(),
    [multipliers],
  );
  const inForceDate = useMemo(() => [...setDates].reverse().find((d) => d <= today) || setDates[setDates.length - 1] || null, [setDates, today]);
  const shownDate = editing && editing !== 'NEW' ? editing : (viewDate || inForceDate);
  const rowFor = (cutId: string, date: string | null) =>
    date ? multipliers.find((r) => r.cut_id === cutId && r.effective_date === date) || null : null;

  const startEdit = (date: string | null, isNew: boolean) => {
    const values: EditValues = {};
    cuts.forEach((c) => {
      const r = rowFor(c.id, date);
      values[c.id] = { buy: r?.multiplier == null ? '' : String(r.multiplier), sell: r?.selling_multiplier == null ? '' : String(r.selling_multiplier) };
    });
    setEditValues(values);
    if (isNew) { setNewSetDate(today); setEditing('NEW'); } else setEditing(date);
  };

  const saveRate = useMutation({
    mutationFn: async () => {
      const value = parseFloat(rate);
      if (!rateDate) throw new Error('Pick a date');
      if (!(value > 0)) throw new Error('Enter a rate greater than 0');
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await db.from(cfg.ratesTable).upsert(
        { rate_date: rateDate, rate: value, source: source || null, created_by: user?.id ?? null },
        { onConflict: 'rate_date' },
      );
      if (error) throw error;
    },
    onSuccess: () => afterPriceChange('Live rate saved'),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSet = useMutation({
    mutationFn: async () => {
      const date = editing === 'NEW' ? newSetDate : editing;
      if (!date) throw new Error('Pick the date this set takes effect');
      if (editing === 'NEW' && setDates.includes(date)) throw new Error('A set already exists for that date. Edit it instead.');
      const rows: any[] = [];
      const clearIds: string[] = [];
      cuts.forEach((c) => {
        const v = editValues[c.id] || { buy: '', sell: '' };
        const buy = v.buy.trim() === '' ? null : Number(v.buy);
        const sell = v.sell.trim() === '' ? null : Number(v.sell);
        if (buy == null && sell == null) { clearIds.push(c.id); return; }
        if (buy != null && !(buy > 0)) throw new Error(`Enter a buying multiplier above 0 for ${c.name}`);
        if (sell != null && !(sell > 0)) throw new Error(`Enter a selling multiplier above 0 for ${c.name}`);
        if (cfg.buyingRequired && buy == null) throw new Error(`${c.name} needs a buying multiplier too`);
        rows.push({
          ...(cfg.vendorScoped ? { vendor_id: cfg.fixedVendorId } : {}),
          cut_id: c.id, effective_date: date, multiplier: buy, selling_multiplier: sell,
        });
      });
      if (rows.length === 0) throw new Error('Enter at least one multiplier');
      const { error } = await db.from(cfg.multTable).upsert(rows, {
        onConflict: cfg.vendorScoped ? 'vendor_id,cut_id,effective_date' : 'cut_id,effective_date',
      });
      if (error) throw error;
      if (clearIds.length) {
        let q = db.from(cfg.multTable).delete().eq('effective_date', date).in('cut_id', clearIds);
        if (cfg.vendorScoped) q = q.eq('vendor_id', cfg.fixedVendorId);
        const { error: delError } = await q;
        if (delError) throw delError;
      }
      return date;
    },
    onSuccess: async (date) => {
      setEditing(null);
      setViewDate(date);
      await afterPriceChange('Multipliers saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveVendor = useMutation({
    mutationFn: async (v: string) => {
      const { error } = await db.from('daily_rate_settings').upsert(
        { commodity: cfg.key, vendor_id: v, updated_at: new Date().toISOString() }, { onConflict: 'commodity' },
      );
      if (error) throw error;
    },
    onSuccess: () => { invalidateAll(); toast.success('Supplier saved'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addCut = useMutation({
    mutationFn: async () => {
      const name = newCutName.trim();
      if (!name) throw new Error('Enter a cut name');
      const sort = cuts.reduce((m, c) => Math.max(m, c.sort_order || 0), 0) + 1;
      const { error } = await db.from(cfg.cutsTable).insert({ name, sort_order: sort });
      if (error) throw error;
    },
    onSuccess: () => { setNewCutName(''); invalidateAll(); toast.success('Cut added'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkProduct = useMutation({
    mutationFn: async ({ cutId, productId }: { cutId: string; productId: string | null }) => {
      const { error } = await db.from(cfg.cutsTable).update({ product_id: productId }).eq('id', cutId);
      if (error) throw new Error(error.code === '23505' ? 'That product is already linked to another cut.' : error.message);
      // The order form's vendor dropdown only offers mapped vendors, so map the rate supplier.
      if (productId && vendorId) {
        const { data: rows, error: vpError } = await supabase
          .from('vendor_products').select('id, vendor_id, is_preferred_vendor').eq('product_id', productId);
        if (vpError) throw vpError;
        if (!rows?.some((r: any) => r.vendor_id === vendorId)) {
          const { error: insError } = await supabase.from('vendor_products').insert({
            vendor_id: vendorId, product_id: productId, cost_price: 0,
            is_preferred_vendor: !rows?.some((r: any) => r.is_preferred_vendor),
          });
          if (insError) throw insError;
        }
      }
    },
    onSuccess: () => afterPriceChange('Link saved'),
    onError: (e: Error) => toast.error(e.message),
  });

  const monthRates = rates.filter((r) => r.rate_date.startsWith(month)).sort((a, b) => b.rate_date.localeCompare(a.rate_date));
  const isEditing = editing !== null;
  const rateForPrices = latestRate ? Number(latestRate.rate) : null;

  const multInput = (cutId: string, field: 'buy' | 'sell') => (
    <Input
      type="number" step="0.01" min="0" className="h-8 w-20 text-center"
      value={editValues[cutId]?.[field] ?? ''}
      onChange={(e) => setEditValues((prev) => ({
        ...prev, [cutId]: { ...(prev[cutId] || { buy: '', sell: '' }), [field]: e.target.value },
      }))}
    />
  );

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" /> {cfg.label} Rate
          </h1>
          <p className="text-sm text-muted-foreground">
            {todayRate
              ? `Today (${fmtDate(today)}): ₹${todayRate.rate}/kg`
              : latestRate
                ? `Today's rate isn't set; website prices use ${fmtDate(latestRate.rate_date)}'s ₹${latestRate.rate}/kg`
                : "No rate saved yet"}
            {' · '}Buying price = live rate × buying multiplier{vendorName ? ` (${vendorName})` : ''}. Website price = latest live rate × selling multiplier, rounded to the rupee.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Daily rate</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" className="h-9 w-40" value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Live rate (₹/kg)</Label>
                <Input type="number" step="0.01" min="0" className="h-9 w-32" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Source</Label>
                <Input className="h-9 w-48" value={source} onChange={(e) => setSource(e.target.value)} />
              </div>
              <Button onClick={() => saveRate.mutate()} disabled={saveRate.isPending}>
                {saveRate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save rate
              </Button>
              {!cfg.fixedVendorId && (
                <div className="space-y-1 ml-auto">
                  <Label className="text-xs">Supplier on the live rate</Label>
                  <Select value={vendorId || ''} onValueChange={(v) => saveVendor.mutate(v)}>
                    <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                    <SelectContent>
                      {(vendors || []).map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex flex-row flex-wrap items-center gap-2 space-y-0">
            <CardTitle className="text-base mr-auto">Cuts &amp; multipliers</CardTitle>
            {editing === 'NEW' ? (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Takes effect</Label>
                <Input type="date" className="h-8 w-40" value={newSetDate} onChange={(e) => setNewSetDate(e.target.value)} />
              </div>
            ) : setDates.length > 0 && (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Set from</Label>
                <Select value={shownDate || ''} onValueChange={(v) => setViewDate(v)} disabled={isEditing}>
                  <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[...setDates].reverse().map((d) => (
                      <SelectItem key={d} value={d}>{fmtDate(d)}{d === inForceDate ? ' (in force)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isEditing ? (
              <div className="flex gap-1">
                <Button size="sm" onClick={() => saveSet.mutate()} disabled={saveSet.isPending}>
                  {saveSet.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex gap-1">
                {shownDate && <Button size="sm" variant="outline" onClick={() => startEdit(shownDate, false)}>Edit set</Button>}
                <Button size="sm" variant="outline" onClick={() => startEdit(inForceDate, true)} disabled={cuts.length === 0}>New set</Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {cuts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cuts yet{cfg.canAddCuts ? '. Add one below.' : '.'}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cut</TableHead>
                    <TableHead>Website product</TableHead>
                    <TableHead className="text-center">Buy ×</TableHead>
                    <TableHead className="text-center">Sell ×</TableHead>
                    <TableHead className="text-right">Buy ₹/kg</TableHead>
                    <TableHead className="text-right">Sell ₹/kg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuts.map((c) => {
                    const r = rowFor(c.id, shownDate);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Select
                            value={c.product_id || 'none'}
                            onValueChange={(v) => linkProduct.mutate({ cutId: c.id, productId: v === 'none' ? null : v })}
                          >
                            <SelectTrigger className={`h-8 w-56 ${c.product_id ? '' : 'text-amber-600'}`}><SelectValue placeholder="Not linked" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Not linked</SelectItem>
                              {(products || []).map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name} ({p.awaiting_daily_price ? 'hidden: no price yet' : `₹${p.price}`})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? multInput(c.id, 'buy') : (r?.multiplier != null ? Number(r.multiplier).toFixed(2) : '-')}
                        </TableCell>
                        <TableCell className="text-center">
                          {isEditing ? multInput(c.id, 'sell') : (r?.selling_multiplier != null ? Number(r.selling_multiplier).toFixed(2) : '-')}
                        </TableCell>
                        <TableCell className="text-right">
                          {rateForPrices != null && r?.multiplier != null ? `₹${priceFromRate(rateForPrices, Number(r.multiplier))}` : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {rateForPrices != null && r?.selling_multiplier != null ? `₹${priceFromRate(rateForPrices, Number(r.selling_multiplier))}` : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {cfg.canAddCuts && (
              <div className="flex items-center gap-2 mt-3">
                <Input className="h-8 w-56" placeholder="New cut, e.g. Curry Cut" value={newCutName} onChange={(e) => setNewCutName(e.target.value)} />
                <Button size="sm" variant="outline" onClick={() => addCut.mutate()} disabled={addCut.isPending}>
                  <Plus className="h-3 w-3 mr-1" />Add cut
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              ₹ columns use {latestRate ? `${fmtDate(latestRate.rate_date)}'s rate` : 'the latest rate'}. An order uses the set in force on its day, so older days keep their prices.
              A blank Sell × leaves that product's website price as set on Products.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Monthly list</CardTitle>
            <Input type="month" className="h-8 w-40" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </CardHeader>
          <CardContent>
            {monthRates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No rates saved for this month.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Live rate</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthRates.map((r) => (
                    <TableRow key={r.rate_date}>
                      <TableCell className="font-medium">{fmtDate(r.rate_date)}</TableCell>
                      <TableCell>₹{r.rate}</TableCell>
                      <TableCell className="text-muted-foreground">{r.source || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => { setRateDate(r.rate_date); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="text-xs text-muted-foreground mt-3">Per-cut prices for each day are on the Price History page.</p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
