import { useState, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Loader2, Upload, Image as ImageIcon, X, Search, RotateCcw, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { istDateString } from '@/lib/live-rate';
import { savePriceRows, isPriceCheckError } from '@/lib/product-prices';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Category } from '@/types/category';
interface ProductForm {
  name: string;
  description: string;
  price: string;
  category: string;
  unit: string;
  in_stock: boolean;
  stock_quantity: string;
  image_url: string;
  hsn_code: string;
  is_processed: boolean;
  yield_multiplier: string;
  purchase_price: string;
  // Product Master switches: each independent of the others.
  is_active: boolean;
  is_published: boolean;
  is_orderable: boolean;
  preorder_enabled: boolean;
  show_in_order_form: boolean;
}

// Which Rate Management tab prices a category.
const rateTabFor = (slug: string | null | undefined) =>
  slug === 'poultry' ? 'chicken' : slug === 'lamb' ? 'mutton' : slug === 'seafood' ? 'seafood' : 'other';

type SwitchField = 'is_published' | 'in_stock' | 'is_orderable' | 'preorder_enabled' | 'show_in_order_form';
const SWITCHES: { field: SwitchField; label: string; short: string }[] = [
  { field: 'is_published', label: 'Show on storefront', short: 'Storefront' },
  { field: 'in_stock', label: 'In stock', short: 'In stock' },
  { field: 'is_orderable', label: 'Available for ordering', short: 'Orderable' },
  { field: 'preorder_enabled', label: 'Accept pre-orders', short: 'Pre-order' },
  { field: 'show_in_order_form', label: 'Show in New Order dropdown', short: 'Order form' },
];

const FILTERS: Record<string, { label: string; test: (p: any) => boolean }> = {
  active: { label: 'Active products', test: (p) => p.is_active !== false },
  hidden: { label: 'Hidden from storefront', test: (p) => p.is_active !== false && !p.is_published },
  out: { label: 'Out of stock', test: (p) => p.is_active !== false && p.in_stock === false },
  notorderable: { label: 'Not orderable', test: (p) => p.is_active !== false && p.is_orderable === false },
  preorder: { label: 'Pre-orders on', test: (p) => p.is_active !== false && p.preorder_enabled },
  notinform: { label: 'Not in order form', test: (p) => p.is_active !== false && p.show_in_order_form === false },
  hsn: { label: 'HSN to check', test: (p) => p.is_active !== false && p.hsn_auto_filled },
  inactive: { label: 'Inactive', test: (p) => p.is_active === false },
  all: { label: 'All products', test: () => true },
};

const defaultForm: ProductForm = {
  name: '',
  description: '',
  price: '',
  category: 'lamb',
  unit: 'per lb',
  in_stock: true,
  stock_quantity: '0',
  image_url: '',
  hsn_code: '',
  is_processed: false,
  yield_multiplier: '1.0',
  purchase_price: '',
  is_active: true,
  is_published: false,
  is_orderable: true,
  preorder_enabled: false,
  show_in_order_form: true,
};

