import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Category } from '@/types/category';

export interface CategoryDisplay {
  id: string;
  slug: string;
  name: string;
  description: string;
  image: string;
  categoryType: 'fresh' | 'packaged' | 'gourmet';
  sortOrder: number;
}

const mapDbCategory = (dbCategory: Category): CategoryDisplay => ({
  id: dbCategory.id,
  slug: dbCategory.slug,
  name: dbCategory.name,
  description: dbCategory.description || '',
  image: dbCategory.image_url || '/placeholder.svg',
  categoryType: dbCategory.category_type,
  sortOrder: dbCategory.sort_order,
});

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      
      if (error) throw error;
      return (data as Category[]).map(mapDbCategory);
    }
  });
}

export function useCategory(slug: string) {
  return useQuery({
    queryKey: ['categories', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();
      
      if (error) throw error;
      return mapDbCategory(data as Category);
    },
    enabled: !!slug
  });
}
