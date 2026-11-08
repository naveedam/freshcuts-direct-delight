// Delivery partner advance ledger: running balances, period summaries and the WhatsApp message.
// Kept apart from Expenses on purpose: nothing here is an expense.
//
//   opening   advance already held when tracking started -> advance held +
//   advance   additional advance given                   -> advance held +
//   charge    amount earned for delivery days            -> owed to partner +
//   recovery  amount deducted from the advance           -> advance held -, owed -
//   payment   amount paid to the partner                 -> owed -
// Net position = advance held - owed (positive: the partner holds our money).

export type EntryType = 'opening' | 'advance' | 'charge' | 'recovery' | 'payment';

export interface LedgerEntry {
  id: string;
  entry_date: string;
  entry_type: EntryType;
  amount: number;
  period_from: string | null;
  period_to: string | null;
  notes: string | null;
  created_at?: string | null;
}

export interface LedgerRow extends LedgerEntry {
  advanceHeld: number; // after this entry
  owed: number;        // after this entry
}

export interface Balances {
  advanceHeld: number;
  owed: number;
  net: number;
}

export interface PeriodSummary {
  from: string;
  to: string;
  opening: Balances;          // before `from`
  openingEntered: number;     // opening balances recorded inside the period
  additionalAdvance: number;
  charges: number;
  days: number;               // delivery days covered by the charges
  deducted: number;
  paid: number;
  closing: Balances;          // after `to`
  rows: LedgerRow[];          // entries inside the period, with running balances
}

export const ENTRY_LABEL: Record<EntryType, string> = {
  opening: 'Opening advance balance',
  advance: 'Additional advance',
  charge: 'Amount for delivery',
  recovery: 'Amount deducted',
  payment: 'Amount paid',
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function sortEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) =>
    a.entry_date.localeCompare(b.entry_date) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

function apply(b: { advanceHeld: number; owed: number }, e: LedgerEntry) {
  const amt = Number(e.amount) || 0;
  switch (e.entry_type) {
    case 'opening':
    case 'advance': b.advanceHeld += amt; break;
    case 'charge': b.owed += amt; break;
    case 'recovery': b.advanceHeld -= amt; b.owed -= amt; break;
    case 'payment': b.owed -= amt; break;
  }
}

const balances = (b: { advanceHeld: number; owed: number }): Balances =>
  ({ advanceHeld: r2(b.advanceHeld), owed: r2(b.owed), net: r2(b.advanceHeld - b.owed) });

// Every entry with the balances after it, oldest first.
export function runningLedger(entries: LedgerEntry[]): LedgerRow[] {
  const b = { advanceHeld: 0, owed: 0 };
  return sortEntries(entries).map((e) => {
    apply(b, e);
    return { ...e, amount: Number(e.amount), advanceHeld: r2(b.advanceHeld), owed: r2(b.owed) };
  });
}

function daySpan(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let i = 0; d <= end && i < 400; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function summarise(entries: LedgerEntry[], from: string, to: string): PeriodSummary {
  const all = runningLedger(entries);
  const before = { advanceHeld: 0, owed: 0 };
  all.filter((e) => e.entry_date < from).forEach((e) => apply(before, e));
  const rows = all.filter((e) => e.entry_date >= from && e.entry_date <= to);
  const after = { ...before };
  rows.forEach((e) => apply(after, e));
  const sum = (t: EntryType) => r2(rows.filter((e) => e.entry_type === t).reduce((s, e) => s + e.amount, 0));
  const days = new Set<string>();
  rows.filter((e) => e.entry_type === 'charge').forEach((e) => {
    if (e.period_from && e.period_to && e.period_to >= e.period_from) daySpan(e.period_from, e.period_to).forEach((d) => days.add(d));
    else days.add(e.entry_date);
  });
  return {
    from, to,
    opening: balances(before),
    openingEntered: sum('opening'),
    additionalAdvance: sum('advance'),
    charges: sum('charge'),
    days: days.size,
    deducted: sum('recovery'),
    paid: sum('payment'),
    closing: balances(after),
    rows,
  };
}

export function rupee(n: number): string {
  const v = r2(n);
  return `₹${Number.isInteger(v) ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDay(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}-${MONTHS[Number(m) - 1]}-${y.slice(2)}`;
}

export function closingText(b: Balances): string {
  if (Math.abs(b.net) < 0.005) return '₹0 (all square)';
  return b.net > 0 ? `${rupee(b.net)} (advance with you)` : `${rupee(-b.net)} (due to you)`;
}

// The message sent to the partner.
export function whatsappMessage(name: string, s: PeriodSummary): string {
  const openingAdvance = s.opening.advanceHeld + s.openingEntered;
  const lines = [
    `*FreshCuts: delivery ledger*`,
    `${name}`,
    `${fmtDay(s.from)} to ${fmtDay(s.to)}`,
    '',
    `Advance opening balance - ${rupee(openingAdvance)}`,
  ];
  if (s.additionalAdvance > 0) lines.push(`Additional advance - ${rupee(s.additionalAdvance)}`);
  if (s.opening.owed > 0.005) lines.push(`Balance due to you before this period - ${rupee(s.opening.owed)}`);
  lines.push(
    `Amount for ${s.days} day${s.days === 1 ? '' : 's'} - ${rupee(s.charges)}`,
    `Amount deducted - ${rupee(s.deducted)}`,
    `Amount paid - ${rupee(s.paid)}`,
    '',
    `Advance amount with you - ${rupee(s.closing.advanceHeld)}`,
  );
  if (Math.abs(s.closing.owed) > 0.005) lines.push(`Balance due to you - ${rupee(s.closing.owed)}`);
  lines.push(`Closing balance - ${closingText(s.closing)}`);
  return lines.join('\n');
}

// Rows for the downloadable statement.
export function statementRows(s: PeriodSummary): Record<string, unknown>[] {
  const opening: Record<string, unknown> = {
    Date: fmtDay(s.from), Entry: 'Balance brought forward', Period: '',
    'Additional advance': '', 'Amount for delivery': '', 'Amount deducted': '', 'Amount paid': '',
    'Advance held': s.opening.advanceHeld, 'Owed to partner': s.opening.owed, Remarks: '',
  };
  return [opening, ...s.rows.map((e) => ({
    Date: fmtDay(e.entry_date),
    Entry: ENTRY_LABEL[e.entry_type],
    Period: e.period_from && e.period_to ? `${fmtDay(e.period_from)} to ${fmtDay(e.period_to)}` : '',
    'Additional advance': e.entry_type === 'advance' || e.entry_type === 'opening' ? e.amount : '',
    'Amount for delivery': e.entry_type === 'charge' ? e.amount : '',
    'Amount deducted': e.entry_type === 'recovery' ? e.amount : '',
    'Amount paid': e.entry_type === 'payment' ? e.amount : '',
    'Advance held': e.advanceHeld,
    'Owed to partner': e.owed,
    Remarks: e.notes || '',
  }))];
}
