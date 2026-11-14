import { Capacitor } from '@capacitor/core';

/**
 * Auto-detecting share helper:
 *  1. Native Capacitor (Share + Filesystem) when running in the app
 *  2. navigator.share with files when supported
 *  3. WhatsApp URL fallback (text only)
 */
export interface ShareInvoiceParams {
  blob: Blob;
  fileName: string;
  title: string;
  text: string;
  whatsappPhone?: string | null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // strip "data:*/*;base64,"
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export type ShareResult = { method: 'native' | 'web' | 'fallback' | 'cancelled' };

export function buildWhatsAppUrl(text: string, whatsappPhone?: string | null) {
  const phone = (whatsappPhone || '').replace(/\D/g, '');
  const intl = phone.length === 10 ? '91' + phone : phone;
  return intl
    ? `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * IMPORTANT: call this directly from the click handler with an already-generated blob.
 * Mobile browsers only allow navigator.share / opening WhatsApp right after a tap, so
 * nothing slow (image generation, uploads) may be awaited before this is called.
 */
export async function shareInvoice({
  blob,
  fileName,
  title,
  text,
  whatsappPhone,
}: ShareInvoiceParams): Promise<ShareResult> {
  // 1. Native (Capacitor app) — no tap-timing restriction here
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const base64 = await blobToBase64(blob);
      // Cache dir: no storage permission needed on Android 11+
      const written = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({ title, text, url: written.uri, dialogTitle: 'Share invoice via' });
      return { method: 'native' };
    } catch (e: any) {
      if (/cancel/i.test(e?.message || '')) return { method: 'cancelled' };
      console.warn('Native share failed, falling back', e);
    }
  }

  // 2. Web Share API with the image file (Android Chrome / iOS Safari)
  const nav: any = navigator;
  const file = new File([blob], fileName, { type: blob.type || 'image/png' });
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      // No other await before this line — keeps the tap's permission alive
      await nav.share({ files: [file], title, text });
      return { method: 'web' };
    } catch (e: any) {
      if (e?.name === 'AbortError') return { method: 'cancelled' };
      console.warn('Web share failed, falling back to wa.me', e);
    }
  }

  // 3. Open WhatsApp chat with the message. Same-tab navigation is never popup-blocked.
  window.location.href = buildWhatsAppUrl(text, whatsappPhone);
  return { method: 'fallback' };
}

export const isNative = () => Capacitor.isNativePlatform();