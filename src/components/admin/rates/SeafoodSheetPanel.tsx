import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Copy, History, Loader2, Plus, Repeat, X } from 'lucide-react';
import { istDateString } from '@/lib/live-rate';
import { deletePriceRecord, recordsFor, usePriceRecords, type PriceRecord } from '@/lib/product-prices';
import { fmtDay, PriceHistoryDialog, usePriceSaver } from './PriceDialogs';
import { ensureVendorMapped, type RateProduct } from './useRateProducts';

const NO_SUPPLIER = 'none';

interface SheetRow {
  key: string;
  product_id: string;
  vendor_id: string | null;
  purchase: string;
  selling: string;
  inCatch: boolean;
  recordId?: string; // set when the row is that day's saved record
}

let keySeq = 0;
const newKey = () => `row-${++keySeq}`;

// Seafood prices as a daily sheet: the fish available that day with purchase and selling price.
// Repeat Previous Day / Copy From Date fill the form from an earlier sheet; saving creates new,
// independent records for this date and never touches the sheet copied from.
export function SeafoodSheetPanel({ products, vendors }: { products: RateProduct[]; vendors: { id: string; name: string }[] }) {
  const queryClient = useQueryClient();
  const today = istDateString();
  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const { data: records, isLoading } = usePriceRecords(productIds, 'seafood');
  const { save, dialog: overrideDialog } = usePriceSaver();

  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [copyDate, setCopyDate] = useState('');
  const [adding, setAdding] = useState('');
  const [historyFor, setHistoryFor] = useState<RateProduct | null>(null);
  const [dirty, setDirty] = useState(false);

  const nameOf = (id: string) => products.find((p) => p.id === id)?.name || 'Removed product';
  const vendorNames = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);

  const sheetDates = useMemo(
    () => Array.from(new Set((records || []).map((r) => r.effective_date))).sort(),
    [records],
  );
  const recordsOn = (d: string) => (records || []).filter((r) => r.effective_date === d);

  const { data: catchToday } = useQuery({
    queryKey: ['todays-catch-sheet', date],
    queryFn: async () => {
      const { data, error } = await supabase.from('todays_catch').select('product_id').eq('catch_date', date);
      if (error) throw error;
      return new Set((data || []).map((r: any) => r.product_id as string));
    },
  });

  const toRow = (r: PriceRecord, keepId: boolean, inCatch: boolean): SheetRow => ({
    key: newKey(), product_id: r.product_id, vendor_id: r.vendor_id,
    purchase: r.purchase_price != null ? String(r.purchase_price) : '',
    selling: r.selling_price != null ? String(r.selling_price) : '',
    inCatch, recordId: keepId ? r.id : undefined,
  });

  // Load the chosen day's saved sheet (unless there are unsaved edits).
  useEffect(() => {
    if (!records || !catchToday || dirty) return;
    setRows(recordsOn(date).map((r) => toRow(r, true, catchToday.has(r.product_id))));
    setCopiedFrom(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, catchToday, date]);

  const copyFrom = (from: string) => {
    const src = recordsOn(from);
    if (src.length === 0) { toast.error(`No sheet saved for ${fmtDay(from)}`); return; }
    // Only products and their prices are copied: stock and storefront visibility are not.
    setRows(src.map((r) => ({ ...toRow(r, false, true), recordId: undefined })));
    setCopiedFrom(from);
    setDirty(true);
    toast.success(`Copied ${src.length} fish from ${fmtDay(from)}. Edit, add or remove, then save.`);
  };

  const previousDate = [...sheetDates].reverse().find((d) => d < date);
  const existingForDate = recordsOn(date);

  const update = (key: string, patch: Partial<SheetRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const addProduct = (id: string) => {
    if (!id) return;
    const p = products.find((x) => x.id === id);
    setRows((rs) => [...rs, { key: newKey(), product_id: id, vendor_id: null, purchase: '', selling: '', inCatch: true }]);
    setAdding('');
    setDirty(true);
    if (p) toast.message(`${p.name} added`);
  };

  const saveSheet = useMutation({
    mutationFn: async () => {
      const seen = new Set<string>();
      const inputs = rows.map((r) => {
        const name = nameOf(r.product_id);
        const purchase = r.purchase.trim() === '' ? null : Number(r.purchase);
        const selling = r.selling.trim() === '' ? null : Number(r.selling);
        if (purchase == null && selling == null) throw new Error(`${name}: enter a purchase or selling price, or remove the row`);
        if (purchase != null && !(purchase >= 0)) throw new Error(`${name}: purchase price must be a number`);
        if (selling != null && !(selling > 0)) throw new Error(`${name}: selling price must be above 0`);
        if (purchase != null && selling != null && selling < purchase) throw new Error(`${name}: selling ₹${selling} is below purchase ₹${purchase}`);
        const k = `${r.product_id}:${r.vendor_id ?? ''}`;
        if (seen.has(k)) throw new Error(`${name} is on the sheet twice for the same supplier`);
        seen.add(k);
        return {
          product_id: r.product_id, vendor_id: r.vendor_id, effective_date: date,
          purchase_price: purchase, selling_price: selling,
          source: (copiedFrom ? 'repeat' : 'seafood_sheet') as 'repeat' | 'seafood_sheet', label: name,
        };
      });

      // Records already saved for this date that are no longer on the sheet.
      const keep = new Set(rows.map((r) => `${r.product_id}:${r.vendor_id ?? ''}`));
      const removed = existingForDate.filter((r) => !keep.has(`${r.product_id}:${r.vendor_id ?? ''}`));
      if (existingForDate.length > 0 && copiedFrom
        && !confirm(`${fmtDay(date)} already has a saved sheet. Update it with these rows?`)) return 'cancelled';
      if (removed.length > 0
        && !confirm(`Remove ${removed.length} fish from the ${fmtDay(date)} sheet? ${removed.map((r) => nameOf(r.product_id)).join(', ')}`)) return 'cancelled';

      for (const r of rows) if (r.vendor_id) await ensureVendorMapped(r.vendor_id, r.product_id);
      const res = await save(inputs);
      if (res.skipped) throw new Error(`${res.skipped} row${res.skipped === 1 ? '' : 's'} not saved: fix the price or give a reason, then save again.`);
      for (const r of removed) await deletePriceRecord(r.id);

      const onSheet = Array.from(new Set(rows.map((r) => r.product_id)));
      const db = supabase as any;
      // Today's Catch: the ticked fish for this date.
      const ticked = new Set(rows.filter((r) => r.inCatch).map((r) => r.product_id));
      const { data: existingCatch } = await supabase.from('todays_catch').select('product_id').eq('catch_date', date);
      const had = new Set((existingCatch || []).map((r: any) => r.product_id));
      const toRemove = Array.from(had).filter((id) => !ticked.has(id as string));
      if (toRemove.length) await supabase.from('todays_catch').delete().eq('catch_date', date).in('product_id', toRemove as string[]);
      const toAdd = Array.from(ticked).filter((id) => !had.has(id));
      if (toAdd.length) {
        await supabase.from('todays_catch').insert(toAdd.map((product_id, i) => ({ catch_date: date, product_id, display_order: had.size + i })));
      }

      if (date === today) {
        // Fish on today's sheet are in stock; seafood not on it is out of stock (pre-orders aside).
        if (onSheet.length) await db.from('products').update({ in_stock: true, awaiting_daily_price: false }).in('id', onSheet);
        const off = productIds.filter((id) => !onSheet.includes(id));
        if (off.length) await db.from('products').update({ in_stock: false }).in('id', off);
        // The storefront still waits for this until the storefront step replaces it.
        await db.from('seafood_price_publications').upsert(
          { publish_date: today, published_at: new Date().toISOString(), changed_count: inputs.length },
          { onConflict: 'publish_date' },
        );
      }
      return 'saved';
    },
    onSuccess: (outcome) => {
      if (outcome !== 'saved') return;
      setDirty(false);
      setCopiedFrom(null);
      ['product-prices', 'current-product-prices', 'rate-products', 'products', 'todays-catch-sheet', 'todays-catch-home', 'seafood-publication']
        .forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      toast.success(`Saved the ${fmtDay(date)} sheet`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const notOnSheet = products.filter((p) => !rows.some((r) => r.product_id === p.id));

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <CardTitle className="text-base">Seafood daily sheet</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              The fish available on the day, with purchase and selling price. Prices carry forward until the next sheet; earlier sheets are never changed.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sheet for</Label>
            <Input type="date" className="h-9 w-40" value={date}
              onChange={(e) => {
                if (!e.target.value) return;
                if (dirty && !confirm('Discard unsaved changes?')) return;
                setDirty(false); setDate(e.target.value);
              }} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button size="sm" variant="outline" disabled={!previousDate} onClick={() => previousDate && copyFrom(previousDate)}>
            <Repeat className="h-4 w-4 mr-1" />Repeat previous day{previousDate ? ` (${fmtDay(previousDate)})` : ''}
          </Button>
          <div className="flex items-end gap-1">
            <Select value={copyDate} onValueChange={setCopyDate}>
              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Pick a past sheet" /></SelectTrigger>
              <SelectContent>
                {[...sheetDates].reverse().filter((d) => d !== date).map((d) => (
                  <SelectItem key={d} value={d}>{fmtDay(d)} ({recordsOn(d).length} fish)</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!copyDate} onClick={() => copyFrom(copyDate)}>
              <Copy className="h-4 w-4 mr-1" />Copy from date
            </Button>
          </div>
          {copiedFrom && <span className="text-xs text-amber-700">Copied from {fmtDay(copiedFrom)}, not saved yet</span>}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground mb-3">
                No sheet for {fmtDay(date)} yet. Repeat the previous day, copy from a date, or add fish below.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fish</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Purchase ₹</TableHead>
                    <TableHead>Selling ₹</TableHead>
                    <TableHead className="text-center">Today's Catch</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const p = products.find((x) => x.id === r.product_id);
                    return (
                      <TableRow key={r.key}>
                        <TableCell className="font-medium">{nameOf(r.product_id)}</TableCell>
                        <TableCell>
                          <Select value={r.vendor_id ?? NO_SUPPLIER} onValueChange={(v) => update(r.key, { vendor_id: v === NO_SUPPLIER ? null : v })}>
                            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_SUPPLIER}>No supplier</SelectItem>
                              {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input inputMode="decimal" className="h-8 w-24" value={r.purchase} onChange={(e) => update(r.key, { purchase: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input inputMode="decimal" className="h-8 w-24" value={r.selling} onChange={(e) => update(r.key, { selling: e.target.value })} />
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={r.inCatch} onCheckedChange={(v) => update(r.key, { inCatch: !!v })} />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="History" onClick={() => p && setHistoryFor(p)}>
                            <History className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Remove from this sheet"
                            onClick={() => { setRows((rs) => rs.filter((x) => x.key !== r.key)); setDirty(true); }}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Select value={adding} onValueChange={addProduct}>
                <SelectTrigger className="h-9 w-60"><SelectValue placeholder="Add a fish" /></SelectTrigger>
                <SelectContent>
                  {notOnSheet.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Plus className="h-4 w-4 text-muted-foreground" />
              <Button className="ml-auto" onClick={() => saveSheet.mutate()} disabled={saveSheet.isPending || rows.length === 0}>
                {saveSheet.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save {fmtDay(date)} sheet ({rows.length})
              </Button>
            </div>
            {date === today && (
              <p className="text-xs text-muted-foreground mt-2">
                Saving today's sheet marks these fish In Stock and other seafood Out of Stock.
              </p>
            )}
          </>
        )}
      </CardContent>
      <PriceHistoryDialog
        open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}
        title={historyFor?.name || ''} records={historyFor ? recordsFor(records, historyFor.id) : []}
        vendorNames={vendorNames}
      />
      {overrideDialog}
    </Card>
  );
}
