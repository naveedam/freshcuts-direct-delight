import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Product, CategoryInfo } from '@/types/product';

// Map database products to frontend Product type
const mapDbProduct = (dbProduct: any): Product => ({
  id: dbProduct.id,
  name: dbProduct.name,
  description: dbProduct.description || '',
  price: Number(dbProduct.price),
  category: dbProduct.category as Product['category'],
  subCategory: undefined, // We'll derive this from name patterns
  image: dbProduct.image_url || '/placeholder.svg',
  unit: dbProduct.unit,
  inStock: dbProduct.in_stock ?? true,
  featured: false // Could add this field to DB later
});

export const categories: CategoryInfo[] = [
  {
    id: 'lamb',
    name: 'Lamb & Mutton',
    description: 'Premium cuts of tender lamb and rich mutton, sourced from trusted farms',
    image: '/placeholder.svg',
    subCategories: ['Lamb Chops', 'Leg of Lamb', 'Lamb Shoulder', 'Ground Lamb', 'Lamb Ribs']
  },
  {
    id: 'poultry',
    name: 'Poultry',
    description: 'Fresh chicken, duck, turkey, and quail - farm-raised and hormone-free',
    image: '/placeholder.svg',
    subCategories: ['Chicken', 'Duck', 'Turkey', 'Quail']
  },
  {
    id: 'seafood',
    name: 'Seafood & Fish',
    description: 'Ocean-fresh seafood and fish, delivered to your doorstep daily',
    image: '/placeholder.svg',
    subCategories: ['Fish Fillets', 'Whole Fish', 'Shrimp', 'Crab', 'Lobster', 'Shellfish']
  }
];

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

export function useProductsByCategory(categoryId: string) {
  return useQuery({
    queryKey: ['products', 'category', categoryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('category', categoryId)
        .order('name');
      
      if (error) throw error;
      return data.map(mapDbProduct);
    },
    enabled: !!categoryId
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
        .limit(8)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data.map(p => ({ ...mapDbProduct(p), featured: true }));
    }
  });
}
