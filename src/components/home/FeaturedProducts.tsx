import type { Product } from '@/types/product';
import { useFeaturedProducts } from '@/hooks/useProducts';
import { ProductCard } from '@/components/products/ProductCard';
import { groupBySize } from '@/lib/size-groups';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export function FeaturedProducts() {
  const { data: featuredProducts, isLoading } = useFeaturedProducts();

  return (
    <section className="py-16 md:py-24 bg-cream-dark">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-12">
          <div>
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">
              Featured Cuts
            </h2>
            <p className="font-body text-muted-foreground">
              Our most popular selections, handpicked for quality
            </p>
          </div>
          <Link to="/category/lamb">
            <Button variant="outline" className="group">
              View All Products
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {isLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4">
                <Skeleton className="aspect-square rounded-lg mb-4" />
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))
          ) : featuredProducts && featuredProducts.length > 0 ? (
            groupBySize<Product>(featuredProducts).map((g, index) => (
              <div 
                key={g.variants.map((v) => v.product.id).join('|')} 
                className="animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <ProductCard group={g} />
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-muted-foreground">No featured products available</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
