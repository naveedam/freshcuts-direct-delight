import { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface AdminTab {
  value: string;
  label: string;
  render: () => ReactNode;
}

// One admin screen made of tabs, each an existing screen shown without its own frame. The open
// tab lives in the address (?tab=…), so links and the browser's back button land on the right
// tab, and only the open tab loads its data.
export function TabbedAdminPage({ tabs }: { tabs: AdminTab[] }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const active = tabs.some((t) => t.value === requested) ? requested! : tabs[0].value;

  return (
    <AdminLayout>
      <Tabs
        value={active}
        onValueChange={(v) => setParams(v === tabs[0].value ? {} : { tab: v }, { replace: true })}
        className="space-y-4"
        style={{ ['--admin-sticky-offset' as any]: '3.5rem' }}
      >
        {/* The tab bar stays in place below the top bar; a tab's own fixed section sits under it. */}
        <div
          className="md:sticky z-[6] -mx-4 md:-mx-6 px-4 md:px-6 py-2 -mt-2 bg-background"
          style={{ top: '3.5rem' }}
        >
          <TabsList className="flex-wrap h-auto">
            {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
          </TabsList>
        </div>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-0">
            {active === t.value && t.render()}
          </TabsContent>
        ))}
      </Tabs>
    </AdminLayout>
  );
}

// Lets a screen render either on its own (inside AdminLayout) or as a tab of a combined screen.
export function PageFrame({ embedded, children }: { embedded?: boolean; children: ReactNode }) {
  return embedded ? <>{children}</> : <AdminLayout>{children}</AdminLayout>;
}

// The top of a screen (title, totals, filters) that stays in place on larger screens while the
// list below scrolls. Sits under the admin top bar, and under the tab bar on tabbed screens.
export function StickyTop({ children }: { children: ReactNode }) {
  return (
    <div
      className="md:sticky z-[5] -mx-4 md:-mx-6 px-4 md:px-6 pt-1 pb-3 space-y-4 bg-background border-b border-border/60"
      style={{ top: 'calc(3.5rem + var(--admin-sticky-offset, 0px))' }}
    >
      {children}
    </div>
  );
}
