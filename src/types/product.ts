// Category is now dynamic from database - using string type
export type Category = string;

export type PricingModel = 'weight_based' | 'unit_based';

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
  pricingModel?: PricingModel;
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
