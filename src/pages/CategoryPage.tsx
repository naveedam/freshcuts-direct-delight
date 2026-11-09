import { useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { useProductsByCategory } from '@/hooks/useProducts';
import { useCategory } from '@/hooks/useCategories';
import { Skeleton } from '@/components/ui/skeleton';

const CategoryPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { data: category, isLoading: categoryLoading } = useCategory(categoryId || '');
  const { data: products, isLoading: productsLoading } = useProductsByCategory(categoryId || '');

  const isLoading = categoryLoading || productsLoading;

  if (categoryLoading) {
    return (
      <Layout>
        <section className="bg-primary py-4 md:py-6">
          <div className="container mx-auto px-4">
            <Skeleton className="h-9 w-64 bg-primary-foreground/20 mb-2" />
            <Skeleton className="h-5 w-96 bg-primary-foreground/20" />
          </div>
        </section>
      </Layout>
    );
  }

  if (!category) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <h1 className="font-heading text-4xl font-bold text-foreground mb-4">
            Category Not Found
          </h1>
          <p className="font-body text-muted-foreground">
            The category you're looking for doesn't exist.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Category bar: shorter than before and stays in place under the site header while the
          products scroll. */}
      <section className="sticky top-16 md:top-20 z-40 bg-primary py-4 md:py-6 shadow-sm">
        <div className="container mx-auto px-4">
          <h1 className="font-heading text-2xl md:text-4xl font-bold text-primary-foreground">
            {category.name}
          </h1>
          {category.description && (
            <p className="font-body text-sm md:text-base text-primary-foreground/80 max-w-2xl mt-1">
              {category.description}
            </p>
          )}
        </div>
      </section>

      {/* Products */}
      <section className="py-8 md:py-12 bg-background">
        <div className="container mx-auto px-4">
          {/* Products Count */}
          <p className="font-body text-muted-foreground mb-6">
            {productsLoading ? (
              <Skeleton className="h-4 w-32 inline-block" />
            ) : (
              `Showing ${products?.length || 0} product${products?.length !== 1 ? 's' : ''}`
            )}
          </p>

          {/* Products Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {productsLoading ? (
              [...Array(8)].map((_, i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-4">
                  <Skeleton className="aspect-square rounded-lg mb-4" />
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))
            ) : products && products.length > 0 ? (
              products.map((product, index) => (
                <div 
                  key={product.id}
                  className="animate-fade-in"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <ProductCard product={product} />
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-12">
                <p className="font-body text-muted-foreground">
                  No products found in this category.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
};

export default CategoryPage;
