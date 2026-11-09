import { useEffect, useRef } from 'react';

// Home page title bar: same height and behaviour as the category bars. It stays in place under
// the site menu while the page scrolls, and tells the search bar below how tall it is so the
// search bar can stay in place just under it.
export function CompactHero() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--home-hero-h', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty('--home-hero-h'); };
  }, []);

  return (
    <section ref={ref} className="sticky top-16 md:top-20 z-40 bg-primary text-primary-foreground py-4 md:py-6 shadow-sm">
      <div className="container mx-auto px-4">
        <h1 className="font-heading text-2xl md:text-4xl font-bold leading-tight">
          Fresh meat &amp; fish, delivered to your doorstep
        </h1>
        <p className="font-body text-sm md:text-base text-primary-foreground/80 max-w-2xl mt-1">
          The finest cuts and freshest catches, delivered to you
        </p>
      </div>
    </section>
  );
}
