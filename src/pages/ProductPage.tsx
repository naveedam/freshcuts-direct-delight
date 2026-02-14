import { useParams, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { useProduct, useProductsByCategory } from '@/hooks/useProducts';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { ShoppingCart, Minus, Plus, ArrowLeft, Truck, Shield, Clock } from 'lucide-react';
import { useState } from 'react';
import { ProductCard } from '@/components/products/ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { formatWeight, formatQuantityDisplay, getPriceUnitLabel, calculatePrice, isWeightBased } from '@/lib/weight-utils';

const ProductPage = () => {
  const { productId } = useParams<{ productId: string }>();
  const { data: product, isLoading } = useProduct(productId || '');
  const { data: relatedProductsData } = useProductsByCategory(product?.category || '');
  const [quantity, setQuantity] = useState(1);
  const { addToCart } = useCart();

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 md:py-12">
          <Skeleton className="h-4 w-48 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
            <Skeleton className="aspect-square rounded-2xl" />
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="font-heading text-4xl font-bold text-foreground mb-4">
            Product Not Found
          </h1>
          <p className="font-body text-muted-foreground mb-6">
            The product you're looking for doesn't exist.
          </p>
          <Link to="/">
            <Button variant="default">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Home
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const relatedProducts = relatedProductsData
    ?.filter(p => p.id !== product.id)
    .slice(0, 4) || [];

  const handleAddToCart = () => {
    addToCart(product, quantity);
    setQuantity(1);
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 mb-8 font-body text-sm text-muted-foreground">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <span>/</span>
          <Link to={`/category/${product.category}`} className="hover:text-primary transition-colors capitalize">
            {product.category}
          </Link>
          <span>/</span>
          <span className="text-foreground">{product.name}</span>
        </nav>

        {/* Product Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 mb-16">
          {/* Image */}
          <div className="aspect-square rounded-2xl bg-muted overflow-hidden">
            {product.image ? (
              <img 
                src={product.image} 
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-9xl">
                {product.category === 'lamb' && '🥩'}
                {product.category === 'poultry' && '🍗'}
                {product.category === 'seafood' && '🐟'}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col justify-center">
            {/* Category & Featured Badge */}
            <div className="flex items-center gap-3 mb-4">
              <span className="font-body text-sm text-muted-foreground uppercase tracking-wider">
                {product.subCategory || product.category}
              </span>
              {product.featured && (
                <span className="bg-gold text-accent-foreground text-xs font-semibold px-3 py-1 rounded-full font-body">
                  Featured
                </span>
              )}
            </div>

            {/* Name */}
            <h1 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-4">
              {product.name}
            </h1>

            {/* Price */}
            <div className="flex items-baseline gap-2 mb-6">
              <span className="font-heading text-3xl font-bold text-primary">
                ₹{product.price.toFixed(0)}
              </span>
              <span className="font-body text-muted-foreground">
                {getPriceUnitLabel(product.pricingModel || 'weight_based')}
              </span>
            </div>

            {/* Description */}
            <p className="font-body text-muted-foreground text-lg leading-relaxed mb-8">
              {product.description}
            </p>

            {/* Stock Status */}
            <div className="mb-6">
              {product.inStock ? (
                <span className="inline-flex items-center gap-2 font-body text-sm text-green-600">
                  <span className="w-2 h-2 bg-green-600 rounded-full" />
                  In Stock
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 font-body text-sm text-destructive">
                  <span className="w-2 h-2 bg-destructive rounded-full" />
                  Out of Stock
                </span>
              )}
            </div>

            {/* Quantity Selector */}
            <div className="flex items-center gap-4 mb-6">
              <span className="font-body font-medium text-foreground">
                {isWeightBased(product.pricingModel || 'weight_based') ? 'Weight:' : 'Quantity:'}
              </span>
              <div className="flex items-center border border-border rounded-lg">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="font-body font-medium w-16 text-center">
                  {formatQuantityDisplay(quantity, product.pricingModel || 'weight_based')}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {isWeightBased(product.pricingModel || 'weight_based') && (
                <span className="font-body text-sm text-muted-foreground">
                  (multiples of 500g)
                </span>
              )}
            </div>

            {/* Add to Cart */}
            <Button 
              variant="hero" 
              size="xl" 
              className="w-full md:w-auto mb-8"
              onClick={handleAddToCart}
              disabled={!product.inStock}
            >
              <ShoppingCart className="h-5 w-5" />
              Add to Cart - ₹{calculatePrice(product.price, quantity, product.pricingModel || 'weight_based').toFixed(0)}
            </Button>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-border">
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5 text-primary" />
                <span className="font-body text-sm text-muted-foreground">Free delivery over ₹2000</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary" />
                <span className="font-body text-sm text-muted-foreground">Same day delivery</span>
              </div>
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <span className="font-body text-sm text-muted-foreground">Quality guaranteed</span>
              </div>
            </div>
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <section>
            <h2 className="font-heading text-2xl font-bold text-foreground mb-8">
              You Might Also Like
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProducts.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
};

export default ProductPage;
