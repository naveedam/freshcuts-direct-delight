import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories } from '@/hooks/useCategories';
import { useStorefrontProducts, type StorefrontProduct } from '@/hooks/useProducts';
import { useCart } from '@/context/CartContext';
import { getPriceUnitLabel } from '@/lib/weight-utils';

const EMOJI: Record<string, string> = { lamb: '🐑', poultry: '🐔', seafood: '🦐' };

type Section = { id: string; title: string | null; list: StorefrontProduct[] };

function sortProducts(list: StorefrontProduct[]) {
  return [...list].sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.name.localeCompare(b.name));
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-foreground border-border hover:border-primary'
      }`}
    >
      {children}
    </button>
  );
}

function ProductRow({
  product, emoji, inCart, onAdd,
}: { product: StorefrontProduct; emoji: string; inCart: boolean; onAdd: () => void }) {
  const hasImage = !!product.image && product.image !== '/placeholder.svg';
  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3">
      <Link
        to={`/product/${product.id}`}
        className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-muted flex items-center justify-center text-2xl"
      >
        {hasImage ? (
          <img src={product.image} alt={product.name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span>{emoji}</span>
        )}
      </Link>
      <Link to={`/product/${product.id}`} className="min-w-0 flex-1">
        <p className="font-heading text-base font-semibold text-foreground leading-snug line-clamp-2">
          {product.name}
        </p>
        <p className="font-body text-sm text-muted-foreground">
          <span className="font-semibold text-primary">₹{product.price.toFixed(0)}</span>{' '}
          {getPriceUnitLabel(product.pricingModel || 'weight_based')}
        </p>
        {inCart && <p className="text-xs font-medium text-green-600">In cart</p>}
      </Link>
      {product.inStock ? (
        <Button size="sm" onClick={onAdd} className="shrink-0 gap-1">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      ) : (
        <span className="shrink-0 text-xs font-medium text-muted-foreground">Out of stock</span>
      )}
    </div>
  );
}

export function ProductBrowser() {
  const { data: categories } = useCategories();
  const { data: products, isLoading } = useStorefrontProducts();
  const { addToCart, items } = useCart();
  const [active, setActive] = useState('fresh');
  const [query, setQuery] = useState('');

  const cats = useMemo(() => categories || [], [categories]);
  const freshCats = useMemo(() => cats.filter((c) => c.categoryType === 'fresh'), [cats]);
  const otherCats = useMemo(() => cats.filter((c) => c.categoryType !== 'fresh'), [cats]);
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
      <div className="sticky top-16 md:top-20 z-40 bg-background/95 backdrop-blur border-b border-border">
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
          {!q && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Chip active={active === 'fresh'} onClick={() => setActive('fresh')}>All fresh</Chip>
              {freshCats.map((c) => (
                <Chip key={c.id} active={active === c.id} onClick={() => setActive(c.id)}>{c.name}</Chip>
              ))}
              {otherCats.map((c) => (
                <Chip key={c.id} active={active === c.id} onClick={() => setActive(c.id)}>{c.name}</Chip>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : sections.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">
            {q ? `No items match "${query.trim()}".` : 'Nothing available in this category right now.'}
          </p>
        ) : (
          sections.map((s) => (
            <div key={s.id}>
              {s.title && (
                <h2 className="font-heading text-xl font-bold text-foreground mb-3">{s.title}</h2>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
