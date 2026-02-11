import { Link } from 'react-router-dom';
import { ArrowRight, Beef, Bird, Fish, Package, ChefHat, UtensilsCrossed, ShoppingBasket } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import { Skeleton } from '@/components/ui/skeleton';

export function CategorySection() {
  const { data: categories, isLoading } = useCategories();

  // Map category slugs to emojis/icons
  const getCategoryIcon = (slug: string, type: string) => {
    const iconMap: Record<string, string> = {
      lamb: '🐑',
      poultry: '🐔',
      seafood: '🦐',
      'gourmet-international': '🍽️',
      'packaged-ready-to-eat': '📦',
      'sauces-jams-condiments': '🍯',
      'pantry-essentials': '🛒',
    };
    
    return iconMap[slug] || (type === 'fresh' ? '🥩' : type === 'gourmet' ? '✨' : '📦');
  };

  if (isLoading) {
    return (
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const displayCategories = categories || [];

  return (
    <section id="categories" className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-12 md:mb-16">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-4">
            Our Premium Selection
          </h2>
          <p className="font-body text-muted-foreground max-w-2xl mx-auto">
            Explore our carefully curated categories of the finest meats, 
            sourced from trusted farms and delivered fresh to your door.
          </p>
        </div>

        {/* Category Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {displayCategories.map((category, index) => (
            <Link
              key={category.id}
              to={`/category/${category.slug}`}
              className="group relative overflow-hidden rounded-2xl bg-card border border-border shadow-card card-hover animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Background Pattern */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
              
              <div className="relative p-8 md:p-10">
                {/* Icon */}
                <div className="text-6xl mb-6">
                  {getCategoryIcon(category.slug, category.categoryType)}
                </div>

                {/* Content */}
                <h3 className="font-heading text-2xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
                  {category.name}
                </h3>
                <p className="font-body text-muted-foreground mb-6 leading-relaxed">
                  {category.description}
                </p>

                {/* Link */}
                <div className="flex items-center gap-2 text-primary font-body font-medium">
                  <span>Browse {category.name}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-2" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Show more categories link if there are more */}
        {categories && categories.length > displayCategories.length && (
          <div className="text-center mt-8">
            <p className="text-muted-foreground">
              Plus {categories.length - displayCategories.length} more categories coming soon!
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
