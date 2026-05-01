import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, ShoppingCart, Receipt, CreditCard, Building2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';

type Group = 'orders' | 'invoices' | 'payments' | 'flats';

interface Result {
  id: string;
  group: Group;
  title: string;
  subtitle: string;
  navigate: string;
  raw?: any;
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(query.trim(), 300);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = containerRef.current?.querySelector('input');
        (input as HTMLInputElement | null)?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!debounced || debounced.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const q = debounced;
        const like = `%${q}%`;

        // Orders search (covers customer email, phone, flat, building, invoice number)
        const ordersP = supabase
          .from('orders')
          .select('id, invoice_number, customer_email, phone, flat_number, building_name, total_amount, balance_due, payment_status, status, created_at')
          .or(
            `invoice_number.ilike.${like},customer_email.ilike.${like},phone.ilike.${like},flat_number.ilike.${like},building_name.ilike.${like}`
          )
          .order('created_at', { ascending: false })
          .limit(20);

        // Profiles (names) — get matching user_ids then look up their orders
        const profilesP = supabase
          .from('profiles')
          .select('user_id, full_name, phone, apartment_name, flat_number')
          .or(`full_name.ilike.${like},phone.ilike.${like},apartment_name.ilike.${like},flat_number.ilike.${like}`)
          .limit(10);

        const [ordersRes, profilesRes] = await Promise.all([ordersP, profilesP]);
        const ordersBase = ordersRes.data || [];

        // Fetch orders for matched profile users
        let profileOrders: any[] = [];
        const userIds = (profilesRes.data || []).map((p) => p.user_id);
        if (userIds.length) {
          const { data: extra } = await supabase
            .from('orders')
            .select('id, invoice_number, customer_email, phone, flat_number, building_name, total_amount, balance_due, payment_status, status, created_at, user_id')
            .in('user_id', userIds)
            .order('created_at', { ascending: false })
            .limit(20);
          profileOrders = extra || [];
        }

        // Build a name lookup
        const nameByUser = new Map<string, string>();
        (profilesRes.data || []).forEach((p) => {
          if (p.user_id && p.full_name) nameByUser.set(p.user_id, p.full_name);
        });

        // Merge orders (dedupe by id)
        const allOrdersMap = new Map<string, any>();
        [...ordersBase, ...profileOrders].forEach((o: any) => {
          if (!allOrdersMap.has(o.id)) allOrdersMap.set(o.id, o);
        });
        const allOrders = Array.from(allOrdersMap.values());

        const customerLabel = (o: any) =>
          (o.user_id && nameByUser.get(o.user_id)) ||
          o.customer_email?.split('@')[0] ||
          o.phone ||
          'Customer';

        // ORDERS group
        const orderResults: Result[] = allOrders.slice(0, 10).map((o: any) => ({
          id: `order-${o.id}`,
          group: 'orders',
          title: `Order ${o.invoice_number || '#' + o.id.slice(0, 8)}`,
          subtitle: `${customerLabel(o)} • ${o.flat_number || ''}${o.building_name ? ' ' + o.building_name : ''} • ₹${Number(o.total_amount || 0).toFixed(0)} • ${o.status}`,
          navigate: `/admin/orders?orderId=${o.id}`,
          raw: o,
        }));

        // INVOICES group (orders with invoice_number set)
        const invoiceResults: Result[] = allOrders
          .filter((o: any) => !!o.invoice_number)
          .slice(0, 10)
          .map((o: any) => ({
            id: `inv-${o.id}`,
            group: 'invoices',
            title: o.invoice_number,
            subtitle: `${customerLabel(o)} • ₹${Number(o.total_amount || 0).toFixed(0)} • Bal ₹${Number(o.balance_due || 0).toFixed(0)} • ${o.payment_status}`,
            navigate: `/admin/orders?orderId=${o.id}&invoice=1`,
            raw: o,
          }));