export default function ProductsAdmin() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(defaultForm);
  const [isUploading, setIsUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get the Supabase URL for constructing public URLs
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `products/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${filePath}`;
      
      setForm({ ...form, image_url: publicUrl });
      toast.success('Image uploaded successfully');
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Failed to upload image: ' + error.message);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const clearImage = () => {
    setForm({ ...form, image_url: '' });
  };
  const { data: products, isLoading } = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch categories from database
  const { data: categories } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data as Category[];
    }
  });

  const categoryIdFor = (slug: string) => categories?.find((c) => c.slug === slug)?.id ?? null;

  const createMutation = useMutation({
    mutationFn: async (data: ProductForm) => {
      const selling = parseFloat(data.price);
      const purchase = data.purchase_price.trim() === '' ? null : parseFloat(data.purchase_price);
      if (purchase != null && purchase > selling) {
        throw new Error(`Selling price ₹${selling} is below purchase price ₹${purchase}`);
      }
      const { data: created, error } = await supabase.from('products').insert({
        name: data.name,
        description: data.description || null,
        price: selling,
        category: data.category,
        category_id: categoryIdFor(data.category),
        is_active: data.is_active,
        is_published: data.is_published,
        is_orderable: data.is_orderable,
        preorder_enabled: data.preorder_enabled,
        show_in_order_form: data.show_in_order_form,
        unit: data.unit,
        in_stock: data.in_stock,
        stock_quantity: parseInt(data.stock_quantity) || 0,
        image_url: data.image_url || null,
        hsn_code: data.hsn_code || null,
        is_processed: data.is_processed,
        yield_multiplier: parseFloat(data.yield_multiplier) || 1.0
      } as any).select('id').single();
      if (error) throw error;
      // The starting price becomes the product's first dated record in Rate Management.
      try {
        await savePriceRows([{
          product_id: created.id, vendor_id: null, effective_date: istDateString(),
          purchase_price: purchase, selling_price: selling, source: 'manual',
        }]);
        await supabase.from('products').update({ awaiting_daily_price: false } as any).eq('id', created.id);
      } catch (e: any) {
        if (!isPriceCheckError(e)) throw e;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product created successfully');
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to create product: ' + error.message);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ProductForm }) => {
      // Price is not edited here: it comes from Rate Management.
      const { error } = await supabase.from('products').update({
        name: data.name,
        description: data.description || null,
        category: data.category,
        category_id: categoryIdFor(data.category),
        is_active: data.is_active,
        is_published: data.is_published,
        is_orderable: data.is_orderable,
        preorder_enabled: data.preorder_enabled,
        show_in_order_form: data.show_in_order_form,
        unit: data.unit,
        in_stock: data.in_stock,
        stock_quantity: parseInt(data.stock_quantity) || 0,
        image_url: data.image_url || null,
        hsn_code: data.hsn_code || null,
        is_processed: data.is_processed,
        yield_multiplier: parseFloat(data.yield_multiplier) || 1.0
      } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product updated successfully');
      resetForm();
    },
    onError: (error) => {
      toast.error('Failed to update product: ' + error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Products are deactivated, never deleted: orders and price history point to them.
      const { error } = await supabase.from('products')
        .update({ is_active: false, is_published: false, show_in_order_form: false } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deactivated. Its orders and price history are kept.');
    },
    onError: (error) => {
      toast.error('Failed to delete product: ' + error.message);
    }
  });

  // One switch on one product; the row updates at once and is checked against the database after.
  const toggleMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: SwitchField | 'is_active'; value: boolean }) => {
      const { error } = await supabase.from('products').update({ [field]: value } as any).eq('id', id);
      if (error) throw error;
    },
    onMutate: ({ id, field, value }) => {
      queryClient.setQueryData(['admin', 'products'], (old: any[] | undefined) =>
        old?.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
    },
    onError: (e: Error) => toast.error('Not saved: ' + e.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const slugOf = (p: any) => {
    const text = String(p.category || '').toLowerCase();
    return categories?.find((c) => c.id === p.category_id)?.slug
      ?? categories?.find((c) => c.slug.toLowerCase() === text || c.name.toLowerCase() === text)?.slug
      ?? null;
  };
  const visibleProducts = useMemo(() => (products || []).filter((p: any) =>
    FILTERS[statusFilter].test(p)
    && (categoryFilter === 'all' || slugOf(p) === categoryFilter)
    && (!search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [products, categories, statusFilter, categoryFilter, search]);

  const resetForm = () => {
    setForm(defaultForm);
    setEditingId(null);
    setIsOpen(false);
  };

  const handleEdit = (product: any) => {
    setForm({
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      category: slugOf(product) || product.category,
      unit: product.unit,
      in_stock: product.in_stock,
      stock_quantity: (product.stock_quantity || 0).toString(),
      image_url: product.image_url || '',
      hsn_code: product.hsn_code || '',
      is_processed: product.is_processed ?? false,
      yield_multiplier: (product.yield_multiplier ?? 1.0).toString(),
      purchase_price: '',
      is_active: product.is_active ?? true,
      is_published: !!product.is_published,
      is_orderable: product.is_orderable ?? true,
      preorder_enabled: !!product.preorder_enabled,
      show_in_order_form: product.show_in_order_form ?? true,
    });
    setEditingId(product.id);
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || (!editingId && !form.price)) {
      toast.error(editingId ? 'Name is required' : 'Name and selling price are required');
      return;
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">Products</h1>
            <p className="font-body text-muted-foreground">Product details and availability. Prices are set in Rate Management.</p>
          </div>
          <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </DialogTrigger>
            {/* Header and footer stay put; only the fields scroll, so Save is always in reach */}
            <DialogContent className="max-w-xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
              <DialogHeader className="px-5 pt-5 pb-3 border-b">
                <DialogTitle>{editingId ? 'Edit Product' : 'Add New Product'}</DialogTitle>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
                <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {editingId ? (
                    <div className="space-y-2">
                      <Label>Selling price</Label>
                      <div className="flex h-10 items-center gap-2 text-sm">
                        <span className="font-medium">₹{Number(form.price || 0).toFixed(0)}</span>
                        <Link to={`/admin/rates?tab=${rateTabFor(form.category)}`} className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                          Change in Rate Management <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-2">
                        <Label htmlFor="price">Selling ₹ *</Label>
                        <Input id="price" type="number" step="0.01" min="0" value={form.price}
                          onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="purchase_price">Purchase ₹</Label>
                        <Input id="purchase_price" type="number" step="0.01" min="0" value={form.purchase_price}
                          onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} />
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="unit">Unit</Label>
                    <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per lb">per lb</SelectItem>
                        <SelectItem value="each">each</SelectItem>
                        <SelectItem value="per pack">per pack</SelectItem>
                        <SelectItem value="per rack">per rack</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories?.map((cat) => (
                            <SelectItem key={cat.id} value={cat.slug}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="stock_quantity">Stock Qty</Label>
                      <Input
                        id="stock_quantity"
                        type="number"
                        min="0"
                        value={form.stock_quantity}
                        onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hsn_code">HSN Code</Label>
                    <Input
                      id="hsn_code"
                      value={form.hsn_code}
                      onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
                      placeholder="e.g., 0201, 0204, 0303"
                    />
                    <p className="text-xs text-muted-foreground">
                      Harmonized System of Nomenclature code for GST classification
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Product Image</Label>
                    
                    {/* Image Preview */}
                    {form.image_url && (
                      <div className="relative w-full h-32 rounded-lg overflow-hidden border bg-muted">
                        <img 
                          src={form.image_url} 
                          alt="Product preview" 
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/placeholder.svg';
                          }}
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 h-6 w-6"
                          onClick={clearImage}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    
                    {/* Upload Button */}
                    <div className="flex gap-2">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Image
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {/* Or enter URL manually */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">Or enter URL</span>
                      </div>
                    </div>
                    <Input
                      value={form.image_url}
                      onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                      placeholder="https://example.com/image.jpg"
                    />
                    <p className="text-xs text-muted-foreground">
                      <ImageIcon className="h-3 w-3 inline mr-1" />
                      Upload an image or paste a direct image URL (not Google Drive links)
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <p className="text-sm font-medium">Availability</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                      {[{ field: 'is_active', label: 'Active' } as const, ...SWITCHES].map(({ field, label }) => (
                        <label key={field} className="flex items-center gap-2 text-sm">
                          <Switch
                            checked={!!form[field]}
                            onCheckedChange={(checked) => setForm({ ...form, [field]: checked })}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Each switch is independent. Out of stock with pre-orders on still lets customers pre-order; hiding from the storefront doesn't remove it from the order form.
                    </p>
                  </div>
                  <div className="space-y-3 rounded-md border border-border p-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={form.is_processed}
                        onCheckedChange={(checked) => setForm({ ...form, is_processed: checked })}
                      />
                      <Label>Processed Item (yield loss)</Label>
                    </div>
                    {form.is_processed && (
                      <div className="space-y-2">
                        <Label htmlFor="yield_multiplier">Yield Multiplier</Label>
                        <Input
                          id="yield_multiplier"
                          type="number"
                          step="0.01"
                          min="1"
                          value={form.yield_multiplier}
                          onChange={(e) => setForm({ ...form, yield_multiplier: e.target.value })}
                          placeholder="e.g. 1.3"
                        />
                        <p className="text-xs text-muted-foreground">
                          Raw kg required per 1 kg of finished product. Example: Mutton Mince = 1.3 (1.3 kg bone-in → 1 kg mince).
                        </p>
                      </div>
                    )}
                  </div>
                </form>
              </div>
              <div className="flex gap-2 px-5 py-3 border-t bg-background">
                <Button type="button" variant="outline" onClick={resetForm} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" form="product-form" disabled={isSubmitting} className="flex-1">
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? 'Update' : 'Create'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="h-9 w-56 pl-8" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories?.map((c) => <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FILTERS).map(([k, f]) => <SelectItem key={k} value={k}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">{visibleProducts.length} shown</span>
        </div>

        {/* Products Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                {SWITCHES.map((sw) => (
                  <TableHead key={sw.field} className="text-center text-xs whitespace-nowrap px-2">{sw.short}</TableHead>
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell colSpan={SWITCHES.length}><Skeleton className="h-6 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : visibleProducts.length > 0 ? (
                visibleProducts.map((product: any) => {
                  const slug = slugOf(product);
                  const inactive = product.is_active === false;
                  return (
                  <TableRow key={product.id} className={inactive ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">
                      {product.name}
                      {inactive && <Badge variant="outline" className="ml-2 text-[10px]">Inactive</Badge>}
                      {product.awaiting_daily_price && <Badge variant="outline" className="ml-2 text-[10px] text-amber-700">No price yet</Badge>}
                      {product.hsn_auto_filled && <Badge variant="outline" className="ml-2 text-[10px] text-amber-700" title="HSN filled automatically; please check">HSN {product.hsn_code}?</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {categories?.find((c) => c.slug === slug)?.name || product.category}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Link to={`/admin/rates?tab=${rateTabFor(slug)}`} className="hover:underline" title="Set in Rate Management">
                        ₹{Number(product.price).toFixed(0)}
                      </Link>
                    </TableCell>
                    {SWITCHES.map((sw) => (
                      <TableCell key={sw.field} className="text-center px-2">
                        <Switch
                          checked={!!product[sw.field]}
                          disabled={inactive}
                          aria-label={`${sw.label}: ${product.name}`}
                          onCheckedChange={(checked) => toggleMutation.mutate({ id: product.id, field: sw.field, value: checked })}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(product)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {inactive ? (
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Reactivate"
                            onClick={() => toggleMutation.mutate({ id: product.id, field: 'is_active', value: true })}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" title="Deactivate"
                            onClick={() => {
                              if (confirm('Deactivate this product? It disappears from the storefront and order form; its orders and price history are kept.')) {
                                deleteMutation.mutate(product.id);
                              }
                            }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={4 + SWITCHES.length} className="text-center py-8 text-muted-foreground">
                    No products match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
}
