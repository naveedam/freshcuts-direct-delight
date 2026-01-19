import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from 'lucide-react';
import { formatWeight, getPriceUnitLabel } from '@/lib/weight-utils';

const CartPage = () => {
  const { items, updateQuantity, removeFromCart, totalPrice, clearCart } = useCart();
  const shippingThreshold = 2000;
  const remainingForFreeShipping = Math.max(0, shippingThreshold - totalPrice);
  const hasFreeShipping = totalPrice >= shippingThreshold;
  const shippingCost = hasFreeShipping ? 0 : 99;
  const orderTotal = totalPrice + shippingCost;

  if (items.length === 0) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag className="h-10 w-10 text-muted-foreground" />
            </div>
            <h1 className="font-heading text-3xl font-bold text-foreground mb-4">
              Your Cart is Empty
            </h1>
            <p className="font-body text-muted-foreground mb-8">
              Looks like you haven't added any products yet. Start exploring our premium selection!
            </p>
            <Link to="/">
              <Button variant="hero" size="lg">
                Start Shopping
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }


  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12">
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-8">
          Shopping Cart
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {/* Free Shipping Progress */}
            {!hasFreeShipping && (
              <div className="bg-gold/10 border border-gold/30 rounded-lg p-4 mb-6">
                <p className="font-body text-sm text-foreground">
                  Add <span className="font-semibold text-primary">₹{remainingForFreeShipping.toFixed(0)}</span> more for free shipping!
                </p>
                <div className="mt-2 bg-muted rounded-full h-2 overflow-hidden">
                  <div 
                    className="h-full bg-gold transition-all duration-300"
                    style={{ width: `${Math.min(100, (totalPrice / shippingThreshold) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Items */}
            {items.map(({ product, quantity }) => (
              <div 
                key={product.id}
                className="flex gap-4 p-4 bg-card rounded-xl border border-border"
              >
                {/* Image */}
                <div className="w-24 h-24 rounded-lg bg-muted overflow-hidden shrink-0">
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">
                      {product.category === 'lamb' && '🥩'}
                      {product.category === 'poultry' && '🍗'}
                      {product.category === 'seafood' && '🐟'}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <Link to={`/product/${product.id}`}>
                    <h3 className="font-heading text-lg font-semibold text-foreground hover:text-primary transition-colors line-clamp-1">
                      {product.name}
                    </h3>
                  </Link>
                  <p className="font-body text-sm text-muted-foreground capitalize">
                    {product.subCategory || product.category}
                  </p>
                  <p className="font-heading text-lg font-bold text-primary mt-2">
                    ₹{product.price.toFixed(0)} <span className="font-body text-sm text-muted-foreground font-normal">{getPriceUnitLabel()}</span>
                  </p>
                </div>

                {/* Quantity & Actions */}
                <div className="flex flex-col items-end justify-between">
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeFromCart(product.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  <div className="flex items-center border border-border rounded-lg">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(product.id, quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="font-body font-medium w-12 text-center text-sm">{formatWeight(quantity)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(product.id, quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {/* Clear Cart */}
            <div className="pt-4">
              <Button 
                variant="ghost" 
                className="text-muted-foreground hover:text-destructive"
                onClick={clearCart}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Cart
              </Button>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl border border-border p-6 sticky top-24">
              <h2 className="font-heading text-xl font-bold text-foreground mb-6">
                Order Summary
              </h2>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between font-body">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">₹{totalPrice.toFixed(0)}</span>
                </div>
                <div className="flex justify-between font-body">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className={`font-medium ${hasFreeShipping ? 'text-green-600' : 'text-foreground'}`}>
                    {hasFreeShipping ? 'FREE' : `₹${shippingCost}`}
                  </span>
                </div>
                <div className="border-t border-border pt-4 flex justify-between">
                  <span className="font-heading font-bold text-foreground">Total</span>
                  <span className="font-heading text-xl font-bold text-primary">₹{orderTotal.toFixed(0)}</span>
                </div>
              </div>

              <Link to="/checkout">
                <Button variant="hero" size="lg" className="w-full mb-4">
                  Proceed to Checkout
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>

              <Link to="/">
                <Button variant="outline" className="w-full">
                  Continue Shopping
                </Button>
              </Link>

              <p className="font-body text-xs text-muted-foreground text-center mt-4">
                Secure checkout powered by industry-standard encryption
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CartPage;
