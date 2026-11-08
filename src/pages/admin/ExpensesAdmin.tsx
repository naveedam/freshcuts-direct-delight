import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageFrame } from '@/components/admin/TabbedAdminPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/currency';
import { format } from 'date-fns';
import { Plus, Trash2, Loader2, IndianRupee, Download } from 'lucide-react';
import { writeExcelFile } from '@/lib/excel-utils';
import { istDateString } from '@/lib/live-rate';

const CATEGORIES = [
  { value: 'Delivery', label: 'Delivery', subCategories: ['Aslam', 'Rapido', 'Porter', 'Uber Courier', 'Uncle Delivery', 'Other'] },
  { value: 'Packaging', label: 'Packaging', subCategories: ['Bags', 'Boxes', 'Labels', 'Other'] },
  { value: 'Marketing', label: 'Marketing', subCategories: ['WhatsApp', 'Printing', 'Other'] },
  { value: 'Utilities', label: 'Utilities', subCategories: ['Electricity', 'Water', 'Rent', 'Phone', 'Internet', 'Other'] },
  { value: 'Miscellaneous', label: 'Miscellaneous', subCategories: ['Other'] },
];

// How an expense counts towards profit. Spread types are shared out over a period, so a bulk
// purchase or a monthly bill doesn't make the day it's paid look like a loss.
const EXPENSE_TYPES = [
  { value: 'daily', label: 'Daily running cost', hint: 'Counted on the day (delivery, ice, fuel)' },
  { value: 'packaging', label: 'Packaging stock', hint: 'Boxes, covers, labels: spread over the period they last' },
  { value: 'overhead', label: 'Fixed overhead', hint: 'Electricity, water, rent, internet: spread over the period covered' },
  { value: 'capital', label: 'Capital purchase', hint: 'Freezer, scale: left out of daily profit' },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(EXPENSE_TYPES.map((t) => [t.value, t.label]));

function monthBounds(date: string): { from: string; to: string } {
  const [y, m] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${date.slice(0, 7)}-01`, to: `${date.slice(0, 7)}-${String(last).padStart(2, '0')}` };
}

const PAID_BY = [
  { value: 'bank', label: 'FreshCuts Bank Account' },
  { value: 'out_of_pocket', label: 'Out of Pocket (Reimbursable)' },
];

export default function ExpensesAdmin({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const today = istDateString();

  const [date, setDate] = useState(today);
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('bank');
  const [payee, setPayee] = useState('');
  const [notes, setNotes] = useState('');
  const [expenseType, setExpenseType] = useState('daily');
  const [spreadFrom, setSpreadFrom] = useState('');
  const [spreadTo, setSpreadTo] = useState('');
  const [filterMonth, setFilterMonth] = useState(today.slice(0, 7));
  const [filterCategory, setFilterCategory] = useState('all');

  // The last 12 months, newest first.
  const recentMonths = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const [y, m] = today.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return { value: d.toISOString().slice(0, 7), label: d.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }), [today]);

  const subCategories = CATEGORIES.find(c => c.value === category)?.subCategories || [];

  const { data: expenses, isLoading } = useQuery({
    queryKey: ['expenses', filterMonth],
    queryFn: async () => {
      const [year, month] = filterMonth.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', filterMonth + '-01')
        .lte('expense_date', filterMonth + '-' + String(lastDay).padStart(2, '0'))
        .order('expense_date', { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!category || !amount || parseFloat(amount) <= 0) throw new Error('Category and amount are required');
      const spread = expenseType === 'packaging' || expenseType === 'overhead' || (spreadFrom && spreadTo);
      if (spread && (!spreadFrom || !spreadTo)) throw new Error('Pick the period this expense covers');
      if (spread && spreadTo < spreadFrom) throw new Error('The period ends before it starts');
      const { error } = await supabase.from('expenses').insert({
        expense_type: expenseType,
        spread_from: spread && expenseType !== 'capital' ? spreadFrom : null,
        spread_to: spread && expenseType !== 'capital' ? spreadTo : null,
        expense_date: date,
        category,
        sub_category: subCategory || null,
        amount: parseFloat(amount),
        paid_by: paidBy,
        payee: payee || null,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense recorded');
      setAmount('');
      setPayee('');
      setNotes('');
      setSubCategory('');
      setSpreadFrom('');
      setSpreadTo('');
      queryClient.invalidateQueries({ queryKey: ['expense-counted'] });
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Expense deleted');
    },
  });

  // What the month's expenses count for in profit (spread costs shared out by day; capital excluded).
  const { data: countedThisMonth } = useQuery({
    queryKey: ['expense-counted', filterMonth],
    queryFn: async () => {
      const { from, to } = monthBounds(`${filterMonth}-01`);
      const { data, error } = await (supabase as any).rpc('expense_cost_between', { p_from: from, p_to: to });
      if (error) throw error;
      return Number(data) || 0;
    },
  });

  const filtered = useMemo(() => {
    if (!expenses) return [];
    if (filterCategory === 'all') return expenses;
    return expenses.filter((e: any) => e.category === filterCategory);
  }, [expenses, filterCategory]);

  const stats = useMemo(() => {
    if (!expenses) return null;
    const total = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
    const bank = expenses.filter((e: any) => e.paid_by === 'bank').reduce((s: number, e: any) => s + Number(e.amount), 0);
    const oop = expenses.filter((e: any) => e.paid_by === 'out_of_pocket').reduce((s: number, e: any) => s + Number(e.amount), 0);
    const byCat: Record<string, number> = {};
    expenses.forEach((e: any) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
    return { total, bank, oop, byCat };
  }, [expenses]);

  const handleExport = () => {
    if (!filtered.length) { toast.error('No expenses to export'); return; }
    writeExcelFile('Expenses_' + filterMonth + '.xlsx', [{
      name: 'Expenses',
      data: filtered.map((e: any) => ({
        Date: format(new Date(e.expense_date), 'dd MMM yyyy'),
        Category: e.category,
        'Sub Category': e.sub_category || '',
        Amount: Number(e.amount),
        Type: TYPE_LABEL[e.expense_type] || 'Daily running cost',
        'Spread over': e.spread_from ? `${e.spread_from} to ${e.spread_to}` : '',
        'Paid By': e.paid_by === 'bank' ? 'FreshCuts Bank' : 'Out of Pocket',
        Payee: e.payee || '',
        Notes: e.notes || '',
      }))
    }]);
  };

  return (
    <PageFrame embedded={embedded}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold">Expenses</h1>
            <p className="text-muted-foreground">Track operating expenses for FreshCuts Daily</p>
          </div>
          <Button variant="outline" onClick={handleExport} disabled={!filtered.length}>
            <Download className="h-4 w-4 mr-2" /> Export Excel
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" /> Record Expense
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Date</p>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Category *</p>
                <Select value={category} onValueChange={v => {
                  setCategory(v); setSubCategory('');
                  // Sensible default type for the category; can still be changed.
                  const t = v === 'Packaging' ? 'packaging' : v === 'Utilities' ? 'overhead' : 'daily';
                  setExpenseType(t);
                  if (t !== 'daily') { const b = monthBounds(date || today); setSpreadFrom(b.from); setSpreadTo(b.to); }
                  else { setSpreadFrom(''); setSpreadTo(''); }
                }}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Sub Category</p>
                <Select value={subCategory} onValueChange={setSubCategory} disabled={!category}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {subCategories.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Amount (Rs) *</p>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" min="0" step="0.01" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Type</p>
                <Select value={expenseType} onValueChange={(v) => {
                  setExpenseType(v);
                  if ((v === 'packaging' || v === 'overhead') && !spreadFrom) {
                    const { from, to } = monthBounds(date || today);
                    setSpreadFrom(from); setSpreadTo(to);
                  }
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {expenseType !== 'capital' && (
                <div className="md:col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">
                    Spread over {expenseType === 'daily' ? '(optional, e.g. two days paid together)' : '*'}
                  </p>
                  <div className="flex items-center gap-2">
                    <Input type="date" value={spreadFrom} onChange={(e) => setSpreadFrom(e.target.value)} />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input type="date" value={spreadTo} onChange={(e) => setSpreadTo(e.target.value)} />
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Paid By</p>
                <Select value={paidBy} onValueChange={setPaidBy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAID_BY.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Payee</p>
                <Input value={payee} onChange={e => setPayee(e.target.value)} placeholder="e.g. Aslam, Amazon" />
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional description" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{EXPENSE_TYPES.find((t) => t.value === expenseType)?.hint}</p>
            {category === 'Delivery' && (
              <p className="text-xs text-amber-700 mt-1">
                Delivery partners: enter the full amount for the days, including any part taken from their advance.
                Advances themselves are tracked in the Delivery Partner Advances tab, not here.
              </p>
            )}
            <Button
              className="mt-3"
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !category || !amount}
            >
              {addMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add Expense
            </Button>
          </CardContent>
        </Card>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Paid this month</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(stats.total)}</p>
                <p className="text-xs text-muted-foreground">
                  Counted in profit: {formatCurrency(countedThisMonth ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">From Bank</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.bank)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Out of Pocket</p>
                <p className="text-2xl font-bold text-amber-600">{formatCurrency(stats.oop)}</p>
                <p className="text-xs text-muted-foreground">Pending reimbursement</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Top Category</p>
                <p className="text-lg font-bold truncate">
                  {Object.entries(stats.byCat).sort((a, b) => b[1] - a[1])[0]?.[0] || '-'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(Object.entries(stats.byCat).sort((a, b) => b[1] - a[1])[0]?.[1] || 0)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {stats && Object.keys(stats.byCat).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <IndianRupee className="h-4 w-4" /> Category Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {Object.entries(stats.byCat).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                  <div key={cat} className="p-3 bg-muted/40 rounded-lg">
                    <p className="text-xs text-muted-foreground">{cat}</p>
                    <p className="text-lg font-bold">{formatCurrency(amt as number)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <CardTitle className="text-base">Expense Log</CardTitle>
              <div className="flex gap-3">
                <Select value={filterMonth} onValueChange={setFilterMonth}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {recentMonths.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-center text-muted-foreground">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">No expenses recorded for this period</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Payee</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Paid By</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{format(new Date(e.expense_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{e.category}</p>
                          {e.sub_category && <p className="text-xs text-muted-foreground">{e.sub_category}</p>}
                          {e.expense_type && e.expense_type !== 'daily' && (
                            <p className="text-xs text-muted-foreground">{TYPE_LABEL[e.expense_type]}</p>
                          )}
                          {e.spread_from && (
                            <p className="text-xs text-muted-foreground">
                              Spread {format(new Date(e.spread_from), 'dd MMM')} – {format(new Date(e.spread_to), 'dd MMM')}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{e.payee || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.notes || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={e.paid_by === 'out_of_pocket' ? 'outline' : 'secondary'} className="text-xs">
                          {e.paid_by === 'out_of_pocket' ? 'Out of Pocket' : 'Bank'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(Number(e.amount))}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(e.id)} disabled={deleteMutation.isPending}>
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PageFrame>
  );
}
