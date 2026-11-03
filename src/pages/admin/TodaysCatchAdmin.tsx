import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { istDateString } from '@/lib/live-rate';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Fish } from 'lucide-react';

interface Row {
  productId: string;
  productName: string;
  selected: boolean;
  note: string;
  vendorId: string | null;
}

export default function TodaysCatchAdmin() {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);

  const { data: products } = useQuery({
    queryKey: ['seafood-products-for-catch'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name')
        .eq('category', 'Seafood & Fish')
        .eq('is_published', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: vendors } = useQuery({
    queryKey: ['vendors-for-catch'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, name')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: existing } = useQuery({
    queryKey: ['todays-catch-existing'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('todays_catch')
        .select('*')
        .eq('catch_date', istDateString());
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (products) {
      setRows(
        products.map((p) => {
          const ex = existing?.find((e: any) => e.product_id === p.id);
          return {
            productId: p.id,
            productName: p.name,
            selected: !!ex,
            note: ex?.note || '',
            vendorId: ex?.vendor_id || null,
          };
        })
      );
    }
  }, [products, existing]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      const today = istDateString();
      const { error: delError } = await supabase
        .from('todays_catch')
        .delete()
        .eq('catch_date', today);
      if (delError) throw delError;

      const selectedRows = rows.filter((r) => r.selected);
      if (selectedRows.length > 0) {
        const { error: insError } = await supabase.from('todays_catch').insert(
          selectedRows.map((r, i) => ({
            catch_date: today,
            product_id: r.productId,
            vendor_id: r.vendorId,
            note: r.note || null,
            display_order: i,
          }))
        );
        if (insError) throw insError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todays-catch-existing'] });
      queryClient.invalidateQueries({ queryKey: ['todays-catch-home'] });
      toast.success("Today's Catch published");
    },
    onError: (error: Error) => {
      toast.error('Failed to publish: ' + error.message);
    },
  });

  const toggle = (productId: string) => {
    setRows((prev) =>
      prev.map((r) => (r.productId === productId ? { ...r, selected: !r.selected } : r))
    );
  };
  const updateNote = (productId: string, note: string) => {
    setRows((prev) => prev.map((r) => (r.productId === productId ? { ...r, note } : r)));
  };
  const updateVendor = (productId: string, vendorId: string) => {
    setRows((prev) => prev.map((r) => (r.productId === productId ? { ...r, vendorId } : r)));
  };

  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <AdminLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Fish className="h-6 w-6" /> Today's Catch
            </h1>
            <p className="text-sm text-muted-foreground">
              Check off what's available today from the morning vendor update. This shows on the homepage.
            </p>
          </div>
          <Button onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
            {publishMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Publish ({selectedCount} selected)
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seafood & Fish</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((row) => (
              <div key={row.productId} className="flex items-center gap-3 py-2 border-b last:border-0">
                <Checkbox checked={row.selected} onCheckedChange={() => toggle(row.productId)} />
                <span className="w-52 shrink-0 font-medium text-sm">{row.productName}</span>
                <Select
                  value={row.vendorId || 'none'}
                  onValueChange={(v) => updateVendor(row.productId, v === 'none' ? '' : v)}
                >
                  <SelectTrigger className="w-40 h-8 text-xs">
                    <SelectValue placeholder="Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No vendor</SelectItem>
                    {vendors?.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Note e.g. cleaned, eyes removed"
                  value={row.note}
                  onChange={(e) => updateNote(row.productId, e.target.value)}
                  className="h-8 text-xs flex-1"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
