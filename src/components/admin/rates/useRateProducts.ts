import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabase-paginate';

export interface RateProduct {
  id: string;
  name: string;
  unit: string;
  categorySlug: string | null;
  categoryName: string;
  is_published: boolean;
  in_stock: boolean | null;
}

// Meat and fish have their own tabs; everything else is "Other Products".
export const RATE_TAB_SLUGS = ['poultry', 'lamb', 'seafood'];

// Active products with their category resolved: products.category may hold the category
// name or slug, and category_id may be empty, depending on how a product was added.
export function useRateProducts() {
  return useQuery({
    queryKey: ['rate-products'],
    queryFn: async () => {
      const { data: cats, error } = await supabase.from('categories').select('id, slug, name');
      if (error) throw error;
      const rows = await fetchAllRows<any>(() =>
        supabase.from('products')
          .select('id, name, unit, category, category_id, is_published, in_stock, is_active' as any)
          .order('name'));
      return rows
        .filter((p) => p.is_active !== false)
        .map((p): RateProduct => {
          const text = String(p.category || '').trim().toLowerCase();
          const c = (cats || []).find((x: any) => x.id === p.category_id)
            || (cats || []).find((x: any) => x.slug.toLowerCase() === text || x.name.toLowerCase() === text);
          return {
            id: p.id, name: p.name, unit: p.unit || 'kg',
            categorySlug: c?.slug ?? null, categoryName: c?.name ?? (p.category || 'Uncategorised'),
            is_published: !!p.is_published, in_stock: p.in_stock,
          };
        });
    },
    staleTime: 60 * 1000,
  });
}

export function useVendors() {
  return useQuery({
    queryKey: ['rate-vendors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('id, name, status').order('name');
      if (error) throw error;
      return (data || []) as { id: string; name: string; status: string | null }[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// So the order form's supplier dropdown offers this supplier for the product.
export async function ensureVendorMapped(vendorId: string, productId: string) {
  const { data: rows, error } = await supabase
    .from('vendor_products').select('vendor_id, is_preferred_vendor').eq('product_id', productId);
  if (error) throw error;
  if (rows?.some((r: any) => r.vendor_id === vendorId)) return;
  const { error: insError } = await supabase.from('vendor_products').insert({
    vendor_id: vendorId, product_id: productId, cost_price: 0,
    is_preferred_vendor: !rows?.some((r: any) => r.is_preferred_vendor),
  });
  if (insError) throw insError;
}
