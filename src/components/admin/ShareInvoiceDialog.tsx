import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Mail, Download, Image, FileText } from 'lucide-react';
import {
  generateInvoicePdf,
  generateInvoiceImage,
  uploadInvoiceToStorage,
  saveDocumentRecord,
  downloadBlob,
} from '@/lib/invoice-generator';

interface ShareInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

export function ShareInvoiceDialog({ open, onOpenChange, order }: ShareInvoiceDialogProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const customerName = order?.customer_email?.split('@')[0] || 'Customer';
  const phone = (order?.phone || '').replace(/\D/g, '');
  const email = order?.customer_email || '';
  const invoiceNum = order?.invoice_number || order?.id?.slice(0, 8).toUpperCase();
  const flatNumber = order?.flat_number || null;
  const buildingName = order?.building_name || null;

  const handleDownloadPdf = async () => {
    setLoading('pdf');
    try {
      const blob = await generateInvoicePdf(order.id);
      const fileName = `invoice-${invoiceNum}.pdf`;
      downloadBlob(blob, fileName);

      // Upload and save record
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
      const blob = await generateInvoiceImage(order.id);
      const fileName = `invoice-${invoiceNum}.png`;
      downloadBlob(blob, fileName);
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
      // Step 1: Generate and download PDF
      const blob = await generateInvoicePdf(order.id);
      const fileName = `invoice-${invoiceNum}.pdf`;
      downloadBlob(blob, fileName);

      // Step 2: Upload for record
      const url = await uploadInvoiceToStorage(blob, fileName, flatNumber);
      await saveDocumentRecord({
        flatNumber, buildingName, orderId: order.id,
        documentType: 'invoice', fileUrl: url, fileName,
        invoiceNumber: invoiceNum, customerName,
      });

      // Step 3: Open WhatsApp with message (user attaches file manually, like Vyapar)
      const message = `Hi ${customerName}, please find your invoice #${invoiceNum} from Fresh Cuts Daily attached.\n\nThank you for your order!`;
      const waUrl = phone
        ? `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');

      toast.success('PDF downloaded — attach it in WhatsApp');
    } catch (e: any) {
      toast.error('Failed: ' + e.message);
    } finally {
      setLoading(null);
    }
  };

  const handleEmail = async () => {
    setLoading('email');
    try {
      // Download PDF first
      const blob = await generateInvoicePdf(order.id);
      const fileName = `invoice-${invoiceNum}.pdf`;
      downloadBlob(blob, fileName);

      // Open mailto
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

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setLoading(null); }}>
      <DialogContent className="max-w-sm">
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
            <Button onClick={handleDownloadPdf} disabled={isLoading} className="justify-start gap-2">
              {loading === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Download PDF
            </Button>

            <Button onClick={handleWhatsApp} disabled={isLoading} className="justify-start gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white">
              {loading === 'whatsapp' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Share on WhatsApp
            </Button>

            <Button onClick={handleEmail} disabled={isLoading} variant="outline" className="justify-start gap-2">
              {loading === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send via Email
            </Button>

            <Button onClick={handleDownloadImage} disabled={isLoading} variant="secondary" className="justify-start gap-2">
              {loading === 'image' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
              Download Image (PNG)
            </Button>
          </div>

          <p className="text-xs text-muted-foreground pt-1">
            PDF will be downloaded first. Attach it manually in WhatsApp or email — just like Vyapar!
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
