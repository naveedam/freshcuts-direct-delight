import { Leaf, Snowflake, Shield, Truck } from 'lucide-react';

const features = [
  {
    icon: Leaf,
    title: 'Farm Fresh',
    description: 'Sourced directly from trusted local farms with the highest standards of animal welfare.'
  },
  {
    icon: Snowflake,
    title: 'Cold Chain Delivery',
    description: 'Temperature-controlled packaging ensures your meat arrives perfectly fresh every time.'
  },
  {
    icon: Shield,
    title: 'Quality Guaranteed',
    description: 'Not satisfied? We offer a 100% money-back guarantee on all our products.'
  },
  {
    icon: Truck,
    title: 'Same Day Delivery',
    description: 'Order before 2pm and receive your fresh cuts the same day, right to your door.'
  }
];

export function WhyChooseUs() {
  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <div className="text-center mb-12 md:mb-16">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-4">
            Why Choose FreshCuts
          </h2>
          <p className="font-body text-muted-foreground max-w-2xl mx-auto">
            We're committed to delivering not just meat, but an experience of 
            quality, freshness, and convenience you won't find anywhere else.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <div 
              key={feature.title}
              className="text-center p-6 animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
                <feature.icon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-heading text-xl font-semibold text-foreground mb-3">
                {feature.title}
              </h3>
              <p className="font-body text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
