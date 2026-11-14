import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { istDateString } from '@/lib/live-rate';
import { useSeafoodStorefront } from '@/lib/seafood-rate';
import { SeafoodPriceNote } from '@/components/products/SeafoodPriceNote';
import { Fish } from 'lucide-react';
import { Link } from 'react-router-dom';

export function TodaysCatchStrip() {
  const seafood = useSeafoodStorefront();
  const { data: catchItems } = useQuery({
    queryKey: ['todays-catch-home'],
    queryFn: async () => {
      const today = istDateString();
      const { data, error } = await supabase
        .from('todays_catch')
        .select('id, note, product_id, products(id, name, image_url, price, unit, awaiting_daily_price)')
        .eq('catch_date', today)
        .order('display_order');
      if (error) throw error;
      return data;
    },
  });

  const shown = (catchItems || []).filter((item: any) => item.products && !item.products.awaiting_daily_price);

  // The strip rolls by exactly one "lap" and starts over. A lap must be at least as wide as the
  // strip, or a gap shows at the end with only a few fish, so the cards are repeated as often
  // as needed. Speed is kept the same however many cards there are.
  const wrapRef = useRef<HTMLDivElement>(null);
  const setRef = useRef<HTMLDivElement>(null);
  const [repeat, setRepeat] = useState(1);
  const [lapPx, setLapPx] = useState(0);
  useEffect(() => {
    const wrap = wrapRef.current;
    const set = setRef.current;
    if (!wrap || !set) return;
    const measure = () => {
      const setWidth = set.offsetWidth; // one list of cards, gap included
      if (setWidth <= 0) return;
      setRepeat(Math.max(1, Math.ceil(wrap.offsetWidth / setWidth)));
      setLapPx(setWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(set);
    return () => ro.disconnect();
  }, [shown.length]);

  if (shown.length === 0) return null;
  const lap = Array.from({ length: repeat }, (_, r) => r);
  const seconds = Math.max(15, (lapPx * repeat) / 40); // about 40 pixels a second

  return (
    <div className="bg-blue-50 border-y border-blue-100 py-4">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-2 mb-3">
          <Fish className="h-5 w-5 text-blue-700" />
          <h2 className="font-heading text-xl font-semibold text-blue-950">Today's Catch</h2>
        </div>
        {/* Two copies side by side, moved left by one copy's width, so the roll never has a gap.
            The animation is defined here so it can't go missing with a stylesheet. */}
        <style>{`
          @keyframes fc-catch-roll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
          .fc-catch-track { animation: fc-catch-roll var(--catch-duration, 40s) linear infinite; will-change: transform; }
          .fc-catch-wrap:hover .fc-catch-track,
          .fc-catch-wrap:active .fc-catch-track,
          .fc-catch-wrap:focus-within .fc-catch-track { animation-play-state: paused; }
        `}</style>
        <div ref={wrapRef} className="fc-catch-wrap overflow-hidden pb-1">
          <div className="fc-catch-track flex w-max" style={{ ['--catch-duration' as any]: `${seconds}s` }}>
            {/* Two identical laps; the track moves left by one lap and starts over. */}
            {[0, 1].flatMap((half) => lap.map((r) => ({ copy: half * repeat + r }))).map(({ copy }) => (
              <div key={copy} ref={copy === 0 ? setRef : undefined} className="flex gap-3 pr-3" aria-hidden={copy > 0 || undefined}>
                {shown.map((item: any) => {
                  const product = item.products;
                  return (
                    <Link
                      key={`${copy}-${item.id}`}
                      to={`/product/${product.id}`}
                      tabIndex={copy > 0 ? -1 : undefined}
                      className="shrink-0 flex items-center gap-3 bg-white rounded-xl border border-blue-100 p-2 pr-5 shadow-sm hover:shadow-md transition-shadow w-[250px] md:w-[280px]"
                    >
                      <div className="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden bg-blue-50 flex items-center justify-center">
                        {product.image_url ? (
                          <img src={product.image_url} alt="" decoding="async" width={80} height={80} className="w-full h-full object-cover" />
                        ) : (
                          <Fish className="h-8 w-8 text-blue-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-heading text-base font-semibold text-blue-950 leading-snug line-clamp-2">{product.name}</p>
                        {item.note && (
                          <p className="font-body text-xs italic text-muted-foreground truncate">{item.note}</p>
                        )}
                        {seafood.visible ? (
                          <p className="mt-1 font-heading text-base font-bold text-primary">
                            ₹{product.price}
                            <span className="font-body text-xs font-normal text-muted-foreground"> / {product.unit}</span>
                          </p>
                        ) : (
                          <SeafoodPriceNote message={seafood.message} className="mt-1" />
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
