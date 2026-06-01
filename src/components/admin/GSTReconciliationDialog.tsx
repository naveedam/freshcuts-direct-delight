import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { FileSpreadsheet } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { writeExcelFile } from '@/lib/excel-utils';
import {
  buildReconciliation,
  RECON_CATEGORY_LABEL,
  type ReconCategory,
  type ReconOrderInput,
  type ReconItemInput,
} from '@/lib/gst-reconciliation';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  startDate: string | null;
  endDate: string | null;
  periodLabel: string;
}

export function GSTReconciliationDialog({ open, onOpenChange, startDate, endDate, periodLabel }: Props) {
  const [categoryFilter, setCategoryFilter] = useState<ReconCategory | 'all' | 'mismatch'>('mismatch');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'gstReconciliation', startDate, endDate],
    enabled: open && !!startDate && !!endDate,
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from('orders')
        .select(
          'id, invoice_number, created_at, total_amount, shipping_cost, discount_amount, invoice_cancelled, status, customer_email, flat_number, building_name, weight_finalized_at'
        )
        .gte('created_at', startDate!)
        .lte('created_at', endDate!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const orderIds = (orders || []).map(o => o.id);

      const [{ data: items, error: itemsErr }, { data: editLogs, error: editErr }] =
        await Promise.all([
          orderIds.length
            ? supabase
                .from('order_items')
                .select(
                  'order_id, total_price, taxable_value, cgst_amount, sgst_amount, igst_amount, gst_type, weight_adjusted_at'
                )
                .in('order_id', orderIds)
            : Promise.resolve({ data: [], error: null } as any),
          orderIds.length
            ? supabase
                .from('order_edit_logs')
                .select('order_id')
                .in('order_id', orderIds)
            : Promise.resolve({ data: [], error: null } as any),
        ]);
      if (itemsErr) throw itemsErr;
      if (editErr) throw editErr;

      const edited = new Set<string>((editLogs || []).map((l: any) => l.order_id));
      return buildReconciliation(
        (orders || []) as unknown as ReconOrderInput[],
        (items || []) as unknown as ReconItemInput[],
        edited
      );
    },
  });

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (categoryFilter === 'all') return data.rows;
    if (categoryFilter === 'mismatch') return data.rows.filter(r => r.category !== 'ok');
    return data.rows.filter(r => r.category === categoryFilter);
  }, [data, categoryFilter]);

  const handleExport = () => {
    if (!data) return;
    const summarySheet = [
      { Field: 'Period', Value: periodLabel },
      { Field: 'Total Invoice Register Value', Value: data.summary.total_invoice_register_value },
      { Field: 'Total GSTR-1 Value', Value: data.summary.total_gstr1_value },
      { Field: 'Difference', Value: data.summary.difference },
      { Field: 'Affected Invoices', Value: data.summary.affected_count },
      { Field: 'Total Invoices', Value: data.summary.total_count },
      { Field: '', Value: '' },
      ...Object.entries(data.summary.by_category).map(([cat, v]) => ({
        Field: RECON_CATEGORY_LABEL[cat as ReconCategory],
        Value: `${v.count} invoices · ₹${v.difference.toFixed(2)}`,
      })),
    ];
    const rowsSheet = data.rows.map(r => ({
      'Invoice Number': r.invoice_number,
      'Invoice Date': new Date(r.invoice_date).toLocaleDateString('en-IN'),
      Customer: r.customer,
      'Invoice Total': r.invoice_total,
      'GSTR-1 Amount': r.gstr1_amount,
      Difference: r.difference,
      Status: RECON_CATEGORY_LABEL[r.category],
      Flags: r.status_flags.join('; '),
      'Excluded from GSTR-1': r.excluded_from_gstr1 ? 'Yes' : 'No',
    }));
    writeExcelFile(`GST_Reconciliation_${periodLabel.replace(/\s+/g, '_')}.xlsx`, [
      { name: 'Summary', data: summarySheet },
      { name: 'Invoice Details', data: rowsSheet },
    ]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>GST Reconciliation — {periodLabel}</DialogTitle>
          <DialogDescription>
            Invoice-level audit trail of the difference between the invoice register and GSTR-1.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryTile label="Invoice Register" value={formatCurrency(data.summary.total_invoice_register_value)} />
              <SummaryTile label="GSTR-1 Total" value={formatCurrency(data.summary.total_gstr1_value)} />
              <SummaryTile
                label="Difference"
                value={formatCurrency(data.summary.difference)}
                tone={Math.abs(data.summary.difference) < 1 ? 'ok' : 'bad'}
              />
              <SummaryTile
                label="Affected Invoices"
                value={`${data.summary.affected_count} / ${data.summary.total_count}`}
              />
            </div>

            {/* By category */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {(Object.entries(data.summary.by_category) as [ReconCategory, { count: number; difference: number }][])
                .filter(([cat, v]) => v.count > 0 && cat !== 'ok')
                .map(([cat, v]) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className="text-left p-3 rounded-md border bg-muted/30 hover:bg-muted transition"
                  >
                    <div className="text-xs text-muted-foreground">{RECON_CATEGORY_LABEL[cat]}</div>
                    <div className="text-sm font-semibold">
                      {v.count} inv · Δ {formatCurrency(v.difference)}
                    </div>
                  </button>
                ))}
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Select value={categoryFilter} onValueChange={v => setCategoryFilter(v as any)}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mismatch">Only mismatches</SelectItem>
                  <SelectItem value="all">All invoices</SelectItem>
                  {(Object.keys(RECON_CATEGORY_LABEL) as ReconCategory[]).map(c => (
                    <SelectItem key={c} value={c}>
                      {RECON_CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleExport} variant="outline" className="gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Export Reconciliation Report
              </Button>
            </div>

            {/* Table */}
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Invoice Total</TableHead>
                    <TableHead className="text-right">GSTR-1 Amount</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                        No invoices match this filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRows.map(r => (
                      <TableRow key={r.order_id}>
                        <TableCell className="font-mono text-xs">{r.invoice_number}</TableCell>
                        <TableCell className="text-xs">
                          {new Date(r.invoice_date).toLocaleDateString('en-IN')}
                        </TableCell>
                        <TableCell className="text-xs">{r.customer}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.invoice_total)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.gstr1_amount)}</TableCell>
                        <TableCell
                          className={`text-right font-medium ${
                            Math.abs(r.difference) < 0.01
                              ? ''
                              : r.difference > 0
                              ? 'text-red-600'
                              : 'text-amber-600'
                          }`}
                        >
                          {formatCurrency(r.difference)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={r.category === 'ok' ? 'secondary' : 'destructive'} className="w-fit">
                              {RECON_CATEGORY_LABEL[r.category]}
                            </Badge>
                            {r.status_flags.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {r.status_flags.join(' · ')}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'bad';
}) {
  const toneClass =
    tone === 'ok' ? 'bg-green-50 text-green-800' : tone === 'bad' ? 'bg-red-50 text-red-800' : 'bg-muted/50';
  return (
    <div className={`p-3 rounded-lg ${toneClass}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}