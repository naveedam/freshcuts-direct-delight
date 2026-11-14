import { useState } from 'react';
import { Product } from '@/types/product';
import { Button } from '@/components/ui/button';
import { useCart } from '@/context/CartContext';
import { ShoppingCart, Plus, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getPriceUnitLabel } from '@/lib/weight-utils';
import { availabilityOf, canAddToCart, AVAILABILITY_LABEL } from '@/lib/availability';
import { useSeafoodStorefront } from '@/lib/seafood-rate';
import { SeafoodPriceNote } from '@/components/products/SeafoodPriceNote';
import type { SizedItem } from '@/lib/size-groups';

interface ProductCardProps {
  /** A single product… */
  product?: Product;
  /** …or the sizes of one item ("Bangda - Small / Medium / Big"), shown as one card. */
  group?: SizedItem<Product>;
  /** Load the photo straight away (first row on the page). */
  eager?: boolean;
}

const hasImage = (p: Product) => !!p.image && p.image !== '/placeholder.svg';

// The one product card used on every storefront page. Items sold in sizes get size buttons;
// each size is its own product, so a customer can add, say, 1 kg Big and 500 g Small.
export function ProductCard({ product: single, group, eager = false }: ProductCardProps) {
  const { addToCart, items } = useCart();
  const variants = group?.variants ?? (single ? [{ size: null, product: single }] : []);
  const sized = variants.length > 1;
  const [pickedId, setPickedId] = useState<string | undefined>(
    () => (variants.find((v) => canAddToCart(availabilityOf(v.product))) || variants[0])?.product.id,
  );
  const seafood = useSeafoodStorefront();
  if (!variants.length) return null;

  const product = (variants.find((v) => v.product.id === pickedId) || variants[0]).product;
  const name = group?.base ?? product.name;
  const image = hasImage(product) ? product.image : variants.map((v) => v.product).find(hasImage)?.image;
  const availability = availabilityOf(product);
  const priceHidden = seafood.isHidden(product.category);
  const inCartIds = new Set(items.map((i) => i.product.id));
  const pickedInCart = inCartIds.has(product.id);
  const description = product.description || variants.map((v) => v.product.description).find(Boolean);

  return (
    <div className="group flex h-full flex-col bg-card rounded-xl border border-border shadow-card overflow-hidden card-hover">
      {/* Image Container */}
      <Link to={`/product/${product.id}`} className="block relative aspect-square overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={name}
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={eager ? 'high' : 'auto'}
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
              {sized ? `${variants.find((v) => v.product.id === product.id)?.size}: ` : ''}
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
            {availability === 'preorder' ? 'Reserve yours' : 'Add to basket'}
          </Button>
        </div>
      </Link>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Category Tag */}
        <span className="inline-block font-body text-xs text-muted-foreground uppercase tracking-wider mb-2">
          {product.subCategory || product.category}
        </span>

        {/* Name */}
        <Link to={`/product/${product.id}`}>
          <h3 className="font-heading text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors line-clamp-1">
            {name}
          </h3>
        </Link>

        {/* Sizes: each is its own product, so several can go into one order. */}
        {sized && (
          <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${name} size`}>
            {variants.map((v) => {
              const on = v.product.id === product.id;
              const orderable = canAddToCart(availabilityOf(v.product));
              const inCart = inCartIds.has(v.product.id);
              return (
                <button
                  key={v.product.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPickedId(v.product.id)}
                  title={inCart ? `${v.size} is in your basket` : undefined}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:border-primary'
                  } ${orderable ? '' : 'opacity-50 line-through'}`}
                >
                  {inCart && <Check className="h-3 w-3" />}
                  {v.size}
                </button>
              );
            })}
          </div>
        )}

        {/* Description */}
        <p className="font-body text-sm text-muted-foreground mb-4 line-clamp-2">
          {description}
        </p>

        {/* Price and Action */}
        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="min-w-0">
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
            {sized && pickedInCart && (
              <p className="font-body text-xs font-medium text-green-700 mt-1">In your basket</p>
            )}
          </div>

          <Button
            variant="default"
            size="icon"
            className="shrink-0"
            onClick={() => addToCart(product)}
            disabled={!canAddToCart(availability)}
            aria-label={`Add ${product.name} to cart`}
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
