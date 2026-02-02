export type CategoryType = 'fresh' | 'packaged' | 'gourmet';

export interface Category {
  id: string;
  name: string;
  slug: string;
  category_type: CategoryType;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryForm {
  name: string;
  slug: string;
  category_type: CategoryType;
  description: string;
  image_url: string;
  is_active: boolean;
  sort_order: number;
}

export const defaultCategoryForm: CategoryForm = {
  name: '',
  slug: '',
  category_type: 'fresh',
  description: '',
  image_url: '',
  is_active: true,
  sort_order: 0,
};

export const categoryTypeLabels: Record<CategoryType, string> = {
  fresh: 'Fresh',
  packaged: 'Packaged',
  gourmet: 'Gourmet',
};
