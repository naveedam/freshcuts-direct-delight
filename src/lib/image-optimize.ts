import { supabase } from '@/integrations/supabase/client';

// Product photos are shrunk in the browser before they're stored: at most 1000 px on the long
// side, saved as WebP. A 3–5 MB photo becomes roughly 60–150 KB, which is what makes the
// storefront load quickly. They're stored with a one-year browser cache.

const MAX_SIDE = 1000;
const QUALITY = 0.82;
const BUCKET = 'product-images';
const CACHE_SECONDS = '31536000';

export async function compressImage(input: Blob, maxSide = MAX_SIDE, quality = QUALITY): Promise<Blob> {
  const bitmap = await createImageBitmap(input);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize images');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
  if (!blob) throw new Error('Could not compress the image');
  return blob;
}

/** Compresses and uploads a product photo; returns its public URL. */
export async function uploadProductImage(input: Blob, nameHint = 'product'): Promise<string> {
  let body: Blob = input;
  let ext = (input.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  try {
    const small = await compressImage(input);
    if (small.size < input.size) {
      body = small;
      ext = 'webp';
    }
  } catch {
    // Keep the original if the browser can't read it (e.g. an unusual format).
  }
  const slug = nameHint.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'product';
  const path = `products/${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: body.type || `image/${ext}`,
    cacheControl: CACHE_SECONDS,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export type OptimiseResult = { done: number; skipped: number; failed: { name: string; reason: string }[]; savedKb: number };

/**
 * Shrinks the photos already on products. Each photo is downloaded, compressed and stored as a
 * new file, and the product is pointed at it. Old files are left in storage untouched.
 * Photos that are already small (under 200 KB) or already WebP are skipped.
 */
export async function optimiseExistingImages(
  products: { id: string; name: string; image_url: string | null }[],
  onProgress?: (doneSoFar: number, total: number) => void,
): Promise<OptimiseResult> {
  const result: OptimiseResult = { done: 0, skipped: 0, failed: [], savedKb: 0 };
  const todo = products.filter((p) => p.image_url && !p.image_url.endsWith('/placeholder.svg'));
  let i = 0;
  for (const p of todo) {
    i += 1;
    onProgress?.(i, todo.length);
    try {
      const res = await fetch(p.image_url!, { cache: 'no-store' });
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const original = await res.blob();
      if (original.size < 200 * 1024 || original.type === 'image/webp') {
        result.skipped += 1;
        continue;
      }
      const small = await compressImage(original);
      if (small.size > original.size * 0.9) {
        result.skipped += 1;
        continue;
      }
      const url = await uploadProductImage(small, p.name);
      const { error } = await supabase.from('products').update({ image_url: url }).eq('id', p.id);
      if (error) throw error;
      result.done += 1;
      result.savedKb += Math.round((original.size - small.size) / 1024);
    } catch (e: any) {
      result.failed.push({ name: p.name, reason: e?.message || String(e) });
    }
  }
  return result;
}
