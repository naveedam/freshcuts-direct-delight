import { LiveRatePage } from '@/components/admin/LiveRatePage';
import { COMMODITIES } from '@/lib/daily-rate';

export default function ChickenRateAdmin() {
  return <LiveRatePage cfg={COMMODITIES.chicken} />;
}
