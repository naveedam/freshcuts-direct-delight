import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageFrame } from '@/components/admin/TabbedAdminPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Bike, BookOpen, Copy, Download, Loader2, MessageCircle, Plus, Trash2, Wallet } from 'lucide-react';
import { istDateString } from '@/lib/live-rate';
import { writeExcelFile } from '@/lib/excel-utils';
import {
  closingText, ENTRY_LABEL, fmtDay, rupee, statementRows, summarise, whatsappMessage,
  type EntryType, type LedgerEntry, type PeriodSummary,
} from '@/lib/partner-ledger';

// Advance ledger for individual delivery partners: what each person holds as advance and what is
// owed to them. It is kept apart from Expenses: nothing here creates, changes or counts an
// expense. Delivery payments are recorded in the Expenses tab as before.

const db = supabase as any;

interface Partner { id: string; name: string; phone: string | null; notes: string | null; is_active: boolean }
interface Balance { partner_id: string; advance_balance: number; amount_due: number; settled_up_to: string | null }

const n = (v: string) => (v.trim() === '' ? 0 : Number(v));
function daysBetween(from: string, to: string): number {
  if (!from || !to || to < from) return 0;
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}
function nextDay(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
function waLink(phone: string | null, text: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  const num = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
}
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success('Copied. Paste it in WhatsApp.'); }
  catch { toast.error('Couldn’t copy; select the text instead.'); }
}

function useLedger(partnerId: string | null) {
  return useQuery({
    queryKey: ['partner-ledger', partnerId],
    enabled: !!partnerId,
    queryFn: async () => {
      const { data, error } = await db.from('partner_ledger').select('*')
        .eq('partner_id', partnerId).order('entry_date').order('created_at');
      if (error) throw error;
      return (data || []).map((e: any) => ({ ...e, amount: Number(e.amount) })) as LedgerEntry[];
    },
  });
}

