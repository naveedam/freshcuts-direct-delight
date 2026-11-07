import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Loader2, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { ChickenLiveRatePanel } from '@/components/admin/rates/ChickenLiveRatePanel';
import { DatedPricePanel } from '@/components/admin/rates/DatedPricePanel';
import { SeafoodSheetPanel } from '@/components/admin/rates/SeafoodSheetPanel';
import { RATE_TAB_SLUGS, useRateProducts, useVendors } from '@/components/admin/rates/useRateProducts';
import { useQuery } from '@tanstack/react-query';

const TABS = ['chicken', 'mutton', 'seafood', 'other'] as const;
type Tab = typeof TABS[number];

export const MUTTON_PRODUCTS = [
  'Mutton', 'Mutton Boneless', 'Mutton Minced', 'Mutton Shanks', 'Mutton Chops',
  'Mutton Spleen', 'Mutton Liver', 'Mutton Kidneys', 'Mutton Brain',
];

export const CHICKEN_PRODUCTS = [
  'Chicken Skin Out', 'Chicken With Skin', 'Chicken Drumstick Skin Out', 'Chicken Drumstick With Skin',
  'Chicken Leg & Thigh Skin Out', 'Chicken Leg & Thigh With Skin', 'Chicken Lollipop Skin Out',
  'Chicken Lollipop With Skin', 'Chicken Wings Skin Out', 'Chicken Wings With Skin', 'Chicken Minced',
  'Chicken Breast Boneless', 'Chicken Thigh Boneless', 'Chicken Boneless With Skin',
];

// One screen for every purchase and selling price: Chicken, Mutton, Seafood and Other Products,
// each with its own history. Replaces Chicken Rate, Mutton Rate, Seafood Rate, Price History
// and Today's Catch.
export default function RateManagementAdmin() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') || '') ? (params.get('tab') as Tab) : 'chicken';
  const [chickenSupplier, setChickenSupplier] = useState<'mn' | 'bismillah'>('mn');

  const { data: products, isLoading } = useRateProducts();
  const { data: vendors } = useVendors();
  const { data: categories } = useQuery({
    queryKey: ['rate-categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('id, name, slug');
      if (error) throw error;
      return data || [];
    },
  });

  const bySlug = (slug: string) => (products || []).filter((p) => p.categorySlug === slug);
  const poultry = useMemo(() => bySlug('poultry'), [products]);
  const mutton = useMemo(() => bySlug('lamb'), [products]);
  const seafood = useMemo(() => bySlug('seafood'), [products]);
  const other = useMemo(
    () => (products || []).filter((p) => !RATE_TAB_SLUGS.includes(p.categorySlug || '')),
    [products],
  );
  const activeVendors = (vendors || []).filter((v) => v.status !== 'inactive');
  const bismillah = (vendors || []).find((v) => /bismillah/i.test(v.name));
  const catFor = (slug: string) => {
    const c = (categories || []).find((x: any) => x.slug === slug);
    return c ? { id: c.id, name: c.name } : null;
  };

  const addBismillah = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('vendors').insert({ name: 'Bismillah Chicken', status: 'active' });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['rate-vendors'] }); toast.success('Bismillah Chicken added as a supplier'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Tags className="h-6 w-6" /> Rate Management</h1>
          <p className="text-sm text-muted-foreground">
            Every purchase and selling price, with history. A price stays in force until a newer one is saved; prices are checked against cost and the previous price before saving.
          </p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <TabsList>
            <TabsTrigger value="chicken">Chicken</TabsTrigger>
            <TabsTrigger value="mutton">Mutton</TabsTrigger>
            <TabsTrigger value="seafood">Seafood</TabsTrigger>
            <TabsTrigger value="other">Other Products</TabsTrigger>
          </TabsList>

          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin mt-4" />
          ) : (
            <>
              <TabsContent value="chicken" className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Supplier:</span>
                  <Button size="sm" variant={chickenSupplier === 'mn' ? 'default' : 'outline'} onClick={() => setChickenSupplier('mn')}>
                    M N Broilers (live rate)
                  </Button>
                  <Button size="sm" variant={chickenSupplier === 'bismillah' ? 'default' : 'outline'} onClick={() => setChickenSupplier('bismillah')}>
                    Bismillah Chicken (fixed prices)
                  </Button>
                </div>
                {chickenSupplier === 'mn' ? (
                  <ChickenLiveRatePanel />
                ) : bismillah ? (
                  <DatedPricePanel
                    title="Bismillah Chicken"
                    description="Purchase and selling price per product. Prices apply every day until you enter a new one."
                    products={poultry}
                    vendorId={bismillah.id}
                    storeKey="chicken-bismillah"
                    expectedNames={CHICKEN_PRODUCTS}
                    newProductCategory={catFor('poultry')}
                  />
                ) : (
                  <div className="rounded-md border p-4 text-sm">
                    Bismillah Chicken isn't in your supplier list yet.
                    <Button size="sm" className="ml-3" onClick={() => addBismillah.mutate()} disabled={addBismillah.isPending}>Add it</Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="mutton">
                <DatedPricePanel
                  title="Mutton"
                  description="Purchase and selling price per product. Prices apply every day until you enter a new one; every change keeps the old record."
                  products={mutton}
                  vendorId={null}
                  storeKey="mutton"
                  expectedNames={MUTTON_PRODUCTS}
                  newProductCategory={catFor('lamb')}
                />
              </TabsContent>

              <TabsContent value="seafood">
                <SeafoodSheetPanel products={seafood} vendors={activeVendors} />
              </TabsContent>

              <TabsContent value="other">
                <DatedPricePanel
                  title="Other Products"
                  description="Gourmet, packaged, sauces, pantry and everything else outside meat and fish."
                  products={other}
                  vendorId={null}
                  storeKey="other"
                  showCategory
                />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </AdminLayout>
  );
}
