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

export async function generateInvoicePdf(orderId: string): Promise<Blob> {
  const html = await getInvoiceHtml(orderId);

  // Create an offscreen iframe to render the HTML
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.width = '794px'; // A4 width at 96dpi
  iframe.style.height = '1123px';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) throw new Error('Cannot access iframe document');

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  // Wait for content to render
  await new Promise(resolve => setTimeout(resolve, 500));

  const html2pdf = (await import('html2pdf.js')).default;
  const element = iframeDoc.body;

  const pdfBlob: Blob = await html2pdf()
    .from(element)
    .set({
      margin: 0,
      filename: 'invoice.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .outputPdf('blob');

  document.body.removeChild(iframe);
  return pdfBlob;
}

export async function generateInvoiceImage(orderId: string): Promise<Blob> {
  const html = await getInvoiceHtml(orderId);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.width = '794px';
  iframe.style.height = '1123px';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) throw new Error('Cannot access iframe document');

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  await new Promise(resolve => setTimeout(resolve, 500));

  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(iframeDoc.body, {
    quality: 0.95,
    pixelRatio: 2,
    backgroundColor: '#ffffff',
  });

  document.body.removeChild(iframe);

  // Convert data URL to blob
  const res = await fetch(dataUrl);
  return await res.blob();
}

export async function uploadInvoiceToStorage(
  blob: Blob,
  fileName: string,
  flatNumber?: string | null,
): Promise<string> {
  const path = flatNumber
    ? `${flatNumber}/${fileName}`
    : fileName;

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
