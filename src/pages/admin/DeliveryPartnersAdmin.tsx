import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Bike, Copy, HandCoins, History, Loader2, Plus, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { istDateString } from '@/lib/live-rate';

// Delivery partners who are paid per day and may hold a cash advance. "Settle" pays for a run of
// days, optionally taking part of it out of the advance; the cost lands in Expenses spread over
// those days, so daily profit stays right.

const db = supabase as any;

interface Partner {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
}
interface Balance {
  partner_id: string;
  advance_balance: number;
  amount_due: number;
  settled_up_to: string | null;
}
interface LedgerEntry {
  id: string;
  entry_date: string;
  entry_type: 'advance' | 'charge' | 'recovery' | 'payment';
  amount: number;
  period_from: string | null;
  period_to: string | null;
  notes: string | null;
}

const ENTRY_LABEL: Record<LedgerEntry['entry_type'], string> = {
  advance: 'Advance given',
  charge: 'Delivery charge',
  recovery: 'Deducted from advance',
  payment: 'Paid',
};

const n = (v: string) => (v.trim() === '' ? 0 : Number(v));
const inr = (v: number) => `₹${Math.round(v * 100) / 100}`;
function daysBetween(from: string, to: string): number {
  if (!from || !to || to < from) return 0;
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}
function nextDay(d: string): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}
const fmt = (d: string) => format(new Date(d), 'dd MMM');

export function settlementSummary(s: {
  opening: number; days: number; charge: number; recovery: number; payment: number;
}): string {
  return [
    `Advance opening balance - ${inr(s.opening)}`,
    `Amount for ${s.days} day${s.days === 1 ? '' : 's'} - ${inr(s.charge)}`,
    `Amount deducted - ${inr(s.recovery)}`,
    `Amount paid - ${inr(s.payment)}`,
    '',
    `Advance amount with you - ${inr(s.opening - s.recovery)}`,
  ].join('\n');
}

