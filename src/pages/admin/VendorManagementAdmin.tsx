import { TabbedAdminPage } from '@/components/admin/TabbedAdminPage';
import VendorsAdmin from './VendorsAdmin';
import PurchaseOrdersAdmin from './PurchaseOrdersAdmin';
import VendorLedger from './VendorLedger';
import VendorProfitability from './VendorProfitability';
import VendorStatements from './VendorStatements';

// Vendors, Purchase Orders, Vendor Ledger, Statements & Payments and Vendor Profitability on one screen. Each tab is the
// existing screen unchanged, so the records and calculations behind them are the same.
export default function VendorManagementAdmin() {
  return (
    <TabbedAdminPage
      tabs={[
        { value: 'vendors', label: 'Vendors', render: () => <VendorsAdmin embedded /> },
        { value: 'purchase-orders', label: 'Purchase Orders', render: () => <PurchaseOrdersAdmin embedded /> },
        { value: 'ledger', label: 'Vendor Ledger', render: () => <VendorLedger embedded /> },
        { value: 'statements', label: 'Statements & Payments', render: () => <VendorStatements embedded /> },
        { value: 'profitability', label: 'Vendor Profitability', render: () => <VendorProfitability embedded /> },
      ]}
    />
  );
}
