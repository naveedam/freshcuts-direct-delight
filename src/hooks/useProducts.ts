import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Product } from '@/types/product';

// Map database products to frontend Product type
const mapDbProduct = (dbProduct: any): Product => ({
  id: dbProduct.id,
  name: dbProduct.name,
  description: dbProduct.description || '',
  price: Number(dbProduct.price),
  category: dbProduct.category as Product['category'],
  subCategory: undefined,
  image: dbProduct.image_url || '/placeholder.svg',
  unit: dbProduct.unit,
  inStock: dbProduct.in_stock ?? true,
  featured: false,
  pricingModel: dbProduct.pricing_model || 'weight_based',
  gstRate: dbProduct.gst_rate || 0,
  gstType: dbProduct.gst_type || 'Exempt',
  awaitingPrice: !!dbProduct.awaiting_daily_price,
  isOrderable: dbProduct.is_orderable ?? true,
  preorderEnabled: !!dbProduct.preorder_enabled,
  isActive: dbProduct.is_active ?? true,
});

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data.map(mapDbProduct);
    }
  });
}

export function useProductsByCategory(categorySlug: string) {
  return useQuery({
    queryKey: ['products', 'category', categorySlug],
    queryFn: async () => {
      // First get the category id from the slug
      const { data: category, error: catError } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', categorySlug)
        .single();

      if (catError) throw catError;

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('category_id', category.id)
        .eq('is_published', true)
        .eq('awaiting_daily_price', false)
        .eq('is_active' as any, true)
        .order('name');
      
      if (error) throw error;
      return data.map(mapDbProduct);
    },
    enabled: !!categorySlug
  });
}

export function useProduct(productId: string) {
  return useQuery({
    queryKey: ['products', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();
      
      if (error) throw error;
      return mapDbProduct(data);
    },
    enabled: !!productId
  });
}

export function useFeaturedProducts() {
  return useQuery({
    queryKey: ['products', 'featured'],
    queryFn: async () => {
      // Get first 4 products from each category as featured
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('in_stock', true)
        .eq('is_published', true)
        .eq('awaiting_daily_price', false)
        .eq('is_active' as any, true)
        .limit(8)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data.map(p => ({ ...mapDbProduct(p), featured: true }));
    }
  });
}

export type StorefrontProduct = Product & { categoryId: string | null };

// Every published product with its category id, for the home page menu.
export function useStorefrontProducts() {
  return useQuery({
    queryKey: ['products', 'storefront'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_published', true)
        .eq('awaiting_daily_price', false)
        .eq('is_active' as any, true)
        .order('name');
      if (error) throw error;
      return data.map((p: any): StorefrontProduct => ({ ...mapDbProduct(p), categoryId: p.category_id ?? null }));
    },
    staleTime: 60 * 1000,
  });
}
