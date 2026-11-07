import { TabbedAdminPage } from '@/components/admin/TabbedAdminPage';
import ProductsAdmin from './ProductsAdmin';
import CategoriesAdmin from './CategoriesAdmin';

// Products and Categories on one screen. Orders keep their own copy of each line's name,
// category and price, so editing either here never changes past orders or invoices.
export default function ProductManagementAdmin() {
  return (
    <TabbedAdminPage
      tabs={[
        { value: 'products', label: 'Products', render: () => <ProductsAdmin embedded /> },
        { value: 'categories', label: 'Categories', render: () => <CategoriesAdmin embedded /> },
      ]}
    />
  );
}
