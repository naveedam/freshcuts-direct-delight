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

interface ShareInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function ShareInvoiceDialog({ open, onOpenChange, order }: ShareInvoiceDialogProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [business, setBusiness] = useState<any>(null);
  const shareViewRef = useRef<HTMLDivElement>(null);

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

  const handleDownloadPdf = async () => {
    setLoading('pdf');
    try {
      await new Promise(r => setTimeout(r, 100));
      if (!shareViewRef.current) throw new Error('Invoice view not ready');

      const blob = await generatePdfFromElement(shareViewRef.current);
      const fileName = `invoice-${invoiceNum}.pdf`;
      downloadBlob(blob, fileName);

      const url = await uploadInvoiceToStorage(blob, fileName, flatNumber);
      await saveDocumentRecord({
        flatNumber, buildingName, orderId: order.id,
        documentType: 'invoice', fileUrl: url, fileName,
        invoiceNumber: invoiceNum, customerName,
      });

      toast.success('PDF downloaded successfully');
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

      const url = await uploadInvoiceToStorage(blob, fileName, flatNumber);
      await saveDocumentRecord({
        flatNumber, buildingName, orderId: order.id,
        documentType: 'invoice', fileUrl: url, fileName,
        invoiceNumber: invoiceNum, customerName,
      });

      toast.success('Image downloaded');
    } catch (e: any) {
      toast.error('Failed: ' + e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleWhatsApp = async () => {
    setLoading('whatsapp');
    try {
      await new Promise(r => setTimeout(r, 100));
      if (!shareViewRef.current) throw new Error('Invoice view not ready');

      const blob = await generateImageFromElement(shareViewRef.current);
      const fileName = `invoice-${invoiceNum}.png`;
      downloadBlob(blob, fileName);

      const url = await uploadInvoiceToStorage(blob, fileName, flatNumber);
      await saveDocumentRecord({
        flatNumber, buildingName, orderId: order.id,
        documentType: 'invoice', fileUrl: url, fileName,
        invoiceNumber: invoiceNum, customerName,
      });

      const message = `Hi ${customerName}, please find your invoice #${invoiceNum} from Fresh Cuts Daily attached.\n\nThank you for your order!`;
      const waUrl = phone
        ? `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');

      toast.success('Image downloaded — attach it in WhatsApp');
    } catch (e: any) {
      toast.error('Failed: ' + e.message);
    } finally {
      setLoading(null);
    }
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
    } catch (e: any) {
      toast.error('Failed: ' + e.message);
    } finally {
      setLoading(null);
    }
  };

  const isLoading = loading !== null;
  const hasItems = orderItems.length > 0 && business;

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

            <Button onClick={handleWhatsApp} disabled={isLoading || !hasItems} className="justify-start gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white">
              {loading === 'whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Share on WhatsApp (Image)
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
            Image is Vyapar-style mobile-optimized. PDF uses full A4 format. Attach manually in WhatsApp/email.
          </p>
        </div>

        {/* Hidden render target for image generation */}
        {hasItems && (
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
