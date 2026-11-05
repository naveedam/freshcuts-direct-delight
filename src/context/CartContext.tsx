import React, { createContext, useContext, useState, useCallback } from 'react';
import { Product, CartItem } from '@/types/product';
import { toast } from 'sonner';
import { calculatePrice } from '@/lib/weight-utils';
import { useSeafoodStorefront } from '@/lib/seafood-rate';

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  // Total of items whose price is shown right now (excludes seafood while its price is hidden).
  totalPrice: number;
  // Total including hidden seafood at its last known price: stored on the order as an estimate.
  provisionalTotalPrice: number;
  // True when some cart items are seafood whose price is confirmed the next morning.
  hasUnpricedItems: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const seafood = useSeafoodStorefront();

  const addToCart = useCallback((product: Product, quantity: number = 1) => {
    setItems(currentItems => {
      const existingItem = currentItems.find(item => item.product.id === product.id);
      
      if (existingItem) {
        toast.success(`Updated ${product.name} quantity in cart`);
        return currentItems.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      
      toast.success(`${product.name} added to cart`);
      return [...currentItems, { product, quantity }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setItems(currentItems => {
      const item = currentItems.find(i => i.product.id === productId);
      if (item) {
        toast.info(`${item.product.name} removed from cart`);
      }
      return currentItems.filter(item => item.product.id !== productId);
    });
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    
    setItems(currentItems =>
      currentItems.map(item =>
        item.product.id === productId
          ? { ...item, quantity }
          : item
      )
    );
  }, [removeFromCart]);

  const clearCart = useCallback(() => {
    setItems([]);
    toast.info('Cart cleared');
  }, []);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const lineTotal = (item: CartItem) => {
    const basePrice = calculatePrice(item.product.price, item.quantity, item.product.pricingModel || 'weight_based');
    const gstRate = item.product.gstRate || 0;
    const gstType = item.product.gstType || 'Exempt';
    const gst = (gstType === 'Taxable' && gstRate > 0) ? (basePrice * gstRate) / 100 : 0;
    return basePrice + gst;
  };
  const totalPrice = items.reduce(
    (sum, item) => sum + (seafood.isHidden(item.product.category) ? 0 : lineTotal(item)), 0,
  );
  const provisionalTotalPrice = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const hasUnpricedItems = items.some((item) => seafood.isHidden(item.product.category));

  return (
    <CartContext.Provider value={{
      items,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      totalItems,
      totalPrice,
      provisionalTotalPrice,
      hasUnpricedItems,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
