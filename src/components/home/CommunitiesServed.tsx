import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useServedCommunities } from '@/hooks/useCommunities';

const COLLAPSED = 18;

export function CommunitiesServed() {
  const { data: names } = useServedCommunities();
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const list = useMemo(() => names || [], [names]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? list.filter((n) => n.toLowerCase().includes(s)) : list;
  }, [list, q]);

  if (list.length === 0) return null;
  const visible = q.trim() || showAll ? filtered : filtered.slice(0, COLLAPSED);

  return (
    <section className="py-10 bg-cream-dark">
      <div className="container mx-auto px-4">
        <h2 className="font-heading text-2xl font-bold text-foreground">Communities we serve</h2>
        <p className="font-body text-sm text-muted-foreground mb-4">
          {list.length} apartment communities across Bangalore
        </p>
        <div className="relative max-w-md mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find your community" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          {visible.map((n) => (
            <span key={n} className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground">
              {n}
            </span>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No community matches that search.</p>
          )}
        </div>
        {!q.trim() && list.length > COLLAPSED && (
          <Button variant="ghost" className="mt-3" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show fewer' : `Show all ${list.length}`}
          </Button>
        )}
      </div>
    </section>
  );
}
