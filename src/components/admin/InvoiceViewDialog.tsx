import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadInvoiceExtras } from '@/lib/invoice-extras';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import InvoiceShareView from '@/components/admin/InvoiceShareView';
import { downloadBlob, generatePdfFromElement } from '@/lib/invoice-generator';

// Read-only view of an invoice, opened from another screen (e.g. a vendor statement). Closing it
// returns to that screen; nothing on the invoice can be changed here.
export function InvoiceViewDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const viewRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['invoice-view', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const [o, items, biz] = await Promise.all([
        supabase.from('orders').select('*').eq('id', orderId!).single(),
        supabase.from('order_items').select('*').eq('order_id', orderId!),
        supabase.from('business_settings').select('*').limit(1).maybeSingle(),
      ]);
      if (o.error) throw o.error;
      if (items.error) throw items.error;
      const extras = await loadInvoiceExtras(o.data, items.data || []);
      return {
        order: o.data as any,
        items: (items.data || []) as any[],
        business: (biz.data as any) || { business_name: 'Fresh Cuts Daily' },
        extras,
      };
    },
  });

  const invoiceNo = data?.order?.invoice_number || data?.order?.id?.slice(0, 8).toUpperCase();

  const download = async () => {
    if (!viewRef.current) return;
    setSaving(true);
    try {
      const blob = await generatePdfFromElement(viewRef.current);
      downloadBlob(blob, `invoice-${invoiceNo}.pdf`);
    } catch (e: any) {
      toast.error('Could not create the PDF: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[840px] max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3 pr-6">
            <span>Invoice {invoiceNo || ''}</span>
            <Button size="sm" variant="outline" onClick={download} disabled={!data || saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              PDF
            </Button>
          </DialogTitle>
          <DialogDescription>View only. Close to go back.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading invoice…
          </div>
        ) : error || !data ? (
          <p className="py-10 text-center text-destructive">Couldn't load this invoice.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border bg-white">
            <InvoiceShareView ref={viewRef} order={data.order} items={data.items} business={data.business}
              unitProductIds={data.extras.unitProductIds} partyCredit={data.extras.partyCredit} />
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={onClose}>Back to statement</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
