import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Truck, Award, Clock } from 'lucide-react';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Background with gradient overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(135deg, hsl(0 70% 32% / 0.92) 0%, hsl(0 75% 20% / 0.95) 100%), url('/placeholder.svg')`
        }}
      />
      
      {/* Decorative elements */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 right-20 w-64 h-64 bg-gold rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-48 h-48 bg-gold rounded-full blur-2xl" />
      </div>

      <div className="relative container mx-auto px-4 py-20 md:py-32 lg:py-40">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-gold/20 backdrop-blur-sm rounded-full px-4 py-2 mb-6 animate-fade-in">
            <Award className="h-4 w-4 text-gold" />
            <span className="font-body text-sm font-medium text-gold">Premium Quality Guaranteed</span>
          </div>

          {/* Heading */}
          <h1 
            className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-primary-foreground leading-tight mb-6 animate-fade-in"
            style={{ animationDelay: '100ms' }}
          >
            Fresh Premium Meats,
            <br />
            <span className="text-gold">Delivered Daily</span>
          </h1>

          {/* Description */}
          <p 
            className="font-body text-lg md:text-xl text-primary-foreground/80 mb-8 max-w-xl leading-relaxed animate-fade-in"
            style={{ animationDelay: '200ms' }}
          >
            From farm to table, we deliver the finest cuts of lamb, poultry, and seafood 
            right to your doorstep. Experience the difference of truly fresh meat.
          </p>

          {/* CTA Buttons */}
          <div 
            className="flex flex-col sm:flex-row gap-4 mb-12 animate-fade-in"
            style={{ animationDelay: '300ms' }}
          >
            <Link to="/category/lamb">
              <Button variant="gold" size="xl" className="group">
                Shop Now
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link to="#categories">
              <Button variant="outline-light" size="xl">
                View Categories
              </Button>
            </Link>
          </div>

          {/* Trust badges */}
          <div 
            className="flex flex-wrap gap-6 md:gap-8 animate-fade-in"
            style={{ animationDelay: '400ms' }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-foreground/10 rounded-lg">
                <Truck className="h-5 w-5 text-gold" />
              </div>
              <div>
                <p className="font-body text-sm font-semibold text-primary-foreground">Free Delivery</p>
                <p className="font-body text-xs text-primary-foreground/60">On orders over $75</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-foreground/10 rounded-lg">
                <Clock className="h-5 w-5 text-gold" />
              </div>
              <div>
                <p className="font-body text-sm font-semibold text-primary-foreground">Same Day Delivery</p>
                <p className="font-body text-xs text-primary-foreground/60">Order before 2pm</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-foreground/10 rounded-lg">
                <Award className="h-5 w-5 text-gold" />
              </div>
              <div>
                <p className="font-body text-sm font-semibold text-primary-foreground">100% Fresh</p>
                <p className="font-body text-xs text-primary-foreground/60">Quality guaranteed</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
