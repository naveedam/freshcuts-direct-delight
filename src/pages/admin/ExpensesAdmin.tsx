import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
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

const CATEGORIES = [
  { value: 'Delivery', label: 'Delivery', subCategories: ['Aslam', 'Rapido', 'Porter', 'Uber Courier', 'Uncle Delivery', 'Other'] },
  { value: 'Packaging', label: 'Packaging', subCategories: ['Bags', 'Boxes', 'Labels', 'Other'] },
  { value: 'Marketing', label: 'Marketing', subCategories: ['WhatsApp', 'Printing', 'Other'] },
  { value: 'Utilities', label: 'Utilities', subCategories: ['Phone', 'Internet', 'Other'] },
  { value: 'Miscellaneous', label: 'Miscellaneous', subCategories: ['Other'] },
];

const PAID_BY = [
  { value: 'bank', label: 'FreshCuts Bank Account' },
  { value: 'out_of_pocket', label: 'Out of Pocket (Reimbursable)' },
];

export default function ExpensesAdmin() {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(today);
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('bank');
  const [payee, setPayee] = useState('');
  const [notes, setNotes] = useState('');
  const [filterMonth, setFilterMonth] = useState(today.slice(0, 7));
  const [filterCategory, setFilterCategory] = useState('all');

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
      const { error } = await supabase.from('expenses').insert({
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
        'Paid By': e.paid_by === 'bank' ? 'FreshCuts Bank' : 'Out of Pocket',
        Payee: e.payee || '',
        Notes: e.notes || '',
      }))
    }]);
  };

  return (
    <AdminLayout>
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
                <Select value={category} onValueChange={v => { setCategory(v); setSubCategory(''); }}>
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
            <Button
              className="mt-4"
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
                <p className="text-xs text-muted-foreground">Total Expenses</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(stats.total)}</p>
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
                    <SelectItem value="2026-04">April 2026</SelectItem>
                    <SelectItem value="2026-05">May 2026</SelectItem>
                    <SelectItem value="2026-06">June 2026</SelectItem>
                    <SelectItem value="2026-07">July 2026</SelectItem>
                    <SelectItem value="2026-08">August 2026</SelectItem>
                    <SelectItem value="2026-09">September 2026</SelectItem>
                    <SelectItem value="2026-10">October 2026</SelectItem>
                    <SelectItem value="2026-11">November 2026</SelectItem>
                    <SelectItem value="2026-12">December 2026</SelectItem>
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
    </AdminLayout>
  );
}
