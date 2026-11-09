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
  if (shown.length === 0) return null;

  return (
    <div className="bg-blue-50 border-y border-blue-100 py-4">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-2 mb-3">
          <Fish className="h-5 w-5 text-blue-700" />
          <h2 className="font-semibold text-blue-900">Today's Catch</h2>
          <span className="text-xs text-blue-600">Fresh in this morning</span>
        </div>
        {/* Two copies side by side, moved left by one copy's width, so the roll never has a gap. */}
        <div className="catch-roll-wrap overflow-hidden pb-1">
          <div className="catch-roll flex w-max" style={{ ['--catch-duration' as any]: `${Math.max(20, shown.length * 5)}s` }}>
            {[0, 1].map((copy) => (
              <div key={copy} className="flex gap-3 pr-3" aria-hidden={copy === 1 || undefined}>
                {shown.map((item: any) => {
                  const product = item.products;
                  return (
                    <Link
                      key={`${copy}-${item.id}`}
                      to={`/product/${product.id}`}
                      tabIndex={copy === 1 ? -1 : undefined}
                      className="shrink-0 bg-white rounded-lg border border-blue-100 px-4 py-2 hover:shadow-md transition-shadow min-w-[160px]"
                    >
                      <p className="font-medium text-sm">{product.name}</p>
                      {item.note && (
                        <p className="text-xs text-muted-foreground truncate">{item.note}</p>
                      )}
                      {seafood.visible ? (
                        <p className="text-sm font-semibold text-primary mt-1">
                          ₹{product.price}/{product.unit}
                        </p>
                      ) : (
                        <SeafoodPriceNote message={seafood.message} className="mt-1" />
                      )}
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
