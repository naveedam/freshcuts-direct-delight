import { useParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ProductCard } from '@/components/products/ProductCard';
import { categories, getProductsByCategory } from '@/data/products';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const CategoryPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const category = categories.find(c => c.id === categoryId);
  const products = getProductsByCategory(categoryId || '');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);

  const filteredProducts = selectedSubCategory
    ? products.filter(p => p.subCategory === selectedSubCategory)
    : products;

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
      {/* Hero Section */}
      <section className="bg-primary py-12 md:py-16">
        <div className="container mx-auto px-4">
          <h1 className="font-heading text-3xl md:text-4xl lg:text-5xl font-bold text-primary-foreground mb-4">
            {category.name}
          </h1>
          <p className="font-body text-lg text-primary-foreground/80 max-w-2xl">
            {category.description}
          </p>
        </div>
      </section>

      {/* Filters & Products */}
      <section className="py-8 md:py-12 bg-background">
        <div className="container mx-auto px-4">
          {/* Subcategory Filters */}
          {category.subCategories && category.subCategories.length > 0 && (
            <div className="mb-8 flex flex-wrap gap-2">
              <Button
                variant={selectedSubCategory === null ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedSubCategory(null)}
              >
                All
              </Button>
              {category.subCategories.map(sub => (
                <Button
                  key={sub}
                  variant={selectedSubCategory === sub ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedSubCategory(sub)}
                >
                  {sub}
                </Button>
              ))}
            </div>
          )}

          {/* Products Count */}
          <p className="font-body text-muted-foreground mb-6">
            Showing {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
          </p>

          {/* Products Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product, index) => (
              <div 
                key={product.id}
                className="animate-fade-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <ProductCard product={product} />
              </div>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <p className="font-body text-muted-foreground">
                No products found in this category.
              </p>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default CategoryPage;
