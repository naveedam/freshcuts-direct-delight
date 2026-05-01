import { NavLink, useLocation } from 'react-router-dom';
import { ShoppingCart, Receipt, CreditCard, Search, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

const items = [
  { to: '/admin', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/admin/documents', label: 'Invoices', icon: Receipt },
  { to: '/admin/orders?tab=payments', label: 'Payments', icon: CreditCard },
  { to: '/admin/search', label: 'Search', icon: Search },
];

export function MobileBottomNav() {
  const isMobile = useIsMobile();
  const location = useLocation();
  if (!isMobile) return null;
  if (!location.pathname.startsWith('/admin')) return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border flex items-stretch justify-around h-14 pb-[env(safe-area-inset-bottom)]"
      aria-label="Mobile bottom navigation"
    >
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <NavLink
            key={it.label}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{it.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export default MobileBottomNav;