import { Product } from '@/types/product';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { ShoppingCart, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getPriceUnitLabel } from '@/lib/weight-utils';
interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addToCart } = useCart();

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

        {/* Out of Stock Overlay */}
        {!product.inStock && (
          <div className="absolute inset-0 bg-foreground/50 flex items-center justify-center">
            <span className="bg-card text-foreground font-body font-semibold px-4 py-2 rounded-lg">
              Out of Stock
            </span>
          </div>
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
            disabled={!product.inStock}
          >
            <Plus className="h-4 w-4" />
            Quick Add
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
            <span className="font-heading text-xl font-bold text-primary">
              ₹{product.price.toFixed(0)}
            </span>
            <span className="font-body text-sm text-muted-foreground ml-1">
              {getPriceUnitLabel()}
            </span>
            <p className="font-body text-xs text-muted-foreground mt-1">
              Order in 500g steps
            </p>
          </div>
          
          <Button 
            variant="default" 
            size="icon"
            onClick={() => addToCart(product)}
            disabled={!product.inStock}
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
