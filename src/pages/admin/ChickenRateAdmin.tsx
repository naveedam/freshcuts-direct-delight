import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, TrendingUp } from 'lucide-react';
import { istDateString, MN_BROILERS_ID } from '@/lib/live-rate';

type Edit = { mult: string; add: string };

export default function ChickenRateAdmin() {
  const queryClient = useQueryClient();
  const today = istDateString();
  const [rateDate, setRateDate] = useState(today);
  const [rate, setRate] = useState('');
  const [source, setSource] = useState('KTPA Facebook');
  const [notes, setNotes] = useState('');
  const [edits, setEdits] = useState<Record<string, Edit>>({});

  const { data: rates } = useQuery({
    queryKey: ['live-chicken-rates-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_chicken_rates').select('*')
        .order('rate_date', { ascending: false }).limit(14);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: rules } = useQuery({
    queryKey: ['mn-broilers-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_products')
        .select('id, live_rate_multiplier, live_rate_adder, products(name)')
        .eq('vendor_id', MN_BROILERS_ID);
      if (error) throw error;
      return (data as any[]).sort((a, b) =>
        (a.products?.name || '').localeCompare(b.products?.name || ''));
    },
  });

  useEffect(() => {
    const row = rates?.find((r) => r.rate_date === rateDate);
    setRate(row ? String(row.rate) : '');
    setSource(row?.source || 'KTPA Facebook');
    setNotes(row?.notes || '');
  }, [rates, rateDate]);

  useEffect(() => {
    if (!rules) return;
    const next: Record<string, Edit> = {};
    rules.forEach((r) => {
      next[r.id] = {
        mult: r.live_rate_multiplier == null ? '' : String(r.live_rate_multiplier),
        add: r.live_rate_adder == null || Number(r.live_rate_adder) === 0 ? '' : String(r.live_rate_adder),
      };
    });
    setEdits(next);
  }, [rules]);

  const todayRow = rates?.find((r) => r.rate_date === today);

  const saveRate = useMutation({
    mutationFn: async () => {
      const value = parseFloat(rate);
      if (!(value > 0)) throw new Error('Enter a rate greater than 0');
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('live_chicken_rates').upsert(
        { rate_date: rateDate, rate: value, source: source || null, notes: notes || null, created_by: user?.id ?? null },
        { onConflict: 'rate_date' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-chicken-rates-history'] });
      queryClient.invalidateQueries({ queryKey: ['live-chicken-rate'] });
      toast.success('Live chicken rate saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveRules = useMutation({
    mutationFn: async () => {
      const results = await Promise.all(
        (rules || []).map((r) => {
          const e = edits[r.id];
          return supabase.from('vendor_products').update({
            live_rate_multiplier: e && e.mult !== '' ? Number(e.mult) : null,
            live_rate_adder: e && e.add !== '' ? Number(e.add) : 0,
          }).eq('id', r.id);
        }),
      );
      const failed = results.find((x) => x.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mn-broilers-rules'] });
      queryClient.invalidateQueries({ queryKey: ['vendor-products-all'] });
      toast.success('Pricing rules saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = (e?: Edit) =>
    todayRow && e && e.mult !== ''
      ? Math.round(Number(todayRow.rate) * Number(e.mult) + (e.add === '' ? 0 : Number(e.add)))
      : null;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" /> Live Chicken Rate
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the day's live rate from KTPA or any reliable source. M N Broilers buying prices on new and repeat orders follow it, and stay editable.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {todayRow ? `Today: ₹${todayRow.rate}/kg (${todayRow.source || 'no source'})` : "Today's rate is not set yet"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Live rate (₹/kg)</Label>
                <Input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Source</Label>
                <Input value={source} onChange={(e) => setSource(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Note</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <Button className="mt-4" onClick={() => saveRate.mutate()} disabled={saveRate.isPending}>
              {saveRate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save rate
            </Button>
            {rates && rates.length > 0 && (
              <Table className="mt-6">
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Rate (₹/kg)</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.rate_date}</TableCell>
                      <TableCell>{r.rate}</TableCell>
                      <TableCell>{r.source || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">M N Broilers pricing rules</CardTitle>
            <p className="text-xs text-muted-foreground">
              Buying price = live rate × multiplier + adder. Leave the multiplier blank to keep a product on manual pricing.
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-32">Multiplier</TableHead>
                  <TableHead className="w-32">Adder (₹)</TableHead>
                  <TableHead className="w-36 text-right">At today's rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rules || []).map((r) => {
                  const e = edits[r.id];
                  const p = preview(e);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.products?.name}</TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.0001" min="0" className="h-8"
                          value={e?.mult ?? ''}
                          onChange={(ev) => setEdits((prev) => ({
                            ...prev,
                            [r.id]: { ...(prev[r.id] || { mult: '', add: '' }), mult: ev.target.value },
                          }))}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.01" className="h-8"
                          value={e?.add ?? ''}
                          onChange={(ev) => setEdits((prev) => ({
                            ...prev,
                            [r.id]: { ...(prev[r.id] || { mult: '', add: '' }), add: ev.target.value },
                          }))}
                        />
                      </TableCell>
                      <TableCell className="text-right">{p != null ? `₹${p}` : '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <Button className="mt-4" onClick={() => saveRules.mutate()} disabled={saveRules.isPending}>
              {saveRules.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save rules
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
