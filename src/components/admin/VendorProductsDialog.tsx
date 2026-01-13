import { useState } from 'react';
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
  const [selectedProduct, setSelectedProduct] = useState('');
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
        .select('id, name, category')
        .order('name');
      
      if (productsError) throw productsError;

      const { data: linkedProducts, error: linkedError } = await supabase
        .from('vendor_products')
        .select('product_id')
        .eq('vendor_id', vendor.id);
      
      if (linkedError) throw linkedError;

      const linkedIds = new Set(linkedProducts.map(p => p.product_id));
      return allProducts.filter(p => !linkedIds.has(p.id));
    },
    enabled: open && isAdding
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('vendor_products').insert({
        vendor_id: vendor.id,
        product_id: selectedProduct,
        cost_price: parseFloat(costPrice) || 0,
        lead_time_days: parseInt(leadTime) || 1,
        minimum_order_quantity: parseInt(minQty) || 1
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-products', vendor.id] });
      queryClient.invalidateQueries({ queryKey: ['available-products', vendor.id] });
      toast.success('Product linked to vendor');
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
    setSelectedProduct('');
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Select Product</Label>
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a product..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProducts?.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} ({product.category})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Cost Price (₹)</Label>
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
                  disabled={!selectedProduct || addMutation.isPending}
                >
                  {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Product
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Link Product
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
