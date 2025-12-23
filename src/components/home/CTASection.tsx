import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export function CTASection() {
  return (
    <section className="relative py-16 md:py-24 overflow-hidden">
      {/* Background */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `linear-gradient(135deg, hsl(0 70% 32% / 0.95) 0%, hsl(0 75% 25% / 0.98) 100%), url('/placeholder.svg')`
        }}
      />
      
      {/* Decorative Elements */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gold rounded-full blur-3xl" />
      </div>

      <div className="relative container mx-auto px-4 text-center">
        <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl font-bold text-primary-foreground mb-6">
          Ready to Experience 
          <span className="text-gold"> Premium Quality?</span>
        </h2>
        <p className="font-body text-lg text-primary-foreground/80 max-w-2xl mx-auto mb-8">
          Join thousands of satisfied customers who trust FreshCuts for their 
          daily meat needs. Sign up today and get 15% off your first order.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/auth">
            <Button variant="gold" size="xl" className="group">
              Create Account
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
          <Link to="/category/lamb">
            <Button variant="outline-light" size="xl">
              Start Shopping
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
