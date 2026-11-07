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
      >
        <TabsList className="flex-wrap h-auto">
          {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>
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
