import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Search, ShoppingCart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories } from '@/hooks/useCategories';
import { useStorefrontProducts, type StorefrontProduct } from '@/hooks/useProducts';
import { useCart } from '@/context/CartContext';
import { getPriceUnitLabel } from '@/lib/weight-utils';
import { availabilityOf, canAddToCart, AVAILABILITY_LABEL } from '@/lib/availability';
import { useSeafoodStorefront } from '@/lib/seafood-rate';
import { SeafoodPriceNote } from '@/components/products/SeafoodPriceNote';

const EMOJI: Record<string, string> = { lamb: '🐑', poultry: '🐔', seafood: '🦐' };

type Section = { id: string; title: string | null; list: StorefrontProduct[] };

function sortProducts(list: StorefrontProduct[]) {
  return [...list].sort((a, b) =>
    Number(canAddToCart(availabilityOf(b))) - Number(canAddToCart(availabilityOf(a))) || a.name.localeCompare(b.name));
}

function ProductRow({
  product, emoji, inCart, onAdd,
}: { product: StorefrontProduct; emoji: string; inCart: boolean; onAdd: () => void }) {
  const hasImage = !!product.image && product.image !== '/placeholder.svg';
  const seafood = useSeafoodStorefront();
  const availability = availabilityOf(product);
  return (
    <div className="group flex flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <Link
        to={`/product/${product.id}`}
        className="relative block aspect-[4/3] overflow-hidden bg-muted flex items-center justify-center text-5xl"
      >
        {hasImage ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span>{emoji}</span>
        )}
        {inCart && (
          <span className="absolute top-2 left-2 rounded-full bg-green-600/90 px-2.5 py-0.5 text-[11px] font-medium text-white">
            In your basket
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-3 md:p-4">
        <Link to={`/product/${product.id}`} className="flex-1">
          <p className="font-heading text-base md:text-lg font-semibold text-foreground leading-snug line-clamp-2">
            {product.name}
          </p>
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            {seafood.isHidden(product.category) ? (
              <SeafoodPriceNote message={seafood.message} />
            ) : (
              <p className="font-body text-sm text-muted-foreground">
                <span className="font-heading text-lg font-bold text-primary">₹{product.price.toFixed(0)}</span>{' '}
                {getPriceUnitLabel(product.pricingModel || 'weight_based')}
              </p>
            )}
            {!canAddToCart(availability) && (
              <span className="block text-xs font-medium text-muted-foreground">{AVAILABILITY_LABEL[availability]}</span>
            )}
          </div>
          <Button
            size="icon"
            onClick={onAdd}
            disabled={!canAddToCart(availability)}
            aria-label={availability === 'preorder' ? 'Pre-order' : 'Add to cart'}
            className="shrink-0"
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProductBrowser() {
  const { data: categories } = useCategories();
  const { data: products, isLoading } = useStorefrontProducts();
  const { addToCart, items } = useCart();
  // The category links are in the site header, so the home page always shows every fresh
  // category (or search results).
  const active: string = 'fresh';
  const [query, setQuery] = useState('');

  const cats = useMemo(() => categories || [], [categories]);
  const freshCats = useMemo(() => cats.filter((c) => c.categoryType === 'fresh'), [cats]);
  const inCartIds = useMemo(() => new Set(items.map((i) => i.product.id)), [items]);
  const slugById = useMemo(() => new Map(cats.map((c) => [c.id, c.slug] as const)), [cats]);

  const byCategory = useMemo(() => {
    const m = new Map<string, StorefrontProduct[]>();
    (products || []).forEach((p) => {
      if (!p.categoryId) return;
      const list = m.get(p.categoryId) || [];
      list.push(p);
      m.set(p.categoryId, list);
    });
    m.forEach((list, id) => m.set(id, sortProducts(list)));
    return m;
  }, [products]);

  const q = query.trim().toLowerCase();

  const sections = useMemo<Section[]>(() => {
    if (q) {
      const results = sortProducts((products || []).filter((p) => p.name.toLowerCase().includes(q)));
      return results.length
        ? [{ id: 'search', title: `Results for "${query.trim()}" (${results.length})`, list: results }]
        : [];
    }
    if (active === 'fresh') {
      return freshCats
        .map((c) => ({ id: c.id, title: c.name as string | null, list: byCategory.get(c.id) || [] }))
        .filter((s) => s.list.length > 0);
    }
    const c = cats.find((x) => x.id === active);
    return c ? [{ id: c.id, title: null, list: byCategory.get(c.id) || [] }] : [];
  }, [q, query, active, products, cats, freshCats, byCategory]);

  return (
    <section id="menu" className="bg-background">
      {/* Search stays in place just under the home title bar (its height comes from CompactHero). */}
      <div className="home-search-sticky sticky z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 py-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chicken, mutton, prawns..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-8">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
          </div>
        ) : sections.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">
            {q ? `No items match "${query.trim()}".` : 'Nothing available in this category right now.'}
          </p>
        ) : (
          sections.map((s) => (
            <div key={s.id}>
              {s.title && (
                <h2 className="font-heading text-2xl font-bold text-foreground mb-4">{s.title}</h2>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
                {s.list.map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    emoji={EMOJI[slugById.get(p.categoryId || '') || ''] || '🍽️'}
                    inCart={inCartIds.has(p.id)}
                    onAdd={() => addToCart(p)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
