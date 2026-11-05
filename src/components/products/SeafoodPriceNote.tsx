import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

// Shown in place of a seafood price after 6 PM IST, or before the day's prices are published.
export function SeafoodPriceNote({ message, className }: { message: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-start gap-1 font-body text-xs font-medium text-amber-700', className)}>
      <Clock className="h-3.5 w-3.5 mt-px shrink-0" />
      <span>{message}</span>
    </span>
  );
}