export default function DeliveryPartnersAdmin() {
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

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['delivery-partners'] });
    qc.invalidateQueries({ queryKey: ['partner-balances'] });
    qc.invalidateQueries({ queryKey: ['partner-ledger'] });
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['expense-counted'] });
    qc.invalidateQueries({ queryKey: ['admin'] });
  };

  // ---- add partner ----
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const addPartner = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error('Enter a name');
      const { error } = await db.from('delivery_partners').insert({ name: newName.trim(), phone: newPhone.trim() || null });
      if (error) throw new Error(error.code === '23505' ? 'A partner with that name already exists' : error.message);
    },
    onSuccess: () => { setNewName(''); setNewPhone(''); refresh(); toast.success('Partner added'); },
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
  const totals = useMemo(() => partners.reduce(
    (t, p) => { const b = balanceOf(p.id); return { advance: t.advance + Number(b.advance_balance), due: t.due + Number(b.amount_due) }; },
    { advance: 0, due: 0 },
  ), [partners, balances]);

  // ---- dialogs ----
  const [advanceFor, setAdvanceFor] = useState<Partner | null>(null);
  const [settleFor, setSettleFor] = useState<Partner | null>(null);
  const [ledgerFor, setLedgerFor] = useState<Partner | null>(null);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground flex items-center gap-3">
            <Bike className="h-8 w-8" /> Delivery Partners
          </h1>
          <p className="text-muted-foreground mt-1">Advances, day-wise settlements and what each partner holds.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Advances held by partners</p>
            <p className="text-2xl font-bold">{formatCurrency(totals.advance)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Still to pay partners</p>
            <p className={`text-2xl font-bold ${totals.due > 0 ? 'text-destructive' : ''}`}>{formatCurrency(totals.due)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 space-y-2">
            <p className="text-xs text-muted-foreground">Add a partner</p>
            <div className="flex gap-2">
              <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Input placeholder="Phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="w-32" />
              <Button size="icon" onClick={() => addPartner.mutate()} disabled={addPartner.isPending}><Plus className="h-4 w-4" /></Button>
            </div>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Partners</CardTitle>
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
                      <TableHead className="text-right">Due to partner</TableHead>
                      <TableHead>Settled up to</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.map((p) => {
                      const b = balanceOf(p.id);
                      return (
                        <TableRow key={p.id} className={p.is_active ? '' : 'opacity-60'}>
                          <TableCell>
                            <p className="font-medium">{p.name}</p>
                            {p.phone && <p className="text-xs text-muted-foreground">{p.phone}</p>}
                            {!p.is_active && <Badge variant="outline" className="text-xs mt-1">Inactive</Badge>}
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(Number(b.advance_balance))}</TableCell>
                          <TableCell className={`text-right ${Number(b.amount_due) > 0 ? 'text-destructive font-medium' : ''}`}>
                            {formatCurrency(Number(b.amount_due))}
                          </TableCell>
                          <TableCell className="text-sm">{b.settled_up_to ? format(new Date(b.settled_up_to), 'dd MMM yyyy') : '-'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 flex-wrap">
                              <Button size="sm" variant="outline" onClick={() => setAdvanceFor(p)}><HandCoins className="h-4 w-4 mr-1" />Advance</Button>
                              <Button size="sm" onClick={() => setSettleFor(p)}><Wallet className="h-4 w-4 mr-1" />Settle</Button>
                              <Button size="sm" variant="ghost" onClick={() => setLedgerFor(p)}><History className="h-4 w-4" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate(p)}>
                                {p.is_active ? 'Deactivate' : 'Activate'}
                              </Button>
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

      {advanceFor && (
        <AdvanceDialog partner={advanceFor} today={today} onClose={() => setAdvanceFor(null)} onDone={refresh} />
      )}
      {settleFor && (
        <SettleDialog partner={settleFor} balance={balanceOf(settleFor.id)} today={today}
          onClose={() => setSettleFor(null)} onDone={refresh} />
      )}
      {ledgerFor && <LedgerDialog partner={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </AdminLayout>
  );
}

function AdvanceDialog({ partner, today, onClose, onDone }: {
  partner: Partner; today: string; onClose: () => void; onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      if (!(n(amount) > 0)) throw new Error('Enter the advance amount');
      const { error } = await db.from('partner_ledger').insert({
        partner_id: partner.id, entry_type: 'advance', amount: n(amount), entry_date: date, notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`Advance recorded for ${partner.name}`); onDone(); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Give advance to {partner.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Amount (₹)</Label><Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
          <p className="text-xs text-muted-foreground">An advance isn't an expense; it's money the partner holds until it's deducted from their pay.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettleDialog({ partner, balance, today, onClose, onDone }: {
  partner: Partner; balance: Balance; today: string; onClose: () => void; onDone: () => void;
}) {
  const opening = Number(balance.advance_balance) || 0;
  const priorDue = Math.max(0, Number(balance.amount_due) || 0);
  const [from, setFrom] = useState(balance.settled_up_to && balance.settled_up_to < today ? nextDay(balance.settled_up_to) : today);
  const [to, setTo] = useState(today);
  const [charge, setCharge] = useState('');
  const [recovery, setRecovery] = useState('');
  const [payment, setPayment] = useState<string | null>(null); // null = follow the suggestion
  const [paidBy, setPaidBy] = useState('bank');
  const [notes, setNotes] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const days = daysBetween(from, to);
  const suggested = Math.max(0, priorDue + n(charge) - n(recovery));
  const pay = payment === null ? suggested : n(payment);
  const leftDue = priorDue + n(charge) - n(recovery) - pay;
  const summary = settlementSummary({ opening, days, charge: n(charge), recovery: n(recovery), payment: pay });

  const save = useMutation({
    mutationFn: async () => {
      if (days === 0) throw new Error('Pick the days being settled');
      if (!(n(charge) > 0) && !(n(recovery) > 0) && !(pay > 0)) throw new Error('Enter the amount for these days');
      if (n(recovery) > opening + 0.001) throw new Error(`${partner.name} only holds ${inr(opening)} of advance`);
      if (leftDue < -0.001) throw new Error('That pays more than is owed; reduce the amount paid or record an advance instead');
      const { error } = await db.rpc('settle_delivery_partner', {
        p_partner_id: partner.id, p_from: from, p_to: to, p_charge: n(charge),
        p_recovery: n(recovery), p_payment: pay, p_paid_by: paidBy, p_entry_date: today, p_notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${partner.name} settled`); onDone(); setDone(summary); },
    onError: (e: any) => toast.error(e.message),
  });

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('Copied, paste it in WhatsApp'); }
    catch { toast.error('Couldn’t copy; select the text instead'); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Settle {partner.name}</DialogTitle></DialogHeader>
        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Saved. Send this to {partner.name}:</p>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-sm font-sans">{done}</pre>
            <DialogFooter>
              {partner.phone && (
                <Button variant="outline" asChild>
                  <a href={`https://wa.me/${partner.phone.replace(/\D/g, '').replace(/^(?=\d{10}$)/, '91')}?text=${encodeURIComponent(done)}`} target="_blank" rel="noreferrer">WhatsApp</a>
                </Button>
              )}
              <Button variant="outline" onClick={() => copy(done)}><Copy className="h-4 w-4 mr-1" />Copy</Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md bg-muted p-3 text-sm grid grid-cols-2 gap-1">
              <span className="text-muted-foreground">Advance held</span><span className="text-right font-medium">{inr(opening)}</span>
              {priorDue > 0 && (<><span className="text-muted-foreground">Already owed</span><span className="text-right font-medium">{inr(priorDue)}</span></>)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">{days > 0 ? `${days} day${days === 1 ? '' : 's'}: ${fmt(from)} to ${fmt(to)}` : 'The end date is before the start date'}</p>
            <div><Label>Amount for these days (₹)</Label><Input type="number" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} autoFocus /></div>
            <div>
              <Label>Deduct from advance (₹)</Label>
              <Input type="number" inputMode="decimal" value={recovery} onChange={(e) => setRecovery(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Amount paid now (₹)</Label>
              <Input type="number" inputMode="decimal" value={payment ?? String(suggested)} onChange={(e) => setPayment(e.target.value)} />
              {Math.abs(leftDue) > 0.001 && leftDue > 0 && (
                <p className="text-xs text-amber-600 mt-1">{inr(leftDue)} will stay owed to {partner.name}.</p>
              )}
            </div>
            <div>
              <Label>Paid from</Label>
              <Select value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">FreshCuts Bank Account</SelectItem>
                  <SelectItem value="out_of_pocket">Out of Pocket (Reimbursable)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Message preview</p>
              <pre className="whitespace-pre-wrap rounded-md border p-3 text-sm font-sans">{summary}</pre>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save settlement</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LedgerDialog({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['partner-ledger', partner.id],
    queryFn: async () => {
      const { data, error } = await db.from('partner_ledger').select('*')
        .eq('partner_id', partner.id).order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data as LedgerEntry[];
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{partner.name}: history</DialogTitle></DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nothing recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Date</TableHead><TableHead>Entry</TableHead><TableHead className="text-right">Amount</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{format(new Date(e.entry_date), 'dd MMM yyyy')}</TableCell>
                  <TableCell className="text-sm">
                    {ENTRY_LABEL[e.entry_type]}
                    {e.period_from && e.entry_type === 'charge' && (
                      <span className="block text-xs text-muted-foreground">{fmt(e.period_from)} to {fmt(e.period_to!)}</span>
                    )}
                    {e.notes && <span className="block text-xs text-muted-foreground">{e.notes}</span>}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(e.amount))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
