import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { categories } from '@/data/products';

export function CategorySection() {
  const categoryImages: Record<string, string> = {
    lamb: '🐑',
    poultry: '🐔',
    seafood: '🦐'
  };

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
          {categories.map((category, index) => (
            <Link
              key={category.id}
              to={`/category/${category.id}`}
              className="group relative overflow-hidden rounded-2xl bg-card border border-border shadow-card card-hover animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Background Pattern */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
              
              <div className="relative p-8 md:p-10">
                {/* Icon */}
                <div className="text-6xl mb-6">
                  {categoryImages[category.id]}
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

                {/* Subcategories */}
                {category.subCategories && (
                  <div className="mt-6 pt-6 border-t border-border">
                    <div className="flex flex-wrap gap-2">
                      {category.subCategories.slice(0, 4).map(sub => (
                        <span 
                          key={sub}
                          className="font-body text-xs bg-secondary text-secondary-foreground px-3 py-1 rounded-full"
                        >
                          {sub}
                        </span>
                      ))}
                      {category.subCategories.length > 4 && (
                        <span className="font-body text-xs text-muted-foreground px-2 py-1">
                          +{category.subCategories.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
