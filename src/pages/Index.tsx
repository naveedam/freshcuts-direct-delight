import { Layout } from '@/components/layout/Layout';
import { TodaysCatchStrip } from '@/components/TodaysCatchStrip';
import { HeroSection } from '@/components/home/HeroSection';
import { CategorySection } from '@/components/home/CategorySection';
import { FeaturedProducts } from '@/components/home/FeaturedProducts';
import { WhyChooseUs } from '@/components/home/WhyChooseUs';
import { GoogleReviews } from '@/components/home/GoogleReviews';
import { CTASection } from '@/components/home/CTASection';

const Index = () => {
  return (
    <Layout>
      <HeroSection />
      <TodaysCatchStrip />
      <CategorySection />
      <FeaturedProducts />
      <WhyChooseUs />
      <GoogleReviews />
      <CTASection />
    </Layout>
  );
};

export default Index;
