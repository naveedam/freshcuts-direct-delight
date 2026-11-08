import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { istDateString, MN_BROILERS_ID, useChickenCuts } from '@/lib/live-rate';
import { latestWith, usePriceRecords, type PriceRecord } from '@/lib/product-prices';
import { usePriceSaver } from './PriceDialogs';
import { ensureVendorMapped } from './useRateProducts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}-${MONTHS[Number(m) - 1]}-${y.slice(2)}`;
}

// M N Broilers selling prices in rupees, laid out like the buying-price table: one column per
// cut, one row per date a price changed. A price applies from its date until the next change;
// a blank cell in a row means that cut's price didn't change that day.
export function ChickenSellingPanel() {
  const queryClient = useQueryClient();
  const today = istDateString();
  const { data: cutsData } = useChickenCuts();
  const cuts = (cutsData || []) as { id: string; name: string; product_id: string | null }[];
  const productIds = useMemo(() => cuts.map((c) => c.product_id).filter(Boolean) as string[], [cuts]);
  const { data: records, isLoading } = usePriceRecords(productIds, 'chicken-mn-selling');
  const { save, dialog: overrideDialog } = usePriceSaver();

  const [editingDate, setEditingDate] = useState<string | null>(null); // a row's date, or 'NEW'
  const [newDate, setNewDate] = useState(today);
  const [values, setValues] = useState<Record<string, string>>({}); // cutId -> rupees

  // M N Broilers records that set a selling price, by date then product.
  const byDate = useMemo(() => {
    const map = new Map<string, Map<string, PriceRecord>>();
    (records || []).forEach((r) => {
      if (r.vendor_id !== MN_BROILERS_ID || r.selling_price == null) return;
      if (!map.has(r.effective_date)) map.set(r.effective_date, new Map());
      map.get(r.effective_date)!.set(r.product_id, r);
    });
    return map;
  }, [records]);
  const dates = useMemo(() => Array.from(byDate.keys()).sort((a: string, b: string) => b.localeCompare(a)), [byDate]);

  const inForce = (productId: string | null, date: string): number | null => {
    if (!productId) return null;
    const r = latestWith(records, productId, MN_BROILERS_ID, date, 'selling_price');
    return r?.selling_price != null ? Number(r.selling_price) : null;
  };

  const startEdit = (date: string) => {
    const row = byDate.get(date);
    const v: Record<string, string> = {};
    cuts.forEach((c) => {
      const r = c.product_id ? row?.get(c.product_id) : undefined;
      v[c.id] = r?.selling_price != null ? String(r.selling_price) : '';
    });
    setValues(v);
    setEditingDate(date);
  };

  const startNew = () => {
    const v: Record<string, string> = {};
    cuts.forEach((c) => {
      const p = inForce(c.product_id, today);
      v[c.id] = p != null ? String(p) : '';
    });
    setValues(v);
    setNewDate(today);
    setEditingDate('NEW');
  };

  const saveRow = useMutation({
    mutationFn: async () => {
      const isNew = editingDate === 'NEW';
      const date = isNew ? newDate : editingDate!;
      if (!date) throw new Error('Pick the date these prices take effect');
      if (isNew && byDate.has(date)) throw new Error(`Prices are already set for ${fmtDate(date)}. Use Edit on that row.`);
      const existing = byDate.get(date);

      const toSave: { cut: typeof cuts[number]; price: number }[] = [];
      const toClear: PriceRecord[] = [];
      for (const c of cuts) {
        const raw = (values[c.id] ?? '').trim();
        const had = c.product_id ? existing?.get(c.product_id) : undefined;
        if (raw === '') {
          if (had) toClear.push(had);
          continue;
        }
        const price = Number(raw);
        if (!(price > 0)) throw new Error(`Enter a selling price above 0 for ${c.name}`);
        if (!c.product_id) throw new Error(`${c.name} isn't linked to a product yet, so it can't have a price`);
        // A new row only records the cuts whose price actually changes on that date.
        if (isNew && inForce(c.product_id, date) === price) continue;
        if (!isNew && had && Number(had.selling_price) === price) continue;
        toSave.push({ cut: c, price });
      }
      if (toSave.length === 0 && toClear.length === 0) {
        throw new Error(isNew ? 'No prices changed from the ones already in force' : 'Nothing changed');
      }

      for (const { cut } of toSave) await ensureVendorMapped(MN_BROILERS_ID, cut.product_id!);
      if (toSave.length > 0) {
        const res = await save(toSave.map(({ cut, price }) => ({
          // No purchase price here: that day's live-rate buying price stays as it is.
          product_id: cut.product_id!, vendor_id: MN_BROILERS_ID, effective_date: date,
          selling_price: price, source: 'manual' as const, label: cut.name,
        })));
        if (res.skipped) throw new Error('Some prices were not saved: fix them or give a reason.');
      }
      for (const r of toClear) {
        // Keep the record's buying price; just take the selling price off.
        const q = r.purchase_price != null
          ? (supabase as any).from('product_prices').update({ selling_price: null }).eq('id', r.id)
          : (supabase as any).from('product_prices').delete().eq('id', r.id);
        const { error } = await q;
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      ['product-prices', 'current-product-prices', 'products', 'rate-products'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }));
      setEditingDate(null);
      toast.success('Selling prices saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const input = (cutId: string, disabled: boolean) => (
    <Input
      type="number" step="1" min="0" className="h-8 w-20 text-center" disabled={disabled}
      value={values[cutId] ?? ''}
      onChange={(e) => setValues((prev) => ({ ...prev, [cutId]: e.target.value }))}
    />
  );
  const saveCancel = (
    <div className="flex gap-1">
      <Button size="sm" onClick={() => saveRow.mutate()} disabled={saveRow.isPending}>
        {saveRow.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Save
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setEditingDate(null)}>Cancel</Button>
    </div>
  );
  const cellText = (v: number | null | undefined) => (v != null ? `₹${Number(v)}` : '-');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Selling Price</CardTitle>
        <p className="text-xs text-muted-foreground">
          Rupees per kg. A price applies from its date until the next change; a blank cell means that cut didn't change that day.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
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
                <TableRow className="bg-muted/40">
                  <TableCell className="whitespace-nowrap text-xs font-medium">In force today</TableCell>
                  {cuts.map((c) => (
                    <TableCell key={c.id} className="text-center font-medium">{cellText(inForce(c.product_id, today))}</TableCell>
                  ))}
                  <TableCell />
                </TableRow>
                {editingDate === 'NEW' && (
                  <TableRow>
                    <TableCell>
                      <Input type="date" className="h-8 w-36" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                    </TableCell>
                    {cuts.map((c) => <TableCell key={c.id} className="text-center">{input(c.id, !c.product_id)}</TableCell>)}
                    <TableCell className="whitespace-nowrap">{saveCancel}</TableCell>
                  </TableRow>
                )}
                {dates.map((date) => {
                  const row = byDate.get(date)!;
                  const isEditing = editingDate === date;
                  return (
                    <TableRow key={date}>
                      <TableCell className="whitespace-nowrap font-medium">
                        {fmtDate(date)}
                        {date > today && <span className="block text-[10px] text-muted-foreground">upcoming</span>}
                      </TableCell>
                      {cuts.map((c) => (
                        <TableCell key={c.id} className="text-center">
                          {isEditing ? input(c.id, !c.product_id) : cellText(c.product_id ? row.get(c.product_id)?.selling_price : null)}
                        </TableCell>
                      ))}
                      <TableCell className="whitespace-nowrap">
                        {isEditing ? saveCancel : (
                          <Button size="sm" variant="outline" onClick={() => startEdit(date)} disabled={editingDate !== null}>Edit</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {dates.length === 0 && editingDate !== 'NEW' && (
                  <TableRow>
                    <TableCell colSpan={cuts.length + 2} className="text-sm text-muted-foreground">
                      No selling prices yet. Use "Set new prices" to enter them.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
        <Button variant="outline" size="sm" className="mt-3" onClick={startNew} disabled={editingDate !== null || isLoading}>
          Set new prices
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Orders already placed keep the price they were made at.
        </p>
      </CardContent>
      {overrideDialog}
    </Card>
  );
}
