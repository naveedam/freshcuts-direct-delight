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

export async function shareInvoice({
  blob,
  fileName,
  title,
  text,
  whatsappPhone,
}: ShareInvoiceParams): Promise<{ method: 'native' | 'web' | 'fallback' }> {
  // 1. Native (Capacitor)
  if (Capacitor.isNativePlatform()) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const base64 = await blobToBase64(blob);
      const written = await Filesystem.writeFile({
        path: `Invoices/${fileName}`,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      });
      await Share.share({ title, text, url: written.uri, dialogTitle: title });
      return { method: 'native' };
    } catch (e) {
      console.warn('Native share failed, falling back', e);
    }
  }

  // 2. Web Share API with files
  try {
    const file = new File([blob], fileName, { type: blob.type });
    const nav: any = navigator;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ title, text, files: [file] });
      return { method: 'web' };
    }
  } catch (e) {
    console.warn('Web share failed, falling back', e);
  }

  // 3. WhatsApp URL fallback (text only) — image must be downloaded separately
  const phone = (whatsappPhone || '').replace(/\D/g, '');
  const waUrl = phone
    ? `https://wa.me/${phone.startsWith('91') ? phone : '91' + phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(waUrl, '_blank');
  return { method: 'fallback' };
}

export const isNative = () => Capacitor.isNativePlatform();