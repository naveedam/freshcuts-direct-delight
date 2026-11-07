import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle } from 'lucide-react';
import {
  type PriceCheckFailure, type PriceInput, type PriceRecord, savePriceRows,
} from '@/lib/product-prices';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDay(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}-${MONTHS[Number(m) - 1]}-${y.slice(2)}`;
}
export const rupees = (n: number | null | undefined) => (n == null ? '-' : `₹${Number(n).toLocaleString('en-IN')}`);

// Saving prices with the database's price checks: rows it refuses are shown in a prompt;
// with a reason (admins only) they are saved as overrides and logged, without one they are skipped.
export function usePriceSaver() {
  const [pending, setPending] = useState<{ failures: PriceCheckFailure[]; resolve: (r: string | null) => void } | null>(null);
  const [reason, setReason] = useState('');

  const save = async (rows: (PriceInput & { label?: string })[]) => {
    const first = await savePriceRows(rows);
    if (first.failures.length === 0) return { saved: first.saved, skipped: 0 };
    setReason('');
    const given = await new Promise<string | null>((resolve) => setPending({ failures: first.failures, resolve }));
    setPending(null);
    if (!given) return { saved: first.saved, skipped: first.failures.length };
    const second = await savePriceRows(first.failures.map((f) => ({ ...f.row, label: f.label })), given);
    if (second.failures.length > 0) throw new Error(second.failures[0].message);
    return { saved: first.saved + second.saved, skipped: 0 };
  };

  const dialog = (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) pending?.resolve(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" /> Check these prices
          </DialogTitle>
          <DialogDescription>
            These look unusual compared with the last price. Fix them, or give a reason to save them anyway (recorded in the audit log).
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2 text-sm">
          {pending?.failures.map((f, i) => (
            <li key={i} className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-900">
              {f.label && <span className="font-medium">{f.label}: </span>}{f.message}
            </li>
          ))}
        </ul>
        <div className="space-y-1">
          <Label htmlFor="override-reason" className="text-xs">Reason for saving anyway</Label>
          <Input id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. festival demand, supplier confirmed" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => pending?.resolve(null)}>Go back and fix</Button>
          <Button disabled={!reason.trim()} onClick={() => pending?.resolve(reason.trim())}>Save anyway</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { save, dialog };
}

export function PriceHistoryDialog({
  open, onOpenChange, title, records, vendorNames,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  records: PriceRecord[];
  vendorNames?: Map<string, string>;
}) {
  const showSupplier = records.some((r) => r.vendor_id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Price history · {title}</DialogTitle>
          <DialogDescription>Newest first. Each change is its own dated record; earlier records are never overwritten.</DialogDescription>
        </DialogHeader>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No prices recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                {showSupplier && <TableHead>Supplier</TableHead>}
                <TableHead className="text-right">Purchase</TableHead>
                <TableHead className="text-right">Selling</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{fmtDay(r.effective_date)}</TableCell>
                  {showSupplier && <TableCell>{r.vendor_id ? vendorNames?.get(r.vendor_id) || 'Supplier' : '-'}</TableCell>}
                  <TableCell className="text-right">{rupees(r.purchase_price)}</TableCell>
                  <TableCell className="text-right">{rupees(r.selling_price)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.override_reason ? `Override: ${r.override_reason}` : r.source === 'migration' ? 'Carried over' : r.source.replace('_', ' ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
