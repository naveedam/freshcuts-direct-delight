import { Product } from '@/types/product';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { ShoppingCart, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getPriceUnitLabel } from '@/lib/weight-utils';
import { availabilityOf, canAddToCart, AVAILABILITY_LABEL } from '@/lib/availability';
import { useSeafoodStorefront } from '@/lib/seafood-rate';
import { SeafoodPriceNote } from '@/components/products/SeafoodPriceNote';
interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addToCart } = useCart();
  const availability = availabilityOf(product);
  const seafood = useSeafoodStorefront();
  const priceHidden = seafood.isHidden(product.category);

  return (
    <div className="group bg-card rounded-xl border border-border shadow-card overflow-hidden card-hover">
      {/* Image Container */}
      <Link to={`/product/${product.id}`} className="block relative aspect-square overflow-hidden bg-muted">
        {product.image ? (
          <img 
            src={product.image} 
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-6xl">
            {product.category === 'lamb' && '🥩'}
            {product.category === 'poultry' && '🍗'}
            {product.category === 'seafood' && '🐟'}
          </div>
        )}
        
        {/* Featured Badge */}
        {product.featured && (
          <span className="absolute top-3 left-3 bg-gold text-accent-foreground text-xs font-semibold px-3 py-1 rounded-full font-body">
            Featured
          </span>
        )}

        {/* Out of stock / not orderable label (pre-order items stay clear, with a tag) */}
        {(availability === 'out' || availability === 'unavailable') && (
          <div className="absolute inset-0 bg-foreground/50 flex items-center justify-center">
            <span className="bg-card text-foreground font-body font-semibold px-4 py-2 rounded-lg">
              {AVAILABILITY_LABEL[availability]}
            </span>
          </div>
        )}
        {availability === 'preorder' && (
          <span className="absolute top-3 right-3 rounded-full bg-gold px-2 py-0.5 text-xs font-semibold text-foreground">
            Pre-order
          </span>
        )}

        {/* Quick Add Button - Shows on Hover */}
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-foreground/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-300">
          <Button 
            variant="gold" 
            size="sm" 
            className="w-full"
            onClick={(e) => {
              e.preventDefault();
              addToCart(product);
            }}
            disabled={!canAddToCart(availability)}
          >
            <Plus className="h-4 w-4" />
            {availability === 'preorder' ? 'Pre-order' : 'Quick Add'}
          </Button>
        </div>
      </Link>

      {/* Content */}
      <div className="p-4">
        {/* Category Tag */}
        <span className="inline-block font-body text-xs text-muted-foreground uppercase tracking-wider mb-2">
          {product.subCategory || product.category}
        </span>

        {/* Name */}
        <Link to={`/product/${product.id}`}>
          <h3 className="font-heading text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-1">
            {product.name}
          </h3>
        </Link>

        {/* Description */}
        <p className="font-body text-sm text-muted-foreground mb-4 line-clamp-2">
          {product.description}
        </p>

        {/* Price and Action */}
        <div className="flex items-center justify-between">
          <div>
            {priceHidden ? (
              <SeafoodPriceNote message={seafood.message} className="text-sm" />
            ) : (
              <>
                <span className="font-heading text-xl font-bold text-primary">
                  ₹{product.price.toFixed(0)}
                </span>
                <span className="font-body text-sm text-muted-foreground ml-1">
                  {getPriceUnitLabel(product.pricingModel || 'weight_based')}
                </span>
              </>
            )}
            {(product.pricingModel || 'weight_based') === 'weight_based' && (
              <p className="font-body text-xs text-muted-foreground mt-1">
                Order in 500g steps
              </p>
            )}
          </div>
          
          <Button 
            variant="default" 
            size="icon"
            onClick={() => addToCart(product)}
            disabled={!canAddToCart(availability)}
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