export default function DeliveryPartnersAdmin({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const today = istDateString();

  const { data: partners = [], isLoading } = useQuery({
    queryKey: ['delivery-partners'],
    queryFn: async () => {
      const { data, error } = await db.from('delivery_partners').select('*').order('name');
      if (error) throw error;
      return data as Partner[];
    },
  });
  const { data: balances = [] } = useQuery({
    queryKey: ['partner-balances'],
    queryFn: async () => {
      const { data, error } = await db.from('partner_balances').select('*');
      if (error) throw error;
      return data as Balance[];
    },
  });
  const balanceOf = (id: string): Balance =>
    balances.find((b) => b.partner_id === id) || { partner_id: id, advance_balance: 0, amount_due: 0, settled_up_to: null };

  const refresh = () => ['delivery-partners', 'partner-balances', 'partner-ledger']
    .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const addPartner = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error('Enter the delivery person’s name');
      const { error } = await db.from('delivery_partners').insert({ name: newName.trim(), phone: newPhone.trim() || null });
      if (error) throw new Error(error.code === '23505' ? 'Someone with that name is already listed' : error.message);
    },
    onSuccess: () => { setNewName(''); setNewPhone(''); refresh(); toast.success('Delivery partner added'); },
    onError: (e: any) => toast.error(e.message),
  });
  const toggleActive = useMutation({
    mutationFn: async (p: Partner) => {
      const { error } = await db.from('delivery_partners').update({ is_active: !p.is_active }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: any) => toast.error(e.message),
  });

  const [showInactive, setShowInactive] = useState(false);
  const shown = partners.filter((p) => showInactive || p.is_active);
  const totals = useMemo(() => partners.reduce((t, p) => {
    const b = balanceOf(p.id);
    return { advance: t.advance + Number(b.advance_balance), owed: t.owed + Number(b.amount_due) };
  }, { advance: 0, owed: 0 }), [partners, balances]);

  const [entryFor, setEntryFor] = useState<Partner | null>(null);
  const [settleFor, setSettleFor] = useState<Partner | null>(null);
  const [ledgerFor, setLedgerFor] = useState<Partner | null>(null);

  return (
    <PageFrame embedded={embedded}>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground flex items-center gap-3">
            <Bike className="h-8 w-8" /> Delivery Partner Advances
          </h1>
          <p className="text-muted-foreground mt-1">
            Advance held by each delivery person and what is owed to them. For tracking only: record
            delivery payments in the Expenses tab, using the full amount for the days.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Advance held by partners</p>
            <p className="text-2xl font-bold">{rupee(totals.advance)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Owed to partners</p>
            <p className={`text-2xl font-bold ${totals.owed > 0 ? 'text-destructive' : ''}`}>{rupee(totals.owed)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 space-y-2">
            <p className="text-xs text-muted-foreground">Add a delivery person</p>
            <div className="flex gap-2">
              <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Input placeholder="Phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="w-32" />
              <Button size="icon" onClick={() => addPartner.mutate()} disabled={addPartner.isPending}><Plus className="h-4 w-4" /></Button>
            </div>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Delivery partners</CardTitle>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} /> Show inactive
            </label>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : shown.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No delivery partners yet. Add one above.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Partner</TableHead>
                      <TableHead className="text-right">Advance held</TableHead>
                      <TableHead className="text-right">Owed to partner</TableHead>
                      <TableHead className="text-right">Closing balance</TableHead>
                      <TableHead>Delivery paid up to</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((p) => {
                      const b = balanceOf(p.id);
                      const adv = Number(b.advance_balance);
                      const owed = Number(b.amount_due);
                      return (
                        <TableRow key={p.id} className={p.is_active ? '' : 'opacity-60'}>
                          <TableCell>
                            <p className="font-medium">{p.name}</p>
                            {p.phone && <p className="text-xs text-muted-foreground">{p.phone}</p>}
                            {!p.is_active && <Badge variant="outline" className="text-xs mt-1">Inactive</Badge>}
                          </TableCell>
                          <TableCell className="text-right">{rupee(adv)}</TableCell>
                          <TableCell className={`text-right ${owed > 0 ? 'text-destructive font-medium' : ''}`}>{rupee(owed)}</TableCell>
                          <TableCell className="text-right text-sm">{closingText({ advanceHeld: adv, owed, net: adv - owed })}</TableCell>
                          <TableCell className="text-sm">{b.settled_up_to ? fmtDay(b.settled_up_to) : '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 flex-wrap">
                              <Button size="sm" variant="outline" onClick={() => setEntryFor(p)}><Plus className="h-4 w-4 mr-1" />Entry</Button>
                              <Button size="sm" onClick={() => setSettleFor(p)}><Wallet className="h-4 w-4 mr-1" />Settle days</Button>
                              <Button size="sm" variant="outline" onClick={() => setLedgerFor(p)}><BookOpen className="h-4 w-4 mr-1" />Ledger</Button>
                              <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate(p)}>{p.is_active ? 'Deactivate' : 'Activate'}</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {entryFor && <EntryDialog partner={entryFor} balance={balanceOf(entryFor.id)} today={today} onClose={() => setEntryFor(null)} onDone={refresh} />}
      {settleFor && <SettleDialog partner={settleFor} balance={balanceOf(settleFor.id)} today={today} onClose={() => setSettleFor(null)} onDone={refresh} />}
      {ledgerFor && <LedgerDialog partner={ledgerFor} today={today} onClose={() => setLedgerFor(null)} onChanged={refresh} />}
    </PageFrame>
  );
}

// One ledger entry of any kind.
function EntryDialog({ partner, balance, today, onClose, onDone }: {
  partner: Partner; balance: Balance; today: string; onClose: () => void; onDone: () => void;
}) {
  const [type, setType] = useState<EntryType>(Number(balance.advance_balance) === 0 && Number(balance.amount_due) === 0 ? 'opening' : 'advance');
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [notes, setNotes] = useState('');
  const held = Number(balance.advance_balance) || 0;

  const save = useMutation({
    mutationFn: async () => {
      if (!(n(amount) > 0)) throw new Error('Enter an amount above 0');
      if (!date) throw new Error('Pick the date');
      if (type === 'recovery' && n(amount) > held + 0.001) throw new Error(`${partner.name} holds only ${rupee(held)} of advance`);
      if (type === 'charge' && daysBetween(from, to) === 0) throw new Error('Pick the delivery days this covers');
      const { error } = await db.from('partner_ledger').insert({
        partner_id: partner.id, entry_type: type, amount: n(amount), entry_date: date, notes: notes.trim() || null,
        period_from: type === 'charge' ? from : null, period_to: type === 'charge' ? to : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${ENTRY_LABEL[type]} recorded for ${partner.name}`); onDone(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New entry: {partner.name}</DialogTitle>
          <DialogDescription>Advance held {rupee(held)} · owed {rupee(Number(balance.amount_due) || 0)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Entry</Label>
            <Select value={type} onValueChange={(v) => setType(v as EntryType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ENTRY_LABEL) as EntryType[]).map((t) => <SelectItem key={t} value={t}>{ENTRY_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Amount (₹)</Label><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          </div>
          {type === 'charge' && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Delivery from</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label>to</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
          )}
          <div><Label>Remarks</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
          <p className="text-xs text-muted-foreground">
            {type === 'opening' && 'Advance the partner already held when you started tracking.'}
            {type === 'advance' && 'More money given in advance. Not an expense.'}
            {type === 'charge' && 'What the partner earned for these days. Record the same amount in Expenses.'}
            {type === 'recovery' && 'Taken out of the advance against what is owed.'}
            {type === 'payment' && 'Cash or transfer paid to the partner.'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Delivery days, deduction and payment in one go, with the message to send.
function SettleDialog({ partner, balance, today, onClose, onDone }: {
  partner: Partner; balance: Balance; today: string; onClose: () => void; onDone: () => void;
}) {
  const held = Number(balance.advance_balance) || 0;
  const priorOwed = Math.max(0, Number(balance.amount_due) || 0);
  const [from, setFrom] = useState(balance.settled_up_to && balance.settled_up_to < today ? nextDay(balance.settled_up_to) : today);
  const [to, setTo] = useState(today);
  const [charge, setCharge] = useState('');
  const [recovery, setRecovery] = useState('');
  const [payment, setPayment] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState<{ message: string; charge: number } | null>(null);

  const days = daysBetween(from, to);
  const suggested = Math.max(0, priorOwed + n(charge) - n(recovery));
  const pay = payment === null ? suggested : n(payment);
  const owedAfter = priorOwed + n(charge) - n(recovery) - pay;
  const advanceAfter = held - n(recovery);
  const summary: PeriodSummary = {
    from, to,
    opening: { advanceHeld: held, owed: priorOwed, net: held - priorOwed },
    openingEntered: 0, additionalAdvance: 0,
    charges: n(charge), days, deducted: n(recovery), paid: pay,
    closing: { advanceHeld: advanceAfter, owed: owedAfter, net: advanceAfter - owedAfter },
    rows: [],
  };
  const message = whatsappMessage(partner.name, summary);

  const save = useMutation({
    mutationFn: async () => {
      if (days === 0) throw new Error('Pick the delivery days being settled');
      if (!(n(charge) > 0) && !(n(recovery) > 0) && !(pay > 0)) throw new Error('Enter the amount for these days');
      if (n(recovery) > held + 0.001) throw new Error(`${partner.name} holds only ${rupee(held)} of advance`);
      if (owedAfter < -0.001) throw new Error('That pays more than is owed. Lower the amount paid, or record the extra as an advance.');
      const { error } = await db.rpc('settle_delivery_partner', {
        p_partner_id: partner.id, p_from: from, p_to: to, p_charge: n(charge),
        p_recovery: n(recovery), p_payment: pay, p_entry_date: today, p_notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${partner.name} settled`); onDone(); setDone({ message, charge: n(charge) }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Settle delivery days: {partner.name}</DialogTitle></DialogHeader>
        {done ? (
          <div className="space-y-3">
            {done.charge > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Now record <b>{rupee(done.charge)}</b> in Expenses (Delivery, {partner.name}): the full amount for these days,
                including what came out of the advance.{' '}
                <Link to="/admin/expenses" className="underline" onClick={onClose}>Open Expenses</Link>
              </div>
            )}
            <p className="text-sm text-muted-foreground">Send this to {partner.name}:</p>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm font-sans">{done.message}</pre>
            <DialogFooter className="gap-2">
              {partner.phone && (
                <Button variant="outline" asChild>
                  <a href={waLink(partner.phone, done.message)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</a>
                </Button>
              )}
              <Button variant="outline" onClick={() => copyText(done.message)}><Copy className="h-4 w-4 mr-1" />Copy</Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-3 text-sm grid grid-cols-2 gap-1">
              <span className="text-muted-foreground">Advance held</span><span className="text-right font-medium">{rupee(held)}</span>
              {priorOwed > 0 && (<><span className="text-muted-foreground">Already owed</span><span className="text-right font-medium">{rupee(priorOwed)}</span></>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Delivery from</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label>to</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">{days > 0 ? `${days} day${days === 1 ? '' : 's'}` : 'The end date is before the start date'}</p>
            <div><Label>Amount for these days (₹)</Label><Input type="number" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} autoFocus /></div>
            <div><Label>Deduct from advance (₹)</Label><Input type="number" inputMode="decimal" value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="0" /></div>
            <div>
              <Label>Amount paid now (₹)</Label>
              <Input type="number" inputMode="decimal" value={payment ?? String(suggested)} onChange={(e) => setPayment(e.target.value)} />
              {owedAfter > 0.001 && <p className="text-xs text-amber-700 mt-1">{rupee(owedAfter)} will stay owed to {partner.name}.</p>}
            </div>
            <div><Label>Remarks</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Message preview</p>
              <pre className="whitespace-pre-wrap rounded-md border p-3 text-sm font-sans">{message}</pre>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Full history with running balances for a date range, shareable and downloadable.
function LedgerDialog({ partner, today, onClose, onChanged }: {
  partner: Partner; today: string; onClose: () => void; onChanged: () => void;
}) {
  const { data: entries = [], isLoading } = useLedger(partner.id);
  const first = entries[0]?.entry_date;
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState(today);
  const fromDate = from || first || `${today.slice(0, 7)}-01`;
  const s = useMemo(() => summarise(entries, fromDate, to), [entries, fromDate, to]);
  const message = whatsappMessage(partner.name, s);
  const [deleting, setDeleting] = useState<LedgerEntry | null>(null);

  const remove = useMutation({
    mutationFn: async () => {
      if (!deleting) return;
      const { error } = await db.from('partner_ledger').delete().eq('id', deleting.id);
      if (error) throw error;
    },
    onSuccess: () => { setDeleting(null); onChanged(); toast.success('Entry removed (kept in the audit log)'); },
    onError: (e: any) => toast.error(e.message),
  });

  const download = async () => {
    try {
      await writeExcelFile(`${partner.name} ledger ${fmtDay(s.from)} to ${fmtDay(s.to)}.xlsx`, [
        { name: 'Statement', data: statementRows(s) },
        {
          name: 'Summary', data: [
            { Item: 'Delivery partner', Value: partner.name },
            { Item: 'Period', Value: `${fmtDay(s.from)} to ${fmtDay(s.to)}` },
            { Item: 'Advance opening balance', Value: s.opening.advanceHeld + s.openingEntered },
            { Item: 'Owed to partner at start', Value: s.opening.owed },
            { Item: 'Additional advance', Value: s.additionalAdvance },
            { Item: `Amount for delivery (${s.days} days)`, Value: s.charges },
            { Item: 'Amount deducted', Value: s.deducted },
            { Item: 'Amount paid', Value: s.paid },
            { Item: 'Advance held at end', Value: s.closing.advanceHeld },
            { Item: 'Owed to partner at end', Value: s.closing.owed },
            { Item: 'Closing balance', Value: closingText(s.closing) },
          ],
        },
      ]);
    } catch (e: any) {
      toast.error(`Couldn't create the file: ${e.message}`);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[min(96vw,1000px)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{partner.name}: ledger</DialogTitle>
          <DialogDescription>Every entry with the balance after it. Entries aren't edited; remove a wrong one and add it again.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">From</Label><Input type="date" className="h-9" value={fromDate} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="ml-auto flex flex-wrap gap-2">
            {partner.phone && (
              <Button size="sm" variant="outline" asChild>
                <a href={waLink(partner.phone, message)} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-1" />Share via WhatsApp</a>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => copyText(message)}><Copy className="h-4 w-4 mr-1" />Copy summary</Button>
            <Button size="sm" variant="outline" onClick={download} disabled={isLoading}><Download className="h-4 w-4 mr-1" />Statement</Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Advance at start</p><p className="font-medium">{rupee(s.opening.advanceHeld + s.openingEntered)}</p></div>
              <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Delivery ({s.days} days)</p><p className="font-medium">{rupee(s.charges)}</p></div>
              <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Deducted · Paid</p><p className="font-medium">{rupee(s.deducted)} · {rupee(s.paid)}</p></div>
              <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Closing balance</p><p className="font-medium">{closingText(s.closing)}</p></div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead className="text-right">Advance given</TableHead>
                    <TableHead className="text-right">Delivery</TableHead>
                    <TableHead className="text-right">Deducted</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Advance held</TableHead>
                    <TableHead className="text-right">Owed</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/40">
                    <TableCell className="text-xs">{fmtDay(s.from)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">Balance brought forward</TableCell>
                    <TableCell colSpan={4} />
                    <TableCell className="text-right text-sm">{rupee(s.opening.advanceHeld)}</TableCell>
                    <TableCell className="text-right text-sm">{rupee(s.opening.owed)}</TableCell>
                    <TableCell />
                  </TableRow>
                  {s.rows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-sm text-muted-foreground text-center">No entries in this period.</TableCell></TableRow>
                  )}
                  {s.rows.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm whitespace-nowrap">{fmtDay(e.entry_date)}</TableCell>
                      <TableCell className="text-sm">
                        {ENTRY_LABEL[e.entry_type]}
                        {e.entry_type === 'charge' && e.period_from && e.period_to && (
                          <span className="block text-xs text-muted-foreground">{fmtDay(e.period_from)} to {fmtDay(e.period_to)}</span>
                        )}
                        {e.notes && <span className="block text-xs text-muted-foreground">{e.notes}</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">{e.entry_type === 'advance' || e.entry_type === 'opening' ? rupee(e.amount) : ''}</TableCell>
                      <TableCell className="text-right text-sm">{e.entry_type === 'charge' ? rupee(e.amount) : ''}</TableCell>
                      <TableCell className="text-right text-sm">{e.entry_type === 'recovery' ? rupee(e.amount) : ''}</TableCell>
                      <TableCell className="text-right text-sm">{e.entry_type === 'payment' ? rupee(e.amount) : ''}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{rupee(e.advanceHeld)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{rupee(e.owed)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Remove this entry" onClick={() => setDeleting(e)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">WhatsApp summary</p>
              <pre className="whitespace-pre-wrap rounded-md border p-3 text-sm font-sans">{message}</pre>
            </div>
          </>
        )}

        <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Remove this entry?</DialogTitle>
              <DialogDescription>
                {deleting && `${ENTRY_LABEL[deleting.entry_type]} of ${rupee(deleting.amount)} on ${fmtDay(deleting.entry_date)}. Balances are recalculated; the removal is kept in the audit log.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>Remove</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
