import { TabbedAdminPage } from '@/components/admin/TabbedAdminPage';
import VendorsAdmin from './VendorsAdmin';
import PurchaseOrdersAdmin from './PurchaseOrdersAdmin';
import VendorLedger from './VendorLedger';
import VendorProfitability from './VendorProfitability';

// Vendors, Purchase Orders, Vendor Ledger and Vendor Profitability on one screen. Each tab is the
// existing screen unchanged, so the records and calculations behind them are the same.
export default function VendorManagementAdmin() {
  return (
    <TabbedAdminPage
      tabs={[
        { value: 'vendors', label: 'Vendors', render: () => <VendorsAdmin embedded /> },
        { value: 'purchase-orders', label: 'Purchase Orders', render: () => <PurchaseOrdersAdmin embedded /> },
        { value: 'ledger', label: 'Vendor Ledger', render: () => <VendorLedger embedded /> },
        { value: 'profitability', label: 'Vendor Profitability', render: () => <VendorProfitability embedded /> },
      ]}
    />
  );
}
