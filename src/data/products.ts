import { Product, CategoryInfo } from '@/types/product';

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

export const products: Product[] = [
  // Lamb & Mutton
  {
    id: 'lamb-1',
    name: 'Premium Lamb Chops',
    description: 'Tender, succulent lamb chops perfect for grilling. Cut from the finest New Zealand lamb.',
    price: 24.99,
    category: 'lamb',
    subCategory: 'Lamb Chops',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true,
    featured: true
  },
  {
    id: 'lamb-2',
    name: 'Bone-In Leg of Lamb',
    description: 'Perfect centerpiece for Sunday roasts. Rich flavor and tender texture.',
    price: 18.99,
    category: 'lamb',
    subCategory: 'Leg of Lamb',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true
  },
  {
    id: 'lamb-3',
    name: 'Lamb Shoulder Roast',
    description: 'Ideal for slow cooking. Marbled for maximum flavor and tenderness.',
    price: 16.99,
    category: 'lamb',
    subCategory: 'Lamb Shoulder',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true
  },
  {
    id: 'lamb-4',
    name: 'Ground Lamb',
    description: 'Freshly ground lamb, perfect for burgers, kebabs, and Mediterranean dishes.',
    price: 12.99,
    category: 'lamb',
    subCategory: 'Ground Lamb',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true
  },
  {
    id: 'lamb-5',
    name: 'French-Cut Lamb Rack',
    description: 'Elegant and impressive. Perfect for special occasions.',
    price: 34.99,
    category: 'lamb',
    subCategory: 'Lamb Ribs',
    image: '/placeholder.svg',
    unit: 'per rack',
    inStock: true,
    featured: true
  },

  // Poultry
  {
    id: 'poultry-1',
    name: 'Whole Free-Range Chicken',
    description: 'Farm-raised, hormone-free chicken with superior flavor.',
    price: 8.99,
    category: 'poultry',
    subCategory: 'Chicken',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true,
    featured: true
  },
  {
    id: 'poultry-2',
    name: 'Chicken Breast Fillets',
    description: 'Boneless, skinless chicken breasts. Lean and versatile.',
    price: 9.99,
    category: 'poultry',
    subCategory: 'Chicken',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true
  },
  {
    id: 'poultry-3',
    name: 'Duck Breast',
    description: 'Rich, gamey flavor with crispy skin potential. Restaurant quality.',
    price: 19.99,
    category: 'poultry',
    subCategory: 'Duck',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true
  },
  {
    id: 'poultry-4',
    name: 'Whole Duck',
    description: 'Perfect for roasting. Succulent meat with rich flavor.',
    price: 14.99,
    category: 'poultry',
    subCategory: 'Duck',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true
  },
  {
    id: 'poultry-5',
    name: 'Turkey Breast',
    description: 'Lean, flavorful turkey breast. Great for sandwiches and roasting.',
    price: 11.99,
    category: 'poultry',
    subCategory: 'Turkey',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true
  },
  {
    id: 'poultry-6',
    name: 'Fresh Quail (4-pack)',
    description: 'Delicate, tender quail perfect for elegant dining.',
    price: 24.99,
    category: 'poultry',
    subCategory: 'Quail',
    image: '/placeholder.svg',
    unit: 'per pack',
    inStock: true
  },

  // Seafood & Fish
  {
    id: 'seafood-1',
    name: 'Atlantic Salmon Fillet',
    description: 'Wild-caught, omega-rich salmon with buttery texture.',
    price: 16.99,
    category: 'seafood',
    subCategory: 'Fish Fillets',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true,
    featured: true
  },
  {
    id: 'seafood-2',
    name: 'Jumbo Tiger Shrimp',
    description: 'Large, succulent shrimp perfect for grilling or sautéing.',
    price: 22.99,
    category: 'seafood',
    subCategory: 'Shrimp',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true,
    featured: true
  },
  {
    id: 'seafood-3',
    name: 'Fresh Sea Bass',
    description: 'Mild, sweet flavor with flaky white meat. A chef favorite.',
    price: 24.99,
    category: 'seafood',
    subCategory: 'Whole Fish',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true
  },
  {
    id: 'seafood-4',
    name: 'Cod Fillets',
    description: 'Mild, versatile white fish. Perfect for fish and chips.',
    price: 14.99,
    category: 'seafood',
    subCategory: 'Fish Fillets',
    image: '/placeholder.svg',
    unit: 'per lb',
    inStock: true
  },
  {
    id: 'seafood-5',
    name: 'Live Maine Lobster',
    description: 'Fresh, live lobster delivered to your door. The ultimate luxury.',
    price: 39.99,
    category: 'seafood',
    subCategory: 'Lobster',
    image: '/placeholder.svg',
    unit: 'each',
    inStock: true
  },
  {
    id: 'seafood-6',
    name: 'Dungeness Crab',
    description: 'Sweet, tender crab meat. Perfect for crab cakes or straight from the shell.',
    price: 29.99,
    category: 'seafood',
    subCategory: 'Crab',
    image: '/placeholder.svg',
    unit: 'each',
    inStock: true
  }
];

export const getFeaturedProducts = () => products.filter(p => p.featured);

export const getProductsByCategory = (category: string) => 
  products.filter(p => p.category === category);

export const getProductById = (id: string) => 
  products.find(p => p.id === id);
