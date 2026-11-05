import { useServedCommunities } from '@/hooks/useCommunities';

export function CompactHero() {
  const { data: communities } = useServedCommunities();
  const count = communities?.length || 0;
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 py-6 md:py-10">
        <h1 className="font-heading text-2xl md:text-4xl font-bold leading-tight">
          Fresh meat &amp; fish, delivered to your apartment
        </h1>
        {count > 0 && (
          <p className="font-body text-sm md:text-base text-primary-foreground/80 mt-2">
            Serving {count} apartment communities in Bangalore
          </p>
        )}
      </div>
    </section>
  );
}
