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
import { Loader2, TrendingUp } from 'lucide-react';
import {
  istDateString, MN_BROILERS_ID, multiplierOn, priceFromRate,
  useTodayLiveRate, useChickenCuts, useChickenMultipliers,
} from '@/lib/live-rate';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}-${MONTHS[Number(m) - 1]}-${y.slice(2)}`;
}

export default function ChickenRateAdmin() {
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
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const invalidateAll = () => {
    [
      'chicken-cuts', 'chicken-multipliers', 'live-chicken-rate', 'live-chicken-rate-row',
      'live-chicken-rates-month', 'vendor-products-all',
    ].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  };

  const { data: products } = useQuery({
    queryKey: ['chicken-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price')
        .or('category.eq.Poultry,name.ilike.%chicken%')
        .order('name');
      if (error) throw error;
      return (data || []) as any[];
    },
  });

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

  // Multiplier sets, oldest first: [effective date, { cutId: multiplier }]
  const sets = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    multipliers.forEach((r) => {
      if (!map.has(r.effective_date)) map.set(r.effective_date, {});
      map.get(r.effective_date)![r.cut_id] = Number(r.multiplier);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [multipliers]);

  const startEdit = (date: string) => {
    const found = sets.find(([d]) => d === date);
    const values: Record<string, string> = {};
    cuts.forEach((c) => {
      const v = found?.[1][c.id];
      values[c.id] = v == null ? '' : String(v);
    });
    setEditValues(values);
    setEditingDate(date);
  };

  const startNew = () => {
    const latest = sets.length ? sets[sets.length - 1][1] : {};
    const values: Record<string, string> = {};
    cuts.forEach((c) => {
      values[c.id] = latest[c.id] == null ? '' : String(latest[c.id]);
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
        const raw = editValues[c.id];
        if (raw === undefined || raw === '') {
          clearIds.push(c.id);
        } else {
          const v = Number(raw);
          if (!(v > 0)) throw new Error(`Enter a multiplier above 0 for ${c.name}`);
          rows.push({ vendor_id: MN_BROILERS_ID, cut_id: c.id, effective_date: date, multiplier: v });
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
    },
    onSuccess: () => {
      invalidateAll();
      setEditingDate(null);
      toast.success('Multipliers saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const linkProduct = useMutation({
    mutationFn: async ({ cutId, productId }: { cutId: string; productId: string | null }) => {
      const { error } = await supabase.from('chicken_cuts').update({ product_id: productId }).eq('id', cutId);
      if (error) {
        throw new Error(error.code === '23505' ? 'That product is already linked to another cut.' : error.message);
      }
      if (productId) {
        // The vendor dropdown only offers mapped vendors, so make sure M N Broilers is mapped to this product.
        const { data: rows, error: vpError } = await supabase
          .from('vendor_products')
          .select('id, vendor_id, is_preferred_vendor')
          .eq('product_id', productId);
        if (vpError) throw vpError;
        if (!rows?.some((r: any) => r.vendor_id === MN_BROILERS_ID)) {
          const { error: insError } = await supabase.from('vendor_products').insert({
            vendor_id: MN_BROILERS_ID,
            product_id: productId,
            cost_price: 0,
            is_preferred_vendor: !rows?.some((r: any) => r.is_preferred_vendor),
          });
          if (insError) throw insError;
        }
      }
    },
    onSuccess: () => {
      invalidateAll();
      toast.success('Link saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renderInput = (cutId: string) => (
    <Input
      type="number" step="0.01" min="0" className="h-8 w-20 text-center"
      value={editValues[cutId] ?? ''}
      onChange={(e) => setEditValues((prev) => ({ ...prev, [cutId]: e.target.value }))}
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
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" /> Chicken Rate
          </h1>
          <p className="text-sm text-muted-foreground">
            {todayRate
              ? `Today (${fmtDate(today)}): ₹${todayRate.rate}/kg`
              : `Today's rate (${fmtDate(today)}) is not set yet`}
            {' · '}M N Broilers buying price = live rate × the cut's multiplier, rounded to the rupee. It fills in on new orders and stays editable.
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Multiplier</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
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
                  return (
                    <TableRow key={date}>
                      <TableCell className="whitespace-nowrap font-medium">{fmtDate(date)}</TableCell>
                      <TableCell className="whitespace-nowrap">M N Broilers</TableCell>
                      {cuts.map((c) => (
                        <TableCell key={c.id} className="text-center">
                          {isEditing ? renderInput(c.id) : (values[c.id] != null ? values[c.id].toFixed(2) : '-')}
                        </TableCell>
                      ))}
                      <TableCell className="whitespace-nowrap">
                        {isEditing ? saveCancel : (
                          <Button size="sm" variant="outline" onClick={() => startEdit(date)} disabled={editingDate !== null}>
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {editingDate === 'NEW' && (
                  <TableRow>
                    <TableCell>
                      <Input type="date" className="h-8 w-36" value={newSetDate} onChange={(e) => setNewSetDate(e.target.value)} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">M N Broilers</TableCell>
                    {cuts.map((c) => (
                      <TableCell key={c.id} className="text-center">{renderInput(c.id)}</TableCell>
                    ))}
                    <TableCell className="whitespace-nowrap">{saveCancel}</TableCell>
                  </TableRow>
                )}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Link cuts to catalog products</CardTitle>
            <p className="text-xs text-muted-foreground">
              An order only auto-prices a product once it is linked here. Linking also adds M N Broilers as a supplier for that product if it isn't one already.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cut</TableHead>
                  <TableHead>Catalog product</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Select
                        value={c.product_id || 'none'}
                        onValueChange={(v) => linkProduct.mutate({ cutId: c.id, productId: v === 'none' ? null : v })}
                      >
                        <SelectTrigger className="w-80 h-8"><SelectValue placeholder="Not linked" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not linked</SelectItem>
                          {(products || []).map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name} (₹{p.price})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
