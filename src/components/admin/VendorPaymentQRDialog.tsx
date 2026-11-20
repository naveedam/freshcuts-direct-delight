import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/currency';
import { Copy, ImageUp, Loader2, QrCode, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

// A vendor's payment QR code, shown large so it can be scanned from a phone, with the UPI ID and
// (on a phone) a button that opens a UPI app directly. The QR image can be added or replaced here.

const BUCKET = 'vendor-payment-qr';
const db = supabase as any;

export interface QRVendor { id: string; name: string }

export function useVendorQR(vendorId?: string | null) {
  return useQuery({
    queryKey: ['vendor-qr', vendorId],
    enabled: !!vendorId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db.from('vendors').select('id, name, payment_qr_path, upi_id').eq('id', vendorId).maybeSingle();
      if (error) throw error;
      let url: string | null = null;
      if (data?.payment_qr_path) {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(data.payment_qr_path, 60 * 60);
        url = signed?.signedUrl ?? null;
      }
      return { path: (data?.payment_qr_path as string | null) ?? null, upiId: (data?.upi_id as string | null) ?? null, url };
    },
  });
}

export function VendorPaymentQRDialog({ vendor, open, onOpenChange, amount }: {
  vendor: QRVendor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount?: number | null; // what's owed, shown for reference and put into the UPI link
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useVendorQR(open ? vendor?.id : null);
  const [busy, setBusy] = useState(false);
  const [upi, setUpi] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const upiValue = upi ?? data?.upiId ?? '';
  const refresh = () => qc.invalidateQueries({ queryKey: ['vendor-qr', vendor?.id] });

  const upload = async (file: File) => {
    if (!vendor) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image of the QR code'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image is larger than 5 MB'); return; }
    setBusy(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${vendor.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { error: e2 } = await db.from('vendors').update({ payment_qr_path: path }).eq('id', vendor.id);
      if (e2) throw e2;
      if (data?.path) await supabase.storage.from(BUCKET).remove([data.path]);
      toast.success('QR code saved');
      refresh();
    } catch (e: any) {
      toast.error('Could not save the QR code: ' + (e?.message || e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeQR = async () => {
    if (!vendor || !data?.path) return;
    if (!window.confirm(`Remove the payment QR code for ${vendor.name}?`)) return;
    setBusy(true);
    try {
      const { error } = await db.from('vendors').update({ payment_qr_path: null }).eq('id', vendor.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([data.path]);
      toast.success('QR code removed');
      refresh();
    } catch (e: any) {
      toast.error('Could not remove: ' + (e?.message || e));
    } finally { setBusy(false); }
  };

  const saveUpi = async () => {
    if (!vendor) return;
    const v = upiValue.trim();
    if (v && !/^[\w.\-]{2,}@[a-zA-Z][\w.\-]*$/.test(v)) { toast.error('That doesn’t look like a UPI ID (e.g. name@okaxis)'); return; }
    const { error } = await db.from('vendors').update({ upi_id: v || null }).eq('id', vendor.id);
    if (error) { toast.error('Could not save the UPI ID: ' + error.message); return; }
    toast.success('UPI ID saved');
    setUpi(null);
    refresh();
  };

  const upiLink = data?.upiId && vendor
    ? `upi://pay?pa=${encodeURIComponent(data.upiId)}&pn=${encodeURIComponent(vendor.name)}&cu=INR${amount && amount > 0 ? `&am=${amount.toFixed(2)}` : ''}`
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setUpi(null); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5" /> Pay {vendor?.name}</DialogTitle>
          <DialogDescription>
            Scan with your phone’s UPI app{amount && amount > 0 ? <> · owed <span className="font-medium text-foreground">{formatCurrency(amount)}</span></> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {isLoading ? (
            <div className="h-72 w-72 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : data?.url ? (
            <img src={data.url} alt={`Payment QR code for ${vendor?.name}`} className="h-72 w-72 object-contain rounded-lg border bg-white p-2" />
          ) : (
            <div className="h-48 w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
              <QrCode className="h-8 w-8" />
              No QR code yet. Add a photo or screenshot of the vendor’s QR code.
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
            <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ImageUp className="h-4 w-4 mr-1" />}
              {data?.path ? 'Replace QR' : 'Upload QR'}
            </Button>
            {data?.path && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={removeQR}>
                <Trash2 className="h-4 w-4 mr-1" /> Remove
              </Button>
            )}
          </div>

          {upiLink && (
            <Button asChild className="w-full sm:hidden">
              <a href={upiLink}><Smartphone className="h-4 w-4 mr-2" /> Pay in UPI app{amount && amount > 0 ? ` · ${formatCurrency(amount)}` : ''}</a>
            </Button>
          )}

          <div className="w-full space-y-1.5 pt-2 border-t">
            <Label htmlFor="vendor-upi" className="text-xs">UPI ID (optional)</Label>
            <div className="flex gap-2">
              <Input id="vendor-upi" value={upiValue} placeholder="e.g. vendorname@okaxis" onChange={(e) => setUpi(e.target.value)} />
              {upi !== null && upi !== (data?.upiId ?? '') ? (
                <Button size="sm" onClick={saveUpi}>Save</Button>
              ) : data?.upiId ? (
                <Button size="icon" variant="outline" title="Copy UPI ID"
                  onClick={() => { navigator.clipboard?.writeText(data.upiId!); toast.success('UPI ID copied'); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">With a UPI ID, a “Pay in UPI app” button appears on your phone.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
