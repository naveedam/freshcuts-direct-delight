export type Category = 'lamb' | 'poultry' | 'seafood';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Category;
  subCategory?: string;
  image: string;
  unit: string;
  inStock: boolean;
  featured?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface CategoryInfo {
  id: Category;
  name: string;
  description: string;
  image: string;
  subCategories?: string[];
}
