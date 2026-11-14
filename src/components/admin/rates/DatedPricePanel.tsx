import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { History, Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { istDateString } from '@/lib/live-rate';
import { deletePriceRecord, latestWith, recordOn, recordsFor, usePriceRecords, type PriceRecord } from '@/lib/product-prices';
import { fmtDay, PriceHistoryDialog, rupees, usePriceSaver } from './PriceDialogs';
import { ensureVendorMapped, type RateProduct } from './useRateProducts';

interface Props {
  title: string;
  description: string;
  products: RateProduct[];
  vendorId: string | null; // null = prices not tied to a supplier
  storeKey: string;
  showCategory?: boolean;
  // Names that should exist in this list (e.g. the nine mutton products); missing ones can be added.
  expectedNames?: string[];
  newProductCategory?: { id: string; name: string } | null;
  // Selling prices only: the purchase price comes from elsewhere (M N Broilers' live rate) and is
  // shown for reference, never changed here.
  sellingOnly?: boolean;
}

// Products in rows with their active purchase and selling price. Edit saves a new dated record
// (prices carry forward until the next one); Delete removes a wrong record; History lists them all.
export function DatedPricePanel({
  title, description, products, vendorId, storeKey, showCategory, expectedNames, newProductCategory, sellingOnly,
}: Props) {
  const queryClient = useQueryClient();
  const today = istDateString();
  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const { data: records, isLoading } = usePriceRecords(productIds, storeKey);
  const { save, dialog: overrideDialog } = usePriceSaver();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [editing, setEditing] = useState<RateProduct | null>(null);
  const [form, setForm] = useState({ date: today, purchase: '', selling: '' });
  const [historyFor, setHistoryFor] = useState<RateProduct | null>(null);
  const [deleting, setDeleting] = useState<{ product: RateProduct; record: PriceRecord } | null>(null);

  const refresh = () => {
    ['product-prices', 'current-product-prices', 'rate-products', 'products'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }));
  };

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.categoryName))).sort(),
    [products],
  );
  const visible = products.filter((p) =>
    (category === 'all' || p.categoryName === category)
    && (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase())));

  const missing = (expectedNames || []).filter(
    (n) => !products.some((p) => p.name.trim().toLowerCase() === n.toLowerCase()));

  // In selling-only mode the two prices can come from different days' records.
  const pricesFor = (productId: string) => {
    if (!sellingOnly) {
      const r = recordOn(records, productId, vendorId, today);
      return { purchase: r?.purchase_price ?? null, selling: r?.selling_price ?? null, record: r, since: r?.effective_date };
    }
    const buy = latestWith(records, productId, vendorId, today, 'purchase_price');
    const sell = latestWith(records, productId, vendorId, today, 'selling_price');
    return { purchase: buy?.purchase_price ?? null, selling: sell?.selling_price ?? null, record: sell, since: sell?.effective_date };
  };

  const openEdit = (p: RateProduct) => {
    const r = sellingOnly ? latestWith(records, p.id, vendorId, today, 'selling_price') : recordOn(records, p.id, vendorId, today);
    setForm({
      date: today,
      purchase: r?.purchase_price != null ? String(r.purchase_price) : '',
      selling: r?.selling_price != null ? String(r.selling_price) : '',
    });
    setEditing(p);
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const purchase = sellingOnly || form.purchase.trim() === '' ? null : Number(form.purchase);
      const selling = form.selling.trim() === '' ? null : Number(form.selling);
      if (!form.date) throw new Error('Pick the date the price takes effect');
      if (sellingOnly && selling == null) throw new Error('Enter the selling price');
      if (purchase == null && selling == null) throw new Error('Enter a purchase or selling price');
      if (purchase != null && !(purchase >= 0)) throw new Error('Purchase price must be a number');
      if (selling != null && !(selling > 0)) throw new Error('Selling price must be above 0');
      if (purchase != null && selling != null && selling < purchase) {
        throw new Error(`Selling price ₹${selling} is below purchase price ₹${purchase}`);
      }
      if (vendorId) await ensureVendorMapped(vendorId, editing.id);
      const res = await save([sellingOnly
        // Leave out the purchase price so that day's live-rate buying price is kept.
        ? { product_id: editing.id, vendor_id: vendorId, effective_date: form.date, selling_price: selling, source: 'manual', label: editing.name }
        : {
          product_id: editing.id, vendor_id: vendorId, effective_date: form.date,
          purchase_price: purchase, selling_price: selling, source: 'manual', label: editing.name,
        }]);
      if (res.skipped) throw new Error('Not saved: fix the price or give a reason.');
      if (selling != null && form.date <= today) {
        // With a buying and a selling price in force today, switch the product on (Storefront,
        // In stock, Orderable, Order form). You can switch any of them off again by hand.
        const before = pricesFor(editing.id);
        const hasBuy = purchase != null || before.purchase != null;
        await supabase.from('products').update((hasBuy
          ? { awaiting_daily_price: false, is_published: true, in_stock: true, is_orderable: true, show_in_order_form: true }
          : { awaiting_daily_price: false }) as any).eq('id', editing.id);
      }
    },
    onSuccess: () => { setEditing(null); refresh(); toast.success('Price saved'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRecord = useMutation({
    mutationFn: async () => {
      if (!deleting) return;
      if (sellingOnly && deleting.record.purchase_price != null) {
        // Keep that day's buying price; only take the selling price off.
        const { error } = await (supabase as any).from('product_prices').update({ selling_price: null }).eq('id', deleting.record.id);
        if (error) throw new Error(error.message);
      } else {
        await deletePriceRecord(deleting.record.id);
      }
    },
    onSuccess: () => { setDeleting(null); refresh(); toast.success('Price record deleted; the previous one applies again'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMissing = useMutation({
    mutationFn: async () => {
      if (!newProductCategory || missing.length === 0) return;
      const { error } = await supabase.from('products').insert(missing.map((name) => ({
        name, category: newProductCategory.name, category_id: newProductCategory.id,
        unit: 'kg', price: 0, is_published: false, in_stock: true,
      })) as any);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success('Added. Enter their prices, then publish them on Products.'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row flex-wrap items-center gap-2 space-y-0">
        <div className="mr-auto">
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        {showCategory && categories.length > 1 && (
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input className="h-8 w-52 pl-8" placeholder="Search product" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </CardHeader>
      <CardContent>
        {missing.length > 0 && newProductCategory && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Not in the catalogue yet: {missing.join(', ')}.
            <Button size="sm" variant="outline" onClick={() => addMissing.mutate()} disabled={addMissing.isPending}>
              <Plus className="h-3 w-3 mr-1" />Add {missing.length === 1 ? 'it' : 'them'}
            </Button>
          </div>
        )}
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                {showCategory && <TableHead>Category</TableHead>}
                <TableHead className="text-right">{sellingOnly ? 'Buying (live rate)' : 'Purchase'}</TableHead>
                <TableHead className="text-right">Selling</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead>Since</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow><TableCell colSpan={showCategory ? 7 : 6} className="text-sm text-muted-foreground">No products match.</TableCell></TableRow>
              )}
              {visible.map((p) => {
                const { purchase, selling, record: r, since } = pricesFor(p.id);
                const margin = purchase != null && selling != null ? Number(selling) - Number(purchase) : null;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.name}
                      {!p.is_published && <Badge variant="outline" className="ml-2 text-[10px]">Hidden</Badge>}
                    </TableCell>
                    {showCategory && <TableCell className="text-xs text-muted-foreground">{p.categoryName}</TableCell>}
                    <TableCell className={`text-right ${sellingOnly ? 'text-muted-foreground' : ''}`}>{rupees(purchase)}</TableCell>
                    <TableCell className="text-right">{rupees(selling)}</TableCell>
                    <TableCell className={`text-right text-xs ${margin != null && margin < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {margin == null ? '-' : rupees(margin)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{since ? fmtDay(since) : 'No price yet'}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Edit price" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="History" onClick={() => setHistoryFor(p)}><History className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Delete this price record" disabled={!r}
                        onClick={() => r && setDeleting({ product: p, record: r })}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{sellingOnly ? 'Selling price' : 'Edit price'} · {editing?.name}</DialogTitle>
            <DialogDescription>Saves a new dated record; the current one stays in the history.</DialogDescription>
          </DialogHeader>
          <div className={`grid gap-3 ${sellingOnly ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <div className={`space-y-1 ${sellingOnly ? '' : 'col-span-3 sm:col-span-1'}`}>
              <Label className="text-xs">Takes effect</Label>
              <Input type="date" className="h-9" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            {!sellingOnly && (
              <div className="space-y-1">
                <Label className="text-xs">Purchase ₹/{editing?.unit}</Label>
                <Input inputMode="decimal" className="h-9" value={form.purchase} onChange={(e) => setForm({ ...form, purchase: e.target.value })} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Selling ₹/{editing?.unit}</Label>
              <Input inputMode="decimal" className="h-9" value={form.selling} onChange={(e) => setForm({ ...form, selling: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>
              {saveEdit.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{sellingOnly ? 'Remove this selling price?' : 'Delete this price record?'}</DialogTitle>
            <DialogDescription>
              {deleting && (sellingOnly
                ? `${deleting.product.name}, selling ${rupees(deleting.record.selling_price)} from ${fmtDay(deleting.record.effective_date)}. The previous selling price applies again; buying prices stay.`
                : `${deleting.product.name}, from ${fmtDay(deleting.record.effective_date)}: purchase ${rupees(deleting.record.purchase_price)}, selling ${rupees(deleting.record.selling_price)}. The previous record applies again. The product itself stays.`)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => removeRecord.mutate()} disabled={removeRecord.isPending}>Delete record</Button>
          </div>
        </DialogContent>
      </Dialog>

      <PriceHistoryDialog
        open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}
        title={historyFor?.name || ''} records={historyFor ? recordsFor(records, historyFor.id, vendorId) : []}
      />
      {overrideDialog}
    </Card>
  );
}
