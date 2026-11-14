import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Mail, Download, Image, FileText } from 'lucide-react';
import {
  generatePdfFromElement,
  generateImageFromElement,
  uploadInvoiceToStorage,
  saveDocumentRecord,
  downloadBlob,
} from '@/lib/invoice-generator';
import InvoiceShareView from '@/components/admin/InvoiceShareView';
import { supabase } from '@/integrations/supabase/client';
import { shareInvoice, isNative } from '@/lib/native-share';

interface ShareInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  // Called after a successful download or share, so the screen that opened this one can close too.
  onDone?: () => void;
}

export function ShareInvoiceDialog({ open, onOpenChange, order, onDone }: ShareInvoiceDialogProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [business, setBusiness] = useState<any>(null);
  const shareViewRef = useRef<HTMLDivElement>(null);
  const [preparedImage, setPreparedImage] = useState<Blob | null>(null);
  const [preparing, setPreparing] = useState(false);

  const customerName = order?.customer_email?.split('@')[0] || 'Customer';
  const phone = (order?.phone || '').replace(/\D/g, '');
  const email = order?.customer_email || '';
  const invoiceNum = order?.invoice_number || order?.id?.slice(0, 8).toUpperCase();
  const flatNumber = order?.flat_number || null;
  const buildingName = order?.building_name || null;

  // Load order items and business info when dialog opens
  useEffect(() => {
    if (!open || !order?.id) return;
    const load = async () => {
      const [itemsRes, bizRes] = await Promise.all([
        supabase.from('order_items').select('*').eq('order_id', order.id),
        supabase.from('business_settings').select('*').limit(1).maybeSingle(),
      ]);
      setOrderItems(itemsRes.data || []);
      setBusiness(bizRes.data || {
        business_name: 'Fresh Cuts Daily',
        address: null, city: null, postal_code: null,
        phone: null, email: null, gstin: null,
      });
    };
    load();
  }, [open, order?.id]);

  // Saves a copy of the invoice under the flat's documents. Runs after the windows have closed;
  // a failure only shows a message.
  const archiveInvoice = (blob: Blob, fileName: string) => {
    (async () => {
      const url = await uploadInvoiceToStorage(blob, fileName, flatNumber);
      await saveDocumentRecord({
        flatNumber, buildingName, orderId: order.id,
        documentType: 'invoice', fileUrl: url, fileName,
        invoiceNumber: invoiceNum, customerName,
      });
    })().catch((e: any) => toast.error(`Invoice downloaded, but saving a copy to the flat's documents failed: ${e?.message || e}`));
  };

  const handleDownloadPdf = async () => {
    setLoading('pdf');
    try {
      await new Promise(r => setTimeout(r, 100));
      if (!shareViewRef.current) throw new Error('Invoice view not ready');

      const blob = await generatePdfFromElement(shareViewRef.current);
      const fileName = `invoice-${invoiceNum}.pdf`;
      downloadBlob(blob, fileName);

      // The file is downloaded: close the share and preview windows straight away, back to the
      // orders list. Keeping a copy against the flat carries on in the background.
      toast.success('PDF downloaded successfully');
      onOpenChange(false);
      onDone?.();
      archiveInvoice(blob, fileName);
    } catch (e: any) {
      toast.error('Failed: ' + e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleDownloadImage = async () => {
    setLoading('image');
    try {
      // Wait a tick for the ref to be rendered
      await new Promise(r => setTimeout(r, 100));
      if (!shareViewRef.current) throw new Error('Invoice view not ready');

      const blob = await generateImageFromElement(shareViewRef.current);
      const fileName = `invoice-${invoiceNum}.png`;
      downloadBlob(blob, fileName);

      // The file is downloaded: close the share and preview windows straight away, back to the
      // orders list. Keeping a copy against the flat carries on in the background.
      toast.success('Image downloaded');
      onOpenChange(false);
      onDone?.();
      archiveInvoice(blob, fileName);
    } catch (e: any) {
      toast.error('Failed: ' + e.message);
    } finally {
      setLoading(null);
    }
  };

  const message = `Hi ${customerName}, please find your invoice #${invoiceNum} from Fresh Cuts Daily.\n\nThank you for your order!`;

  // Synchronous-start handler: the image is already prepared, so the share sheet / WhatsApp
  // opens inside the tap. Archiving runs afterwards in the background.
  const handleWhatsApp = () => {
    const blob = preparedImage;
    if (!blob) {
      toast.error('Invoice image is still being prepared — try again in a second');
      return;
    }
    const fileName = `invoice-${invoiceNum}.png`;
    setLoading('whatsapp');

    shareInvoice({ blob, fileName, title: `Invoice ${invoiceNum}`, text: message, whatsappPhone: phone })
      .then((result) => {
        if (result.method === 'cancelled') return;
        if (result.method === 'fallback') {
          downloadBlob(blob, fileName);
          toast.success('Image downloaded — attach it in the WhatsApp chat');
        }
        archiveInvoice(blob, fileName);
        onOpenChange(false);
        onDone?.();
      })
      .catch((e: any) => {
        toast.error('Could not open WhatsApp: ' + (e?.message || e));
      })
      .finally(() => setLoading(null));
  };

  const handleEmail = async () => {
    setLoading('email');
    try {
      await new Promise(r => setTimeout(r, 100));
      if (!shareViewRef.current) throw new Error('Invoice view not ready');

      const blob = await generatePdfFromElement(shareViewRef.current);
      const fileName = `invoice-${invoiceNum}.pdf`;
      downloadBlob(blob, fileName);

      const subject = `Your Invoice ${invoiceNum} from Fresh Cuts Daily`;
      const body = `Hi ${customerName},\n\nPlease find your invoice #${invoiceNum} attached.\n\nThank you!\nFresh Cuts Daily`;
      window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_self');

      toast.success('PDF downloaded — attach it in your email');
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast.error('Failed: ' + e.message);
    } finally {
      setLoading(null);
    }
  };

  const isLoading = loading !== null;
  const hasItems = orderItems.length > 0 && business;

  // Pre-generate the invoice image as soon as the dialog has its data, so the WhatsApp
  // button can share instantly on tap (mobile browsers block delayed shares).
  useEffect(() => {
    if (!open) { setPreparedImage(null); return; }
    if (!hasItems) return;
    let cancelled = false;
    setPreparing(true);
    const t = setTimeout(async () => {
      try {
        if (!shareViewRef.current) throw new Error('Invoice view not ready');
        const blob = await generateImageFromElement(shareViewRef.current);
        if (!cancelled) setPreparedImage(blob);
      } catch (e: any) {
        if (!cancelled) toast.error('Could not prepare invoice image: ' + (e?.message || e));
      } finally {
        if (!cancelled) setPreparing(false);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, hasItems, orderItems, business]);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setLoading(null); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share Invoice #{invoiceNum}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          {flatNumber && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Flat</Label>
              <Input value={`${flatNumber}${buildingName ? ', ' + buildingName : ''}`} readOnly className="h-8 text-sm" />
            </div>
          )}
          {phone && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input value={phone} readOnly className="h-8 text-sm" />
            </div>
          )}
          {email && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input value={email} readOnly className="h-8 text-sm" />
            </div>
          )}

          <div className="grid gap-2 pt-2">
            <Button onClick={handleDownloadPdf} disabled={isLoading || !hasItems} className="justify-start gap-2">
              {loading === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Download PDF
            </Button>

            <Button onClick={handleWhatsApp} disabled={isLoading || !hasItems || !preparedImage} className="justify-start gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white">
              {(loading === 'whatsapp' || preparing) ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              {preparing ? 'Preparing invoice…' : 'Share on WhatsApp (Image)'}
            </Button>

            <Button onClick={handleEmail} disabled={isLoading || !hasItems} variant="outline" className="justify-start gap-2">
              {loading === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send via Email (PDF)
            </Button>

            <Button onClick={handleDownloadImage} disabled={isLoading || !hasItems} variant="secondary" className="justify-start gap-2">
              {loading === 'image' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
              Download Image (PNG)
            </Button>
          </div>

          <p className="text-xs text-muted-foreground pt-1">
            {isNative()
              ? 'Pick WhatsApp in the share sheet — the invoice image is attached.'
              : 'On phones, the share sheet opens with the invoice image — pick WhatsApp. Where sharing files is not supported, WhatsApp opens with the message and the image downloads to attach.'}
          </p>
        </div>

        {/* Hidden render target for image generation */}
        {hasItems && order && (
          <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
            <InvoiceShareView
              ref={shareViewRef}
              order={order}
              items={orderItems}
              business={business}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
