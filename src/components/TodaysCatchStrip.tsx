import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { istDateString } from '@/lib/live-rate';
import { Fish } from 'lucide-react';
import { Link } from 'react-router-dom';

export function TodaysCatchStrip() {
  const { data: catchItems } = useQuery({
    queryKey: ['todays-catch-home'],
    queryFn: async () => {
      const today = istDateString();
      const { data, error } = await supabase
        .from('todays_catch')
        .select('id, note, product_id, products(id, name, image_url, price, unit)')
        .eq('catch_date', today)
        .order('display_order');
      if (error) throw error;
      return data;
    },
  });

  if (!catchItems || catchItems.length === 0) return null;

  return (
    <div className="bg-blue-50 border-y border-blue-100 py-4">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-2 mb-3">
          <Fish className="h-5 w-5 text-blue-700" />
          <h2 className="font-semibold text-blue-900">Today's Catch</h2>
          <span className="text-xs text-blue-600">Fresh in this morning</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {catchItems.map((item: any) => {
            const product = item.products;
            if (!product) return null;
            return (
              <Link
                key={item.id}
                to={`/product/${product.id}`}
                className="shrink-0 bg-white rounded-lg border border-blue-100 px-4 py-2 hover:shadow-md transition-shadow min-w-[160px]"
              >
                <p className="font-medium text-sm">{product.name}</p>
                {item.note && (
                  <p className="text-xs text-muted-foreground truncate">{item.note}</p>
                )}
                <p className="text-sm font-semibold text-primary mt-1">
                  ₹{product.price}/{product.unit}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
