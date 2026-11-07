import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { usePriceSaver } from './PriceDialogs';
import {
  istDateString, MN_BROILERS_ID, multiplierOn, priceFromRate,
  useTodayLiveRate, useChickenCuts, useChickenMultipliers,
} from '@/lib/live-rate';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}-${MONTHS[Number(m) - 1]}-${y.slice(2)}`;
}

// The Chicken Rate screen as it was before 5 November (M N Broilers: live rate × multiplier),
// with a selling multiplier per cut. Every saved rate, set or link also records that day's
// purchase and selling prices in Rate Management, for history, checks and order pricing.
export function ChickenLiveRatePanel() {
  const queryClient = useQueryClient();
  const today = istDateString();
  const { data: todayRate } = useTodayLiveRate();
  const { data: cutsData } = useChickenCuts();
  const { data: multData } = useChickenMultipliers();
  const cuts = cutsData || [];
  const multipliers = multData || [];

  const [rateDate, setRateDate] = useState(today);
  const [rate, setRate] = useState('');
  const [source, setSource] = useState('KTPA Facebook');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editingDate, setEditingDate] = useState<string | null>(null); // a set's date, or 'NEW'
  const [newSetDate, setNewSetDate] = useState('');
  const [editValues, setEditValues] = useState<Record<string, string>>({}); // `${cutId}:buy` | `${cutId}:sell`
  const { save: savePrices, dialog: overrideDialog } = usePriceSaver();

  const invalidateAll = () => {
    [
      'chicken-cuts', 'chicken-multipliers', 'live-chicken-rate', 'live-chicken-rate-row',
      'live-chicken-rates-month', 'vendor-products-all', 'product-prices', 'current-product-prices', 'products',
    ].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  };

  // Writes the purchase and selling price of every linked cut for each saved rate day from
  // `from` onwards (one day when `only` is given), using the multiplier set in force that day.
  const recordPrices = async ({ from, only }: { from?: string; only?: string }) => {
    let q = supabase.from('live_chicken_rates').select('rate_date, rate').order('rate_date');
    if (only) q = q.eq('rate_date', only);
    else if (from) q = q.gte('rate_date', from);
    const [{ data: rates, error: rErr }, { data: freshCuts, error: cErr }, { data: freshMults, error: mErr }] = await Promise.all([
      q,
      supabase.from('chicken_cuts').select('id, name, product_id'),
      supabase.from('chicken_cut_multipliers').select('*').eq('vendor_id', MN_BROILERS_ID),
    ]);
    if (rErr || cErr || mErr) throw new Error((rErr || cErr || mErr)!.message);
    const rows: any[] = [];
    for (const r of (rates || []) as any[]) {
      for (const c of (freshCuts || []) as any[]) {
        if (!c.product_id) continue;
        const set = ((freshMults || []) as any[])
          .filter((m) => m.cut_id === c.id && m.effective_date <= r.rate_date)
          .sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0];
        if (!set) continue;
        rows.push({
          product_id: c.product_id, vendor_id: MN_BROILERS_ID, effective_date: r.rate_date,
          purchase_price: priceFromRate(Number(r.rate), Number(set.multiplier)),
          selling_price: set.selling_multiplier != null ? priceFromRate(Number(r.rate), Number(set.selling_multiplier)) : null,
          source: 'chicken_rate', label: `${c.name}, ${fmtDate(r.rate_date)}`,
        });
      }
    }
    if (rows.length === 0) return;
    const res = await savePrices(rows);
    if (res.skipped) toast.warning(`${res.skipped} cut price${res.skipped === 1 ? '' : 's'} not recorded; fix the rate or multiplier and save again.`);
  };

  const monthStart = `${month}-01`;
  const monthEnd = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${month}-${String(last).padStart(2, '0')}`;
  }, [month]);

  const { data: monthRates } = useQuery({
    queryKey: ['live-chicken-rates-month', month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_chicken_rates')
        .select('rate_date, rate, source')
        .gte('rate_date', monthStart)
        .lte('rate_date', monthEnd)
        .order('rate_date');
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: dayRow } = useQuery({
    queryKey: ['live-chicken-rate-row', rateDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_chicken_rates')
        .select('rate, source')
        .eq('rate_date', rateDate)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!rateDate,
  });

  useEffect(() => {
    setRate(dayRow ? String(dayRow.rate) : '');
    setSource(dayRow?.source || 'KTPA Facebook');
  }, [dayRow, rateDate]);

  // Multiplier sets, oldest first: [effective date, { `${cutId}:buy` | `${cutId}:sell`: multiplier }]
  const sets = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    multipliers.forEach((r: any) => {
      if (!map.has(r.effective_date)) map.set(r.effective_date, {});
      map.get(r.effective_date)![`${r.cut_id}:buy`] = Number(r.multiplier);
      if (r.selling_multiplier != null) map.get(r.effective_date)![`${r.cut_id}:sell`] = Number(r.selling_multiplier);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [multipliers]);

  const startEdit = (date: string) => {
    const found = sets.find(([d]) => d === date);
    const values: Record<string, string> = {};
    cuts.forEach((c) => {
      for (const k of [`${c.id}:buy`, `${c.id}:sell`]) {
        const v = found?.[1][k];
        values[k] = v == null ? '' : String(v);
      }
    });
    setEditValues(values);
    setEditingDate(date);
  };

  const startNew = () => {
    const latest = sets.length ? sets[sets.length - 1][1] : {};
    const values: Record<string, string> = {};
    cuts.forEach((c) => {
      for (const k of [`${c.id}:buy`, `${c.id}:sell`]) {
        values[k] = latest[k] == null ? '' : String(latest[k]);
      }
    });
    setEditValues(values);
    setNewSetDate('');
    setEditingDate('NEW');
  };

  const saveRate = useMutation({
    mutationFn: async () => {
      const value = parseFloat(rate);
      if (!rateDate) throw new Error('Pick a date');
      if (!(value > 0)) throw new Error('Enter a rate greater than 0');
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('live_chicken_rates').upsert(
        { rate_date: rateDate, rate: value, source: source || null, created_by: user?.id ?? null },
        { onConflict: 'rate_date' },
      );
      if (error) throw error;
      await recordPrices({ only: rateDate });
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Live rate saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSet = useMutation({
    mutationFn: async () => {
      const date = editingDate === 'NEW' ? newSetDate : editingDate;
      if (!date) throw new Error('Pick the date this set takes effect');
      if (editingDate === 'NEW' && sets.some(([d]) => d === date)) {
        throw new Error('A set already exists for that date. Use Edit on it instead.');
      }
      const rows: any[] = [];
      const clearIds: string[] = [];
      cuts.forEach((c) => {
        const raw = (editValues[`${c.id}:buy`] ?? '').trim();
        const rawSell = (editValues[`${c.id}:sell`] ?? '').trim();
        if (raw === '') {
          if (rawSell !== '') throw new Error(`${c.name} needs a buying multiplier as well`);
          clearIds.push(c.id);
        } else {
          const v = Number(raw);
          if (!(v > 0)) throw new Error(`Enter a buying multiplier above 0 for ${c.name}`);
          const sell = rawSell === '' ? null : Number(rawSell);
          if (sell != null && !(sell > 0)) throw new Error(`Enter a selling multiplier above 0 for ${c.name}`);
          if (sell != null && sell < v) throw new Error(`${c.name}: the selling multiplier is below the buying one, so it would sell below cost`);
          rows.push({ vendor_id: MN_BROILERS_ID, cut_id: c.id, effective_date: date, multiplier: v, selling_multiplier: sell });
        }
      });
      if (rows.length === 0) throw new Error('Enter at least one multiplier');
      const { error } = await supabase
        .from('chicken_cut_multipliers')
        .upsert(rows, { onConflict: 'vendor_id,cut_id,effective_date' });
      if (error) throw error;
      if (clearIds.length > 0) {
        const { error: delError } = await supabase
          .from('chicken_cut_multipliers')
          .delete()
          .eq('vendor_id', MN_BROILERS_ID)
          .eq('effective_date', date)
          .in('cut_id', clearIds);
        if (delError) throw delError;
      }
      await recordPrices({ from: date });
    },
    onSuccess: () => {
      invalidateAll();
      setEditingDate(null);
      toast.success('Multipliers saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renderInput = (key: string) => (
    <Input
      type="number" step="0.01" min="0" className="h-8 w-20 text-center"
      value={editValues[key] ?? ''}
      onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
    />
  );

  const saveCancel = (
    <div className="flex gap-1">
      <Button size="sm" onClick={() => saveSet.mutate()} disabled={saveSet.isPending}>
        {saveSet.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditingDate(null)}>Cancel</Button>
    </div>
  );

  return (
      <div className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {todayRate
              ? `Today (${fmtDate(today)}): ₹${todayRate.rate}/kg`
              : `Today's rate (${fmtDate(today)}) is not set yet`}
            {' · '}M N Broilers buying price = live rate × the cut's buy multiplier; selling price = live rate × the sell multiplier, rounded to the rupee. A blank sell multiplier leaves that product's selling price unchanged.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Multiplier</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>M N Broilers</TableHead>
                  {cuts.map((c) => (
                    <TableHead key={c.id} className="text-center text-xs whitespace-normal min-w-[92px]">
                      {c.name}
                      {!c.product_id && <span className="block text-[10px] text-amber-600">not linked</span>}
                    </TableHead>
                  ))}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sets.map(([date, values]) => {
                  const isEditing = editingDate === date;
                  return ['buy', 'sell'].map((kind) => (
                    <TableRow key={`${date}-${kind}`} className={kind === 'sell' ? 'border-b-2' : 'border-b-0'}>
                      <TableCell className="whitespace-nowrap font-medium">{kind === 'buy' ? fmtDate(date) : ''}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{kind === 'buy' ? 'Buy ×' : 'Sell ×'}</TableCell>
                      {cuts.map((c) => {
                        const v = values[`${c.id}:${kind}`];
                        return (
                          <TableCell key={c.id} className="text-center">
                            {isEditing ? renderInput(`${c.id}:${kind}`) : (v != null ? v.toFixed(2) : '-')}
                          </TableCell>
                        );
                      })}
                      <TableCell className="whitespace-nowrap">
                        {kind === 'sell' ? null : isEditing ? saveCancel : (
                          <Button size="sm" variant="outline" onClick={() => startEdit(date)} disabled={editingDate !== null}>
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ));
                })}
                {editingDate === 'NEW' && ['buy', 'sell'].map((kind) => (
                  <TableRow key={`new-${kind}`}>
                    <TableCell>
                      {kind === 'buy' && <Input type="date" className="h-8 w-36" value={newSetDate} onChange={(e) => setNewSetDate(e.target.value)} />}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{kind === 'buy' ? 'Buy ×' : 'Sell ×'}</TableCell>
                    {cuts.map((c) => (
                      <TableCell key={c.id} className="text-center">{renderInput(`${c.id}:${kind}`)}</TableCell>
                    ))}
                    <TableCell className="whitespace-nowrap">{kind === 'buy' ? saveCancel : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">
              An order uses the set whose date is on or before the order day, so older days keep their old prices.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={startNew} disabled={editingDate !== null}>
              Add new set
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Daily Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" className="w-44" value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Live rate (₹/kg)</Label>
                <Input type="number" step="0.01" min="0" className="w-36" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Source</Label>
                <Input className="w-56" value={source} onChange={(e) => setSource(e.target.value)} />
              </div>
              <Button onClick={() => saveRate.mutate()} disabled={saveRate.isPending}>
                {saveRate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Monthly List</CardTitle>
            <Input
              type="month" className="w-44" value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          </CardHeader>
          <CardContent>
            {(monthRates || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No rates saved for this month.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Live Rate</TableHead>
                    {cuts.map((c) => (
                      <TableHead key={c.id} className="text-center text-xs whitespace-normal min-w-[92px]">{c.name}</TableHead>
                    ))}
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(monthRates || []).map((r) => (
                    <TableRow key={r.rate_date}>
                      <TableCell className="whitespace-nowrap font-medium">{fmtDate(r.rate_date)}</TableCell>
                      <TableCell>{r.rate}</TableCell>
                      {cuts.map((c) => {
                        const m = multiplierOn(multipliers, c.id, r.rate_date);
                        return (
                          <TableCell key={c.id} className="text-center">
                            {m == null ? '-' : priceFromRate(Number(r.rate), m)}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => {
                            setRateDate(r.rate_date);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {overrideDialog}
      </div>
  );
}
