import { LiveRatePage } from '@/components/admin/LiveRatePage';
import { COMMODITIES } from '@/lib/daily-rate';

export default function MuttonRateAdmin() {
  return <LiveRatePage cfg={COMMODITIES.mutton} />;
}
