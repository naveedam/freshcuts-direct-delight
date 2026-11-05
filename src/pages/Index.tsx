import { Layout } from '@/components/layout/Layout';
import { CompactHero } from '@/components/home/CompactHero';
import { TodaysCatchStrip } from '@/components/TodaysCatchStrip';
import { ProductBrowser } from '@/components/home/ProductBrowser';
import { TrustRow } from '@/components/home/TrustRow';
import { CommunitiesServed } from '@/components/home/CommunitiesServed';

const Index = () => {
  return (
    <Layout>
      <CompactHero />
      <TodaysCatchStrip />
      <ProductBrowser />
      <TrustRow />
      <CommunitiesServed />
    </Layout>
  );
};

export default Index;
