import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Mail, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ShareInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
}

async function generateAndUploadInvoice(orderId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-invoice', {
    body: { orderId },
  });
  if (error) throw error;

  const htmlContent = typeof data === 'string' ? data : new TextDecoder().decode(data);
  const fileName = `invoice-${orderId.slice(0, 8)}-${Date.now()}.html`;

  const { error: uploadError } = await supabase.storage
    .from('invoices')
    .upload(fileName, new Blob([htmlContent], { type: 'text/html' }), {
      contentType: 'text/html',
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(fileName);
  return urlData.publicUrl;
}

export function ShareInvoiceDialog({ open, onOpenChange, order }: ShareInvoiceDialogProps) {
  const [loading, setLoading] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const customerName = order?.customer_email?.split('@')[0] || 'Customer';
  const phone = (order?.phone || '').replace(/\D/g, '');
  const email = order?.customer_email || '';
  const invoiceNum = order?.invoice_number || order?.id?.slice(0, 8).toUpperCase();

  const getOrGenerateUrl = async (): Promise<string> => {
    if (invoiceUrl) return invoiceUrl;
    setLoading(true);
    try {
      const url = await generateAndUploadInvoice(order.id);
      setInvoiceUrl(url);
      return url;
    } finally {
      setLoading(false);
    }
  };

  const shareViaWhatsApp = async () => {
    try {
      const url = await getOrGenerateUrl();
      const message = `Hi ${customerName}, your invoice (${invoiceNum}) from Fresh Cuts Daily is ready:\n\n${url}\n\nThank you!`;
      const waUrl = phone
        ? `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${encodeURIComponent(message)}`
        : `https://wa.me/?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
      toast.success('Opening WhatsApp');
    } catch (e: any) {
      toast.error('Failed: ' + e.message);
    }
  };

  const shareViaEmail = async () => {
    try {
      const url = await getOrGenerateUrl();
      const subject = `Your Invoice ${invoiceNum} from Fresh Cuts Daily`;
      const body = `Hi ${customerName},\n\nYour invoice is ready. You can view it here:\n${url}\n\nThank you!\nFresh Cuts Daily`;
      window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_self');
      toast.success('Opening email client');
    } catch (e: any) {
      toast.error('Failed: ' + e.message);
    }
  };

  const copyLink = async () => {
    try {
      const url = await getOrGenerateUrl();
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (e: any) {
      toast.error('Failed: ' + e.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setInvoiceUrl(null); setCopied(false); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Share Invoice #{invoiceNum}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
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
            <Button onClick={shareViaWhatsApp} disabled={loading} className="justify-start gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Share via WhatsApp
            </Button>

            <Button onClick={shareViaEmail} disabled={loading} variant="outline" className="justify-start gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Share via Email
            </Button>

            <Button onClick={copyLink} disabled={loading} variant="secondary" className="justify-start gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy Invoice Link'}
            </Button>
          </div>

          {invoiceUrl && (
            <p className="text-xs text-muted-foreground break-all pt-1">
              {invoiceUrl}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
