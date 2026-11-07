import { TabbedAdminPage } from '@/components/admin/TabbedAdminPage';
import ExpensesAdmin from './ExpensesAdmin';
import DeliveryPartnersAdmin from './DeliveryPartnersAdmin';

// Expenses, plus the delivery partner advance ledger as a separate tab. The two are kept apart:
// nothing recorded in one creates or changes anything in the other.
export default function ExpensesManagementAdmin() {
  return (
    <TabbedAdminPage
      tabs={[
        { value: 'expenses', label: 'Expenses', render: () => <ExpensesAdmin embedded /> },
        { value: 'advances', label: 'Delivery Partner Advances', render: () => <DeliveryPartnersAdmin embedded /> },
      ]}
    />
  );
}
