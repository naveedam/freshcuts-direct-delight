// Keeps the last copy of a big admin list on this device, so the screen can show it straight away
// while the fresh copy loads in the background. Cleared when the user signs out.
import { supabase } from '@/integrations/supabase/client';

const PREFIX = 'fc-cache:';

export function readCache<T>(key: string): { data: T; savedAt: number } | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.data) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    // Storage full or unavailable: just skip caching.
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  }
}

export function clearCaches(): void {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// Customer data shouldn't stay on a device after signing out.
try {
  supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') clearCaches(); });
} catch { /* ignore */ }
