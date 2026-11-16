import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageFrame, StickyTop } from '@/components/admin/TabbedAdminPage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertTriangle, CheckCircle2, Download, FileText, IndianRupee, Loader2, RotateCcw, Undo2, Wallet, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/currency';
import { LOGO_PNG_DATA_URL } from '@/lib/brand-logo';
import { refreshPOTotals, syncPOsFromWeightAdjustment } from '@/lib/po-lifecycle';
import {
  downloadStatementExcel, downloadStatementPdf, fmtDay, loadVendorStatement, STATUS_LABEL, todayIST, weekOf,
  type LineStatus, type Settlement, type VendorStatement,
} from '@/lib/vendor-statement';

const db = supabase as any;

type Preset = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';
const monthOf = (day: string, offset = 0) => {
  const [y, m] = day.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1 + offset, 1));
  const end = new Date(Date.UTC(y, m + offset, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
};
const rangeFor = (p: Preset) => {
  const t = todayIST();
  if (p === 'this_week') return weekOf(t);
  if (p === 'last_week') return weekOf(t, -1);
  if (p === 'this_month') return monthOf(t);
  if (p === 'last_month') return monthOf(t, -1);
  return null;
};

const STATUS_STYLE: Record<LineStatus, string> = {
  paid: 'bg-green-100 text-green-800 border-green-200',
  partial: 'bg-amber-100 text-amber-800 border-amber-200',
  pending: 'bg-red-50 text-red-700 border-red-200',
  no_po: 'bg-slate-100 text-slate-700 border-slate-200',
  awaiting_weights: 'bg-slate-100 text-slate-600 border-slate-200',
};
const METHODS: Record<string, string> = { upi: 'UPI', cash: 'Cash', bank_transfer: 'Bank transfer', cheque: 'Cheque', other: 'Other' };

// Weekly (or any period) statement per vendor: what they supplied, at their rate and quantity
// from each order, matched to the purchase orders; what's been paid; what's still owed.
export default function VendorStatements({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [vendorId, setVendorId] = useState<string>('');
  const [preset, setPreset] = useState<Preset>('last_week');
  const [range, setRange] = useState(() => rangeFor('last_week')!);
  const [payOpen, setPayOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [undoFor, setUndoFor] = useState<Settlement | null>(null);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendor-statements', 'vendors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendors').select('id, name, status').order('name');
      if (error) throw error;
      return data || [];
    },
  });
  const names = useMemo(() => Object.fromEntries(vendors.map((v: any) => [v.id, v.name])), [vendors]);
  const selected = vendorId || 'all';
  const vendorLabel = selected === 'all' ? 'All vendors' : names[selected] || 'Vendor';

  const { data: st, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['vendor-statements', selected, range.from, range.to, vendors.length],
    enabled: vendors.length > 0 && range.from <= range.to,
    queryFn: () => loadVendorStatement(selected, range.from, range.to, names),
  });

  const choosePreset = (p: Preset) => {
    setPreset(p);
    const r = rangeFor(p);
    if (r) setRange(r);
  };

  const invalidateAll = () => {
    ['vendor-statements', 'vendor-ledger', 'vendor-ledger-sheet', 'vendor-payments', 'vendor-pos'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }));
    queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-orders'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'purchase-order-stats'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'vendor-financial-stats'] });
  };

  const exportAs = async (kind: 'xlsx' | 'pdf') => {
    if (!st) return;
    setExporting(kind);
    try {
      if (kind === 'xlsx') await downloadStatementExcel(st, vendorLabel);
      else await downloadStatementPdf(st, vendorLabel, LOGO_PNG_DATA_URL);
    } catch (e: any) {
      toast.error(`Couldn't create the file: ${e?.message || e}`);
    } finally {
      setExporting(null);
    }
  };

  const t = st?.totals;
  const issues = t ? t.noPoCount + t.mismatchCount + t.rateMissingCount + (st!.orphans.length ? 1 : 0) : 0;
  const overall = !t || t.payable <= 0 ? null
    : t.outstanding <= 0.5 ? { label: 'Paid', cls: STATUS_STYLE.paid }
    : t.paid > 0 ? { label: 'Part paid', cls: STATUS_STYLE.partial }
    : { label: 'Unpaid', cls: STATUS_STYLE.pending };

  return (
    <PageFrame embedded={embedded}>
      <div className="space-y-4">
        <StickyTop>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-heading text-3xl font-bold">Vendor Statements</h1>
              <p className="font-body text-muted-foreground">
                What each vendor supplied in a period, at their rate and quantity from the orders — reconciled with
                purchase orders and payments.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => exportAs('xlsx')} disabled={!st || !!exporting}>
                {exporting === 'xlsx' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Excel
              </Button>
              <Button variant="outline" onClick={() => exportAs('pdf')} disabled={!st || !!exporting}>
                {exporting === 'pdf' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                PDF
              </Button>
              <Button
                onClick={() => setPayOpen(true)}
                disabled={!st || selected === 'all' || (t?.outstanding ?? 0) <= 0}
                title={selected === 'all' ? 'Choose a vendor to record a payment' : undefined}
              >
                <IndianRupee className="h-4 w-4 mr-2" /> Record payment
              </Button>
            </div>
          </div>

          <Card className="mt-3">
            <CardContent className="p-4 flex flex-wrap gap-3 items-end">
              <div className="min-w-[220px]">
                <Label>Vendor</Label>
                <Select value={selected} onValueChange={(v) => setVendorId(v === 'all' ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All vendors</SelectItem>
                    {vendors.map((v: any) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[160px]">
                <Label>Period</Label>
                <Select value={preset} onValueChange={(v) => choosePreset(v as Preset)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this_week">This week (Sun–Sat)</SelectItem>
                    <SelectItem value="last_week">Last week (Sun–Sat)</SelectItem>
                    <SelectItem value="this_month">This month</SelectItem>
                    <SelectItem value="last_month">Last month</SelectItem>
                    <SelectItem value="custom">Custom dates</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>From</Label>
                <Input type="date" value={range.from} onChange={(e) => { setPreset('custom'); setRange({ ...range, from: e.target.value }); }} />
              </div>
              <div>
                <Label>To</Label>
                <Input type="date" value={range.to} onChange={(e) => { setPreset('custom'); setRange({ ...range, to: e.target.value }); }} />
              </div>
              <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh" disabled={isFetching}>
                <RotateCcw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </CardContent>
          </Card>
        </StickyTop>

        {isLoading || !st ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading statement…
          </div>
        ) : (
          <>
            {/* Totals for the period */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Statement total</CardDescription>
                  <CardTitle className="text-xl">{formatCurrency(t!.statement)}</CardTitle>
                  <p className="text-xs text-muted-foreground">{st.lines.length} order line(s)</p>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Paid</CardDescription>
                  <CardTitle className="text-xl text-green-700">{formatCurrency(t!.paid)}</CardTitle>
                  <p className="text-xs text-muted-foreground">against {st.pos.length} PO(s)</p>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    Outstanding {overall && <Badge variant="outline" className={overall.cls}>{overall.label}</Badge>}
                  </CardDescription>
                  <CardTitle className={`text-xl ${t!.outstanding > 0.5 ? 'text-destructive' : ''}`}>{formatCurrency(t!.outstanding)}</CardTitle>
                  <p className="text-xs text-muted-foreground">for {fmtDay(st.from)} to {fmtDay(st.to)}</p>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1"><Wallet className="h-3 w-3" /> Ledger balance</CardDescription>
                  <CardTitle className="text-xl">{formatCurrency(st.ledger.closing)}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    owed on {fmtDay(st.to)} (opening {formatCurrency(st.ledger.opening)})
                  </p>
                </CardHeader>
              </Card>
            </div>

            {/* Reconciliation */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {issues === 0
                      ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                      : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                    Reconciliation
                  </CardTitle>
                  <CardDescription>Orders ↔ purchase orders ↔ payments ↔ vendor ledger</CardDescription>
                </div>
                {(t!.noPoCount > 0 || t!.mismatchCount > 0) && (
                  <Button variant="outline" size="sm" onClick={() => setFixOpen(true)}>
                    <Wrench className="h-4 w-4 mr-2" /> Fix purchase orders
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <Check ok={t!.noPoCount === 0}
                  text={t!.noPoCount === 0 ? 'Every order line is on a purchase order'
                    : `${t!.noPoCount} order line(s) not on a purchase order yet (${formatCurrency(t!.noPoAmount)})${
                      st.lines.some((l) => l.status === 'awaiting_weights') ? ' — some are waiting for weights to be finalised' : ''}`} />
                <Check ok={t!.mismatchCount === 0}
                  text={t!.mismatchCount === 0 ? 'Purchase orders match the order quantities and vendor rates'
                    : `${t!.mismatchCount} PO line(s) differ from the order (PO is ${t!.mismatchDelta >= 0 ? 'higher' : 'lower'} by ${formatCurrency(Math.abs(t!.mismatchDelta))})`} />
                <Check ok={t!.rateMissingCount === 0}
                  text={t!.rateMissingCount === 0 ? 'Every line has a vendor rate'
                    : `${t!.rateMissingCount} line(s) have no vendor rate — set it on the order (Edit order) and refresh`} />
                <Check ok={st.orphans.length === 0}
                  text={st.orphans.length === 0 ? 'No purchase order lines without a matching order line'
                    : `${st.orphans.length} PO line(s) in this period's POs aren't on this statement (${formatCurrency(t!.orphanAmount)}): ${
                      st.orphans.slice(0, 3).map((o) => `${o.poNumber} ${o.item} — ${o.reason}`).join('; ')}${st.orphans.length > 3 ? '…' : ''}`} />
                <Check ok
                  text={`Vendor ledger: opening ${formatCurrency(st.ledger.opening)} + POs ${formatCurrency(st.ledger.purchases)} − payments ${formatCurrency(st.ledger.payments)} = ${formatCurrency(st.ledger.closing)} owed on ${fmtDay(st.to)}${
                    st.ledger.unallocated > 0 ? ` (includes ${formatCurrency(st.ledger.unallocated)} paid without a PO link)` : ''}`} />
              </CardContent>
            </Card>

            {/* Lines */}
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      {selected === 'all' && <TableHead>Vendor</TableHead>}
                      <TableHead>Apartment</TableHead>
                      <TableHead>Flat No.</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Vendor Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Linked Invoice</TableHead>
                      <TableHead>Linked PO</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {st.lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                          No orders for {vendorLabel} in this period
                        </TableCell>
                      </TableRow>
                    ) : st.lines.map((l) => (
                      <TableRow key={l.orderItemId}>
                        <TableCell className="whitespace-nowrap">{fmtDay(l.date)}</TableCell>
                        {selected === 'all' && <TableCell>{l.vendorName}</TableCell>}
                        <TableCell>{l.apartment || '—'}</TableCell>
                        <TableCell>{l.flat || '—'}</TableCell>
                        <TableCell>{l.item}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.qty.toFixed(2)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${l.rateMissing ? 'text-destructive font-medium' : ''}`}>
                          {l.rateMissing ? 'missing' : l.rate}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatCurrency(l.amount)}</TableCell>
                        <TableCell className="font-mono text-xs">{l.invoice || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {l.po?.number || '—'}
                          {l.mismatch && (
                            <span className="ml-1 text-amber-700" title={`PO line: ${l.po!.qty} × ${l.po!.rate} = ${formatCurrency(l.po!.amount)}`}>
                              ≠ {formatCurrency(l.po!.amount)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  {st.lines.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={selected === 'all' ? 7 : 6} className="text-right font-semibold">Total</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{formatCurrency(t!.statement)}</TableCell>
                        <TableCell colSpan={3} />
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </CardContent>
            </Card>

            {/* Payments */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Payments for this period</CardTitle>
                <CardDescription>
                  A payment recorded here is shared out over the period's purchase orders, oldest first, so the
                  Purchase Orders and Vendor Ledger tabs show it too.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Paid on</TableHead>
                      {selected === 'all' && <TableHead>Vendor</TableHead>}
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>For period</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {st.settlements.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No payments yet</TableCell></TableRow>
                    ) : st.settlements.map((s) => (
                      <TableRow key={s.key}>
                        <TableCell className="whitespace-nowrap">{fmtDay(s.date)}</TableCell>
                        {selected === 'all' && <TableCell>{names[s.vendorId] || '—'}</TableCell>}
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCurrency(s.amount)}
                          {s.advance > 0 && <div className="text-xs text-muted-foreground">{formatCurrency(s.advance)} advance</div>}
                        </TableCell>
                        <TableCell>{METHODS[s.method] || s.method}</TableCell>
                        <TableCell className="font-mono text-xs">{s.reference || '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {s.periodFrom && s.periodTo ? `${fmtDay(s.periodFrom)} to ${fmtDay(s.periodTo)}` : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[280px]">{s.notes || ''}</TableCell>
                        <TableCell>
                          {s.batchId && (
                            <Button variant="ghost" size="sm" onClick={() => setUndoFor(s)} title="Undo this payment">
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {st && selected !== 'all' && (
        <RecordPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          statement={st}
          vendorId={selected}
          vendorName={vendorLabel}
          onDone={invalidateAll}
        />
      )}
      {st && (
        <FixDialog open={fixOpen} onOpenChange={setFixOpen} statement={st} reload={async () => (await refetch()).data!} onDone={invalidateAll} />
      )}
      <UndoDialog settlement={undoFor} onClose={() => setUndoFor(null)} onDone={invalidateAll} />
    </PageFrame>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />}
      <span className={ok ? 'text-muted-foreground' : ''}>{text}</span>
    </div>
  );
}

function RecordPaymentDialog({ open, onOpenChange, statement, vendorId, vendorName, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; statement: VendorStatement; vendorId: string; vendorName: string;
  onDone: () => void;
}) {
  const t = statement.totals;
  const payablePOs = statement.pos.filter((p) => p.total - p.paid > 0.009);
  const poOutstanding = Math.round(payablePOs.reduce((s, p) => s + (p.total - p.paid), 0) * 100) / 100;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('upi');
  const [reference, setReference] = useState('');
  const [paidOn, setPaidOn] = useState(todayIST());
  const [notes, setNotes] = useState('');

  const reset = () => { setAmount(''); setMethod('upi'); setReference(''); setPaidOn(todayIST()); setNotes(''); };

  const save = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error('Enter an amount above zero');
      const { data, error } = await db.rpc('record_vendor_settlement', {
        p_vendor_id: vendorId, p_from: statement.from, p_to: statement.to, p_amount: amt, p_method: method,
        p_reference: reference, p_notes: notes, p_paid_on: paidOn, p_po_ids: payablePOs.map((p) => p.id),
      });
      if (error) throw error;
      return data as { pos_paid: number; advance: number };
    },
    onSuccess: (r) => {
      toast.success(`Payment recorded against ${r.pos_paid} PO(s)${r.advance > 0 ? `, ${formatCurrency(r.advance)} kept as an advance` : ''}`);
      onDone();
      reset();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || 'Could not record the payment'),
  });

  const amt = Number(amount) || 0;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment — {vendorName}</DialogTitle>
          <DialogDescription>
            For {fmtDay(statement.from)} to {fmtDay(statement.to)}. Outstanding {formatCurrency(t.outstanding)}
            {t.noPoAmount > 0 && ` (of which ${formatCurrency(t.noPoAmount)} isn't on a PO yet)`}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Amount</Label>
            <div className="flex gap-2">
              <Input type="number" inputMode="decimal" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              <Button type="button" variant="outline" onClick={() => setAmount(String(poOutstanding))} disabled={poOutstanding <= 0}>
                Full {formatCurrency(poOutstanding)}
              </Button>
            </div>
            {amt > poOutstanding + 0.009 && (
              <p className="text-xs text-amber-700 mt-1">
                {formatCurrency(amt - poOutstanding)} more than the POs owe will be kept as an advance for this vendor.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(METHODS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Paid on</Label>
              <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Reference (UTR / cheque no.)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || amt <= 0}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Record {amt > 0 ? formatCurrency(amt) : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Brings purchase orders in line with the orders: adds lines that are missing (for orders whose
// weights are finalised) and sets PO lines to the order's vendor quantity and rate.
function FixDialog({ open, onOpenChange, statement, reload, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; statement: VendorStatement;
  reload: () => Promise<VendorStatement>; onDone: () => void;
}) {
  const missing = statement.lines.filter((l) => l.status === 'no_po');
  const waiting = statement.lines.filter((l) => l.status === 'awaiting_weights');
  const mism = statement.lines.filter((l) => l.mismatch);
  const paidPOs = new Set(mism.filter((l) => l.status === 'paid' || l.status === 'partial').map((l) => l.po!.number));

  const run = useMutation({
    mutationFn: async () => {
      const orders = [...new Set(missing.map((l) => l.orderId))];
      for (const id of orders) {
        const r = await syncPOsFromWeightAdjustment(id);
        if (!r.success) throw new Error(r.error || 'Could not add PO lines');
      }
      const fresh = orders.length ? await reload() : statement;
      const touched = new Set<string>();
      for (const l of fresh.lines.filter((x) => x.mismatch && x.po)) {
        const patch: Record<string, unknown> = { quantity: l.qty, unit_cost: l.rate, total_cost: l.amount };
        if (l.po!.taxAmount != null && l.po!.amount > 0) {
          patch.tax_amount = Math.round((l.po!.taxAmount * l.amount / l.po!.amount) * 100) / 100;
        }
        const { error } = await db.from('purchase_order_items').update(patch).eq('id', l.po!.lineId);
        if (error) throw error;
        touched.add(l.po!.id);
      }
      for (const poId of touched) {
        await refreshPOTotals(poId);
        await db.rpc('refresh_po_payment', { p_po_id: poId });
      }
      return { added: orders.length, aligned: touched.size };
    },
    onSuccess: (r) => {
      toast.success(`Purchase orders updated${r.added ? ` · lines added for ${r.added} order(s)` : ''}${r.aligned ? ` · ${r.aligned} PO(s) aligned` : ''}`);
      onDone();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || 'Could not update the purchase orders'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fix purchase orders</DialogTitle>
          <DialogDescription>The orders (vendor quantity and rate) are taken as correct; orders and invoices are not changed.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          {missing.length > 0 && <li>Add {missing.length} missing line(s) to the purchase orders.</li>}
          {mism.length > 0 && <li>Set {mism.length} PO line(s) to the order's quantity and vendor rate, and update the PO totals.</li>}
          {waiting.length > 0 && <li className="text-muted-foreground">{waiting.length} line(s) wait for weights to be finalised on the order; they'll join a PO then.</li>}
          {paidPOs.size > 0 && (
            <li className="text-amber-700">
              {[...paidPOs].join(', ')} already has payments. Its paid status is recalculated from the new total.
            </li>
          )}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => run.mutate()} disabled={run.isPending || (missing.length + mism.length === 0)}>
            {run.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Update purchase orders
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UndoDialog({ settlement, onClose, onDone }: { settlement: Settlement | null; onClose: () => void; onDone: () => void }) {
  const run = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc('undo_vendor_settlement', { p_batch_id: settlement!.batchId });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Payment removed'); onDone(); onClose(); },
    onError: (e: any) => toast.error(e?.message || 'Could not remove the payment'),
  });
  return (
    <Dialog open={!!settlement} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Undo this payment?</DialogTitle>
          <DialogDescription>
            {settlement && `${formatCurrency(settlement.amount)} paid on ${fmtDay(settlement.date)} will be removed from the vendor's payments, and the purchase orders it paid go back to unpaid or part paid.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Keep it</Button>
          <Button variant="destructive" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Undo payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
