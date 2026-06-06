import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Printer, MessageCircle, Download } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/currency';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface VendorGroup {
  vendorId: string;
  vendorName: string;
  vendorPhone: string | null;
  items: Array<{ product: string; qty: number; unit: string; subtotal: number }>;
  total: number;
}

export function VendorDailySummaryDialog({ open, onOpenChange }: Props) {
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'vendor-daily-summary', date],
    queryFn: async () => {
      const start = `${date}T00:00:00`;
      const end = `${date}T23:59:59.999`;
      const { data: pos, error } = await supabase
        .from('purchase_orders')
        .select(`
          id, vendor_id, total_amount,
          vendor:vendors(id, name, phone),
          items:purchase_order_items(product_name, quantity, actual_received_weight, unit_cost, total_cost)
        `)
        .gte('order_date', start)
        .lte('order_date', end)
        .neq('status', 'cancelled');
      if (error) throw error;
      return pos || [];
    },
    enabled: open,
  });

  const grouped: VendorGroup[] = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, VendorGroup>();
    for (const po of data as any[]) {
      const vid = po.vendor_id;
      if (!map.has(vid)) {
        map.set(vid, {
          vendorId: vid,
          vendorName: po.vendor?.name || 'Unknown',
          vendorPhone: po.vendor?.phone || null,
          items: [],
          total: 0,
        });
      }
      const g = map.get(vid)!;
      for (const it of po.items || []) {
        const qty = Number(it.actual_received_weight ?? it.quantity) || 0;
        const subtotal = qty * Number(it.unit_cost || 0);
        g.items.push({ product: it.product_name, qty, unit: 'kg', subtotal });
        g.total += subtotal;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  const buildWhatsAppText = (g: VendorGroup) => {
    const lines = [
      `*Daily Procurement — ${format(new Date(date), 'dd MMM yyyy')}*`,
      `Vendor: ${g.vendorName}`,
      '',
      ...g.items.map(i => `• ${i.product} — ${i.qty.toFixed(2)} ${i.unit}`),
      '',
      `Total: ${formatCurrency(g.total)}`,
    ];
    return encodeURIComponent(lines.join('\n'));
  };

  const handlePrint = () => window.print();

  const handleDownload = () => {
    const text = grouped.map(g =>
      [
        `=== ${g.vendorName} ===`,
        ...g.items.map(i => `${i.product}\t${i.qty.toFixed(2)} ${i.unit}\t${formatCurrency(i.subtotal)}`),
        `Total: ${formatCurrency(g.total)}`,
        '',
      ].join('\n'),
    ).join('\n');
    const blob = new Blob([`Vendor Daily Procurement Summary — ${date}\n\n${text}`], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendor-summary-${date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vendor Daily Procurement Summary</DialogTitle>
        </DialogHeader>

        <div className="flex items-end gap-3 mb-4">
          <div className="flex-1 max-w-xs">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Print</Button>
          <Button variant="outline" onClick={handleDownload}><Download className="h-4 w-4 mr-2" />Download</Button>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-12">Loading…</p>
        ) : grouped.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No active POs for this date.</p>
        ) : (
          <div className="space-y-4">
            {grouped.map(g => (
              <Card key={g.vendorId}>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">{g.vendorName}</CardTitle>
                  {g.vendorPhone && (
                    <Button
                      size="sm"
                      variant="outline"
                      asChild
                    >
                      <a
                        href={`https://wa.me/${g.vendorPhone.replace(/\D/g, '')}?text=${buildWhatsAppText(g)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MessageCircle className="h-4 w-4 mr-2" />
                        WhatsApp
                      </a>
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2">Product</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((it, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2">{it.product}</td>
                          <td className="text-right">{it.qty.toFixed(2)} {it.unit}</td>
                          <td className="text-right">{formatCurrency(it.subtotal)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2} className="pt-3 font-semibold text-right">Total</td>
                        <td className="pt-3 font-bold text-right">{formatCurrency(g.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}