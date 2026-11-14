import { useMemo, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories } from '@/hooks/useCategories';
import { useStorefrontProducts, type StorefrontProduct } from '@/hooks/useProducts';
import { availabilityOf, canAddToCart } from '@/lib/availability';
import { ProductCard } from '@/components/products/ProductCard';
import { groupBySize } from '@/lib/size-groups';

type Section = { id: string; title: string | null; list: StorefrontProduct[] };

function sortProducts(list: StorefrontProduct[]) {
  return [...list].sort((a, b) =>
    Number(canAddToCart(availabilityOf(b))) - Number(canAddToCart(availabilityOf(a))) || a.name.localeCompare(b.name));
}

export function ProductBrowser() {
  const { data: categories } = useCategories();
  const { data: products, isLoading } = useStorefrontProducts();
  // The category links are in the site header, so the home page always shows every fresh
  // category (or search results).
  const active: string = 'fresh';
  const [query, setQuery] = useState('');

  const cats = useMemo(() => categories || [], [categories]);
  const freshCats = useMemo(() => cats.filter((c) => c.categoryType === 'fresh'), [cats]);

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-xl" />)}
          </div>
        ) : sections.length === 0 ? (
          <p className="text-center text-muted-foreground py-10">
            {q ? `No items match "${query.trim()}".` : 'Nothing available in this category right now.'}
          </p>
        ) : (
          sections.map((s, si) => (
            <div key={s.id}>
              {s.title && (
                <h2 className="font-heading text-2xl font-bold text-foreground mb-4">{s.title}</h2>
              )}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                {groupBySize<StorefrontProduct>(s.list).map((g, gi) => (
                  <ProductCard
                    key={g.variants.map((v) => v.product.id).join('|')}
                    group={g}
                    eager={si === 0 && gi < 4}
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
