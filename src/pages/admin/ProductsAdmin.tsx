import { useState, useRef } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Pencil, Trash2, Loader2, Upload, Image as ImageIcon, X } from 'lucide-react';
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
}

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
  yield_multiplier: '1.0'
};

export default function ProductsAdmin() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(defaultForm);
  const [isUploading, setIsUploading] = useState(false);
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

  const createMutation = useMutation({
    mutationFn: async (data: ProductForm) => {
      const { error } = await supabase.from('products').insert({
        name: data.name,
        description: data.description || null,
        price: parseFloat(data.price),
        category: data.category,
        unit: data.unit,
        in_stock: data.in_stock,
        stock_quantity: parseInt(data.stock_quantity) || 0,
        image_url: data.image_url || null,
        hsn_code: data.hsn_code || null,
        is_processed: data.is_processed,
        yield_multiplier: parseFloat(data.yield_multiplier) || 1.0
      });
      if (error) throw error;
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
      const { error } = await supabase.from('products').update({
        name: data.name,
        description: data.description || null,
        price: parseFloat(data.price),
        category: data.category,
        unit: data.unit,
        in_stock: data.in_stock,
        stock_quantity: parseInt(data.stock_quantity) || 0,
        image_url: data.image_url || null,
        hsn_code: data.hsn_code || null,
        is_processed: data.is_processed,
        yield_multiplier: parseFloat(data.yield_multiplier) || 1.0
      }).eq('id', id);
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
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Product deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete product: ' + error.message);
    }
  });

  const toggleStockMutation = useMutation({
    mutationFn: async ({ id, inStock }: { id: string; inStock: boolean }) => {
      const { error } = await supabase.from('products').update({ in_stock: inStock }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });

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
      category: product.category,
      unit: product.unit,
      in_stock: product.in_stock,
      stock_quantity: (product.stock_quantity || 0).toString(),
      image_url: product.image_url || '',
      hsn_code: product.hsn_code || '',
      is_processed: product.is_processed ?? false,
      yield_multiplier: (product.yield_multiplier ?? 1.0).toString()
    });
    setEditingId(product.id);
    setIsOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price) {
      toast.error('Name and price are required');
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
            <p className="font-body text-muted-foreground">Manage your product inventory</p>
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
            <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Product' : 'Add New Product'}</DialogTitle>
              </DialogHeader>
              <ScrollArea className="flex-1 pr-4">
                <form onSubmit={handleSubmit} className="space-y-4 pb-4">
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
                  <div className="space-y-2">
                    <Label htmlFor="price">Price *</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      required
                    />
                  </div>
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
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.in_stock}
                      onCheckedChange={(checked) => setForm({ ...form, in_stock: checked })}
                    />
                    <Label>In Stock</Label>
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
                  <div className="flex gap-2 pt-4">
                    <Button type="button" variant="outline" onClick={resetForm} className="flex-1">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting} className="flex-1">
                      {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      {editingId ? 'Update' : 'Create'}
                    </Button>
                  </div>
                </form>
              </ScrollArea>
            </DialogContent>
          </Dialog>
        </div>

        {/* Products Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>In Stock</TableHead>
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
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : products && products.length > 0 ? (
                products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="capitalize">{product.category}</TableCell>
                    <TableCell>₹{Number(product.price).toFixed(0)}</TableCell>
                    <TableCell>{product.stock_quantity || 0}</TableCell>
                    <TableCell>
                      <Switch
                        checked={product.in_stock}
                        onCheckedChange={(checked) => 
                          toggleStockMutation.mutate({ id: product.id, inStock: checked })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(product)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this product?')) {
                              deleteMutation.mutate(product.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No products found. Add your first product to get started.
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
