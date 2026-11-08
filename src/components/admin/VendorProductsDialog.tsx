import { useMemo, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/currency';
import { Vendor, VendorProduct } from '@/types/vendor';

interface VendorProductsDialogProps {
  vendor: Vendor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VendorProductsDialog({ vendor, open, onOpenChange }: VendorProductsDialogProps) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [costPrice, setCostPrice] = useState('');
  const [leadTime, setLeadTime] = useState('1');
  const [minQty, setMinQty] = useState('1');

  const { data: vendorProducts, isLoading } = useQuery({
    queryKey: ['vendor-products', vendor.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendor_products')
        .select(`
          *,
          product:products(id, name, category)
        `)
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as (VendorProduct & { product: { id: string; name: string; category: string } })[];
    },
    enabled: open
  });

  const { data: availableProducts } = useQuery({
    queryKey: ['available-products', vendor.id],
    queryFn: async () => {
      const { data: allProducts, error: productsError } = await supabase
        .from('products')
        .select('id, name, category, category_id, is_active' as any)
        .order('name');
      
      if (productsError) throw productsError;

      const { data: linkedProducts, error: linkedError } = await supabase
        .from('vendor_products')
        .select('product_id')
        .eq('vendor_id', vendor.id);
      
      if (linkedError) throw linkedError;

      const linkedIds = new Set(linkedProducts.map(p => p.product_id));
      return (allProducts as any[]).filter(p => !linkedIds.has(p.id) && p.is_active !== false) as
        { id: string; name: string; category: string; category_id: string | null }[];
    },
    enabled: open && isAdding
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, name, slug').order('name');
      if (error) throw error;
      return data as { id: string; name: string; slug: string }[];
    },
    enabled: open && isAdding,
  });
  const categoryOf = (p: { category: string; category_id: string | null }) => {
    const text = String(p.category || '').toLowerCase();
    return categories?.find((c) => c.id === p.category_id)
      ?? categories?.find((c) => c.slug.toLowerCase() === text || c.name.toLowerCase() === text);
  };
  const shown = useMemo(() => (availableProducts || []).filter((p) =>
    (categoryFilter === 'all' || categoryOf(p)?.id === categoryFilter)
    && (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [availableProducts, categories, categoryFilter, search]);
  const allShownSelected = shown.length > 0 && shown.every((p) => selected.has(p.id));
  const toggle = (id: string, on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const toggleAllShown = (on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    shown.forEach((p) => (on ? next.add(p.id) : next.delete(p.id)));
    return next;
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (selected.size === 0) throw new Error('Tick at least one product');
      const { error } = await supabase.from('vendor_products').insert(Array.from(selected).map((product_id) => ({
        vendor_id: vendor.id,
        product_id,
        cost_price: parseFloat(costPrice) || 0,
        lead_time_days: parseInt(leadTime) || 1,
        minimum_order_quantity: parseInt(minQty) || 1
      })));
      if (error) throw error;
      return selected.size;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products', vendor.id] });
      queryClient.invalidateQueries({ queryKey: ['available-products', vendor.id] });
      queryClient.invalidateQueries({ queryKey: ['vendor-products-all'] });
      toast.success(`${count} product${count === 1 ? '' : 's'} linked to ${vendor.name}`);
      resetAddForm();
    },
    onError: (error) => {
      toast.error('Failed to link product: ' + error.message);
    }
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('vendor_products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products', vendor.id] });
      queryClient.invalidateQueries({ queryKey: ['available-products', vendor.id] });
      toast.success('Product unlinked from vendor');
    },
    onError: (error) => {
      toast.error('Failed to unlink product: ' + error.message);
    }
  });

  const togglePreferredMutation = useMutation({
    mutationFn: async ({ id, isPreferred }: { id: string; isPreferred: boolean }) => {
      const { error } = await supabase
        .from('vendor_products')
        .update({ is_preferred_vendor: isPreferred })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products', vendor.id] });
    }
  });

  const resetAddForm = () => {
    setIsAdding(false);
    setSelected(new Set());
    setSearch('');
    setCategoryFilter('all');
    setCostPrice('');
    setLeadTime('1');
    setMinQty('1');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Products Supplied by {vendor.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add Product Form */}
          {isAdding ? (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
              <div className="space-y-2">
                <Label>Products this vendor supplies</Label>
                <div className="flex flex-wrap gap-2">
                  <Input className="h-9 w-56" placeholder="Search product" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-md border bg-background max-h-64 overflow-y-auto">
                  <label className="flex items-center gap-2 border-b px-3 py-2 text-sm font-medium sticky top-0 bg-background">
                    <Checkbox checked={allShownSelected} onCheckedChange={(v) => toggleAllShown(!!v)} disabled={shown.length === 0} />
                    {categoryFilter === 'all' ? 'Select all shown' : `Whole category: ${categories?.find((c) => c.id === categoryFilter)?.name}`} ({shown.length})
                  </label>
                  {shown.length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">No products left to link here.</p>}
                  {shown.map((product) => (
                    <label key={product.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/50 cursor-pointer">
                      <Checkbox checked={selected.has(product.id)} onCheckedChange={(v) => toggle(product.id, !!v)} />
                      <span className="flex-1">{product.name}</span>
                      <span className="text-xs text-muted-foreground">{categoryOf(product)?.name || product.category}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{selected.size} selected. Products already linked to {vendor.name} aren't listed.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cost Price (₹, optional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Lead Time (days)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={leadTime}
                    onChange={(e) => setLeadTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Min Order Qty</Label>
                  <Input
                    type="number"
                    min="1"
                    value={minQty}
                    onChange={(e) => setMinQty(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={resetAddForm}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => addMutation.mutate()} 
                  disabled={selected.size === 0 || addMutation.isPending}
                >
                  {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Link {selected.size || ''} product{selected.size === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Link products
            </Button>
          )}

          {/* Products Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Cost Price</TableHead>
                  <TableHead>Lead Time</TableHead>
                  <TableHead>Min Qty</TableHead>
                  <TableHead>Preferred</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : vendorProducts && vendorProducts.length > 0 ? (
                  vendorProducts.map((vp) => (
                    <TableRow key={vp.id}>
                      <TableCell className="font-medium">{vp.product?.name || 'Unknown'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {vp.product?.category}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(vp.cost_price)}</TableCell>
                      <TableCell>{vp.lead_time_days} days</TableCell>
                      <TableCell>{vp.minimum_order_quantity}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={vp.is_preferred_vendor}
                            onCheckedChange={(checked) => 
                              togglePreferredMutation.mutate({ id: vp.id, isPreferred: checked })
                            }
                          />
                          {vp.is_preferred_vendor && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm('Remove this product from vendor?')) {
                              removeMutation.mutate(vp.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No products linked to this vendor yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