        // FLATS group (unique flat+building combos from matched orders)
        const flatMap = new Map<string, { flat: string; building: string | null; count: number }>();
        allOrders.forEach((o: any) => {
          if (!o.flat_number) return;
          const key = `${o.flat_number}|${o.building_name || ''}`;
          const cur = flatMap.get(key);
          if (cur) cur.count++;
          else flatMap.set(key, { flat: o.flat_number, building: o.building_name, count: 1 });
        });
        const flatResults: Result[] = Array.from(flatMap.values())
          .slice(0, 10)
          .map((f) => ({
            id: `flat-${f.flat}-${f.building}`,
            group: 'flats',
            title: `${f.flat}${f.building ? ' — ' + f.building : ''}`,
            subtitle: `${f.count} order${f.count > 1 ? 's' : ''}`,
            navigate: `/admin/documents?flat=${encodeURIComponent(f.flat)}`,
          }));

        // PAYMENTS group — search by ref number / order match
        const orderIds = allOrders.map((o: any) => o.id);
        let paymentResults: Result[] = [];
        const paymentsRefP = supabase
          .from('customer_payments')
          .select('id, order_id, amount, payment_method, payment_date, reference_number')
          .ilike('reference_number', like)
          .order('payment_date', { ascending: false })
          .limit(10);
        const paymentsByOrderP = orderIds.length
          ? supabase
              .from('customer_payments')
              .select('id, order_id, amount, payment_method, payment_date, reference_number')
              .in('order_id', orderIds)
              .order('payment_date', { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] as any[] });
        const [pRef, pByOrder] = await Promise.all([paymentsRefP, paymentsByOrderP]);
        const payMap = new Map<string, any>();
        [...(pRef.data || []), ...((pByOrder as any).data || [])].forEach((p: any) => {
          if (!payMap.has(p.id)) payMap.set(p.id, p);
        });
        const orderById = new Map(allOrders.map((o: any) => [o.id, o]));
        paymentResults = Array.from(payMap.values())
          .slice(0, 10)
          .map((p: any) => {
            const ord = orderById.get(p.order_id);
            return {
              id: `pay-${p.id}`,
              group: 'payments',
              title: `₹${Number(p.amount).toFixed(0)} • ${p.payment_method}`,
              subtitle: `${ord?.invoice_number || 'Order ' + (p.order_id || '').slice(0, 8)} ${p.reference_number ? '• Ref ' + p.reference_number : ''}`,
              navigate: `/admin/orders?orderId=${p.order_id}&payment=1`,
            } as Result;
          });

        if (cancelled) return;
        setResults([...orderResults, ...invoiceResults, ...flatResults, ...paymentResults]);
      } catch (e) {
        console.error('Global search failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const grouped = useMemo(() => {
    const g: Record<Group, Result[]> = { orders: [], invoices: [], payments: [], flats: [] };
    results.forEach((r) => g[r.group].push(r));
    return g;
  }, [results]);

  const groupMeta: Record<Group, { label: string; icon: any }> = {
    orders: { label: 'Orders', icon: ShoppingCart },
    invoices: { label: 'Invoices', icon: Receipt },
    payments: { label: 'Payments', icon: CreditCard },
    flats: { label: 'Flats', icon: Building2 },
  };

  const total = results.length;

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search orders, invoices, flats, payments... (Ctrl+K)"
          className="pl-9 pr-9 h-9"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute left-0 right-0 mt-2 bg-popover border border-border rounded-md shadow-lg max-h-[70vh] overflow-y-auto z-50">
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching...
            </div>
          )}
          {!loading && total === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              No results for "{query}"
            </div>
          )}
          {!loading &&
            (Object.keys(grouped) as Group[]).map((g) => {
              const items = grouped[g];
              if (!items.length) return null;
              const Meta = groupMeta[g];
              const Icon = Meta.icon;
              return (
                <div key={g} className="py-1">
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/30">
                    <Icon className="h-3.5 w-3.5" /> {Meta.label}
                    <span className="ml-auto font-normal">{items.length}</span>
                  </div>
                  {items.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        navigate(r.navigate);
                        setOpen(false);
                        setQuery('');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-accent flex flex-col gap-0.5 border-b border-border/50 last:border-b-0"
                    >
                      <span className="text-sm font-medium truncate">{r.title}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.subtitle}</span>
                    </button>
                  ))}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;