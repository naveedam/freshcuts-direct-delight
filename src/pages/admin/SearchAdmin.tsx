import { AdminLayout } from '@/components/admin/AdminLayout';
import { GlobalSearch } from '@/components/admin/GlobalSearch';

export default function SearchAdmin() {
  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="font-heading text-2xl font-bold mb-4">Search</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Search across orders, invoices, payments, and flats. Try a flat number, customer name, phone, or invoice number.
        </p>
        <GlobalSearch />
      </div>
    </AdminLayout>
  );
}