import { supabase } from '@/integrations/supabase/client';

/**
 * Generates invoice HTML from edge function, then converts to PDF/image.
 */
export async function getInvoiceHtml(orderId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-invoice', {
    body: { orderId },
  });
  if (error) throw error;
  return typeof data === 'string' ? data : new TextDecoder().decode(data);
}

/**
 * Generate PDF from a pre-rendered DOM element (InvoiceShareView).
 * Uses the same component as image generation for visual consistency.
 */
export async function generatePdfFromElement(element: HTMLElement): Promise<Blob> {
  const html2pdf = (await import('html2pdf.js')).default;
  const pdfBlob: Blob = await html2pdf()
    .from(element)
    .set({
      margin: [10, 10, 10, 10],
      filename: 'invoice.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .outputPdf('blob');
  return pdfBlob;
}

/**
 * Generate a PNG image from a pre-rendered DOM element (InvoiceShareView).
 */
// Font CSS is embedded once and reused — re-downloading fonts on every render was the main slowdown.
let fontEmbedCssPromise: Promise<string> | null = null;

export async function generateImageFromElement(element: HTMLElement): Promise<Blob> {
  const { toJpeg, getFontEmbedCSS } = await import('html-to-image');
  if (!fontEmbedCssPromise) {
    fontEmbedCssPromise = getFontEmbedCSS(element).catch(() => '');
  }
  const fontEmbedCSS = await fontEmbedCssPromise;
  // JPEG at 2x: sharp on WhatsApp, ~5-10x smaller/faster than PNG at 3x
  const dataUrl = await toJpeg(element, {
    quality: 0.9,
    pixelRatio: Math.min(2, window.devicePixelRatio || 2),
    backgroundColor: '#ffffff',
    fontEmbedCSS,
  });
  const res = await fetch(dataUrl);
  return await res.blob();
}

export async function uploadInvoiceToStorage(
  blob: Blob,
  fileName: string,
  flatNumber?: string | null,
): Promise<string> {
  const path = flatNumber ? `${flatNumber}/${fileName}` : fileName;
  const { error } = await supabase.storage
    .from('invoices')
    .upload(path, blob, { contentType: blob.type, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('invoices').getPublicUrl(path);
  return data.publicUrl;
}

export async function saveDocumentRecord(params: {
  flatNumber?: string | null;
  buildingName?: string | null;
  orderId: string;
  documentType: string;
  fileUrl: string;
  fileName: string;
  invoiceNumber?: string | null;
  customerName?: string | null;
}) {
  const { error } = await supabase.from('documents').insert({
    flat_number: params.flatNumber || null,
    building_name: params.buildingName || null,
    order_id: params.orderId,
    document_type: params.documentType,
    file_url: params.fileUrl,
    file_name: params.fileName,
    invoice_number: params.invoiceNumber || null,
    customer_name: params.customerName || null,
  });
  if (error) console.error('Failed to save document record:', error);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export { downloadBlob };
