// Products sold in sizes ("Bangda - Small", "Bangda - Medium", "Bangda - Big") are separate
// products underneath (own price, stock, invoice line). On the storefront they're shown as one
// card with size buttons. Only the display is grouped.

const SIZE_ORDER = ['baby', 'mini', 'small', 'regular', 'medium', 'big', 'large', 'extra large', 'xl', 'jumbo'];
const SIZE_RE = new RegExp(`^(.*\\S)\\s*[-–—]\\s*(${SIZE_ORDER.join('|')})\\s*$`, 'i');

export function splitSize(name: string): { base: string; size: string } | null {
  const m = name.trim().match(SIZE_RE);
  if (!m) return null;
  const size = m[2].trim();
  return { base: m[1].trim(), size: size.length <= 2 ? size.toUpperCase() : size[0].toUpperCase() + size.slice(1).toLowerCase() };
}

const sizeRank = (size: string) => {
  const i = SIZE_ORDER.indexOf(size.toLowerCase());
  return i < 0 ? SIZE_ORDER.length : i;
};

export type SizedItem<T> = { base: string; variants: { size: string | null; product: T }[] };

// Groups a list (order kept by each group's first member). A name with a size suffix is grouped
// only when another product in the same category shares its base name; otherwise it stays as is.
export function groupBySize<T extends { name: string; categoryId?: string | null }>(list: T[]): SizedItem<T>[] {
  const keyOf = (p: T, base: string) => `${p.categoryId ?? ''}|${base.toLowerCase()}`;
  const counts = new Map<string, number>();
  list.forEach((p) => {
    const s = splitSize(p.name);
    if (s) counts.set(keyOf(p, s.base), (counts.get(keyOf(p, s.base)) || 0) + 1);
  });

  const out: SizedItem<T>[] = [];
  const groups = new Map<string, SizedItem<T>>();
  list.forEach((p) => {
    const s = splitSize(p.name);
    if (s && (counts.get(keyOf(p, s.base)) || 0) > 1) {
      const k = keyOf(p, s.base);
      let g = groups.get(k);
      if (!g) {
        g = { base: s.base, variants: [] };
        groups.set(k, g);
        out.push(g);
      }
      g.variants.push({ size: s.size, product: p });
    } else {
      out.push({ base: p.name, variants: [{ size: null, product: p }] });
    }
  });
  groups.forEach((g) => g.variants.sort((a, b) => sizeRank(a.size || '') - sizeRank(b.size || '')));
  return out;
}
