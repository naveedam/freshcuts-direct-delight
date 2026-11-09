import brandLogo from '@/assets/fresh-cuts-daily-logo.svg';
import brandIcon from '@/assets/fresh-cuts-daily-icon.svg';
import { LayoutDashboard, Package, ShoppingCart, FileText, LogOut, Home, Building2, Truck, Receipt, BarChart3, Users, Upload, CalendarDays, Route, Tags } from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

const menuItems = [
  { title: 'Dashboard', url: '/admin', icon: LayoutDashboard },
  { title: 'Product Management', url: '/admin/products', icon: Package },
  { title: "Rate Management", url: '/admin/rates', icon: Tags },
  { title: 'Bulk Upload', url: '/admin/products/bulk-upload', icon: Upload },
  { title: 'Orders', url: '/admin/orders', icon: ShoppingCart },
  { title: 'Vendor Management', url: '/admin/vendors', icon: Users },
  { title: 'Shipping', url: '/admin/shipping', icon: Truck },
  { title: 'Delivery Runs', url: '/admin/delivery-runs', icon: Route },
  { title: 'GST Config', url: '/admin/gst', icon: Receipt },
  { title: 'GST Reports', url: '/admin/gst-reports', icon: BarChart3 },
  { title: 'Expenses', url: '/admin/expenses', icon: Receipt },
  { title: 'Page Content', url: '/admin/content', icon: FileText },
  { title: 'Business Settings', url: '/admin/settings', icon: Building2 },
  { title: 'Financial Years', url: '/admin/financial-years', icon: CalendarDays },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const { signOut, user } = useAuth();

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar
      className={collapsed ? 'w-14' : 'w-60'}
      collapsible="icon"
    >
      <SidebarContent>
        {/* Logo */}
        <div className={`p-4 ${collapsed ? 'px-2' : ''}`}>
          <Link to="/admin" className="flex items-center gap-2" aria-label="Fresh Cuts Daily admin">
            {collapsed ? (
              <img src={brandIcon} alt="Fresh Cuts Daily" className="h-9 w-9" />
            ) : (
              <>
                <img src={brandLogo} alt="Fresh Cuts Daily" className="h-14 w-auto" />
                <span className="font-body text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">Admin</span>
              </>
            )}
          </Link>
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>{collapsed ? '' : 'Management'}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink 
                      to={item.url} 
                      end={item.url === '/admin'}
                      className="hover:bg-muted/50 flex items-center gap-3" 
                      activeClassName="bg-muted text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{collapsed ? '' : 'Quick Links'}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <Link to="/" className="hover:bg-muted/50 flex items-center gap-3">
                    <Home className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>View Store</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && user && (
          <p className="text-xs text-muted-foreground mb-2 truncate">
            {user.email}
          </p>
        )}
        <Button 
          variant="ghost" 
          size={collapsed ? 'icon' : 'sm'}
          className="w-full justify-start gap-2"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && 'Sign Out'}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
